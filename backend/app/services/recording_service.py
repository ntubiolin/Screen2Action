import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

import pyautogui
import sounddevice as sd
import numpy as np
from PIL import Image
import wave

from app.models.messages import RecordingSession

logger = logging.getLogger(__name__)


def _expand_home(p: str) -> str:
    if not p:
        return p
    if p.startswith('~'):
        return os.path.join(os.path.expanduser('~'), p[1:])
    return p


def _resolve_logs_dir() -> Path:
    """Resolve base logs directory to align with Electron (supports env override)."""
    env_dir = os.environ.get('S2A_LOGS_DIR', '').strip()
    if env_dir:
        p = Path(os.path.abspath(_expand_home(env_dir)))
        p.mkdir(parents=True, exist_ok=True)
        return p
    if sys.platform == 'darwin':  # type: ignore[name-defined]
        p = Path.home() / 'Library' / 'Application Support' / 'screen2action' / 'logs'
        p.mkdir(parents=True, exist_ok=True)
        return p
    if os.name == 'nt':
        # On Windows, fall back to %APPDATA%/screen2action/logs
        appdata = os.environ.get('APPDATA', str(Path.home() / 'AppData' / 'Roaming'))
        p = Path(appdata) / 'screen2action' / 'logs'
        p.mkdir(parents=True, exist_ok=True)
        return p
    # Linux/others
    p = Path.home() / '.local' / 'share' / 'screen2action' / 'logs'
    p.mkdir(parents=True, exist_ok=True)
    return p


def _resolve_recordings_dir() -> Path:
    # 1) Environment variable
    env_dir = os.environ.get('S2A_RECORDINGS_DIR', '').strip()
    if env_dir:
        resolved = Path(os.path.abspath(_expand_home(env_dir)))
        resolved.mkdir(parents=True, exist_ok=True)
        logger.info(f"Using recordings dir from env: {resolved}")
        return resolved

    # 2) config/app.json (try several plausible locations)
    here = Path(__file__).resolve()
    possible = [
        Path.cwd() / 'config' / 'app.json',                 # run from project root
        Path.cwd().parent / 'config' / 'app.json',          # run from backend/
        here.parents[3] / 'config' / 'app.json',            # backend/app/services -> config
        here.parents[4] / 'config' / 'app.json',            # alternative path
    ]
    for cfg in possible:
        try:
            if cfg.exists():
                with open(cfg, 'r') as f:
                    data = json.load(f)
                rec = (data or {}).get('recordingsDir', '').strip()
                if rec:
                    resolved = Path(os.path.abspath(_expand_home(rec)))
                    resolved.mkdir(parents=True, exist_ok=True)
                    logger.info(f"Using recordings dir from config {cfg}: {resolved}")
                    return resolved
        except Exception as e:
            logger.warning(f"Error reading config at {cfg}: {e}")

    # 3) Fallback to Documents/Screen2Action/recordings
    documents = Path.home() / 'Documents'
    fallback = documents / 'Screen2Action' / 'recordings'
    fallback.mkdir(parents=True, exist_ok=True)
    logger.info(f"Using fallback recordings dir: {fallback}")
    return fallback

class RecordingService:
    def __init__(self):
        self.is_recording = False
        self.current_session: Optional[RecordingSession] = None
        self.screenshot_task: Optional[asyncio.Task] = None
        self.audio_task: Optional[asyncio.Task] = None
        self.screenshot_interval = 10  # seconds
        # Use unified recordings directory
        self.recordings_dir = _resolve_recordings_dir()
        # NOTE: Frontend/main process now prefixes audio & markdown with YYYY_MM_DD_HH_mm_SS.
        # If backend parity is required for any future audio processing here, implement similarly.
        self.audio_sample_rate = 44100
        # Fallback sample rates to try if preferred rate fails (macOS CoreAudio commonly supports 48000)
        self._fallback_sample_rates = [48000, 44100, 32000]
        self.audio_chunk_seconds = 10
        self.audio_frames_per_chunk = self.audio_sample_rate * self.audio_chunk_seconds
        self._mic_buffers = []  # list[np.ndarray]
        self._sys_buffers = []  # list[np.ndarray]
        self._mic_stream = None
        self._sys_stream = None
        self._audio_chunk_index = 0
        self._audio_device_names = {"mic": None, "system": None}
        # Set a sensible default built‑in mic preference (case-insensitive match)
        self.preferred_mic_pattern: Optional[str] = "macbook pro microphone"
        self.preferred_sys_pattern: Optional[str] = None
        # Environment variable overrides or config could be added later
        self.websocket_client = None
        # Session-scoped logging handler
        self._session_log_handler: Optional[logging.Handler] = None
    
    def set_websocket_client(self, client):
        """Set the WebSocket client for communication with Electron"""
        self.websocket_client = client
    
    async def hide_floating_window(self):
        """Send message to hide floating window"""
        if self.websocket_client:
            try:
                await self.websocket_client.send_event('hide_floating_window', {})
                # Wait a bit for window to hide
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.warning(f"Failed to hide floating window: {e}")
    
    async def show_floating_window(self):
        """Send message to show floating window"""
        if self.websocket_client:
            try:
                await self.websocket_client.send_event('show_floating_window', {})
            except Exception as e:
                logger.warning(f"Failed to show floating window: {e}")
    
    async def start_recording(self, params: Dict[str, Any]) -> str:
        """Start a new recording session"""
        if self.is_recording:
            raise ValueError("Already recording")
        
        # Use session ID from Electron if provided, otherwise generate new one
        session_id = params.get("sessionId") or str(uuid.uuid4())
        session_dir = self.recordings_dir / session_id
        
        # Only create directories if they don't exist (Electron may have created them)
        session_dir.mkdir(parents=True, exist_ok=True)
        (session_dir / "screenshots").mkdir(exist_ok=True)
        (session_dir / "audio").mkdir(exist_ok=True)
        
        # Configure a session-scoped file handler for backend logs
        try:
            logs_base = _resolve_logs_dir()
            session_logs_dir = logs_base / 'sessions' / session_id
            session_logs_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            session_log_path = session_logs_dir / f"backend-{timestamp}.log"
            handler = logging.FileHandler(session_log_path)
            handler.setLevel(logging.INFO)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            # Attach to root so all logs propagate
            root_logger = logging.getLogger()
            root_logger.addHandler(handler)
            self._session_log_handler = handler
            logger.info(f"Attached session log handler: {session_log_path}")
        except Exception as e:
            logger.warning(f"Failed to attach session log handler: {e}")
        
        self.current_session = RecordingSession(
            id=session_id,
            start_time=datetime.now(),
            screen_id=params.get("screenId", "default")
        )
        
        # Save initial metadata
        self._save_metadata()
        
        # Start recording tasks
        self.is_recording = True
        self.screenshot_task = asyncio.create_task(self._screenshot_loop())
        self.audio_task = asyncio.create_task(self._audio_recording_loop())
        
        logger.info(f"Started recording session: {session_id}")
        return session_id
    
    async def stop_recording(self) -> Dict[str, Any]:
        """Stop the current recording session"""
        if not self.is_recording:
            raise ValueError("Not currently recording")
        
        self.is_recording = False
        
        # Cancel tasks
        if self.screenshot_task:
            self.screenshot_task.cancel()
        if self.audio_task:
            self.audio_task.cancel()
            try:
                await self.audio_task
            except asyncio.CancelledError:
                pass
        
        # Finalize audio (flush remaining buffers)
        try:
            await self._finalize_audio()
        except Exception as e:
            logger.error(f"Finalize audio error: {e}")
        
        # Update session metadata
        if self.current_session:
            self.current_session.end_time = datetime.now()
            self._save_metadata()
            
            result = {
                "session_id": self.current_session.id,
                "duration": (self.current_session.end_time - self.current_session.start_time).total_seconds(),
                "screenshots_count": len(self.current_session.screenshots),
                "notes_count": len(self.current_session.notes)
            }
            
            # Detach session log handler
            try:
                if self._session_log_handler:
                    root_logger = logging.getLogger()
                    root_logger.removeHandler(self._session_log_handler)
                    self._session_log_handler.close()
                    logger.info("Detached session log handler")
            except Exception as e:
                logger.warning(f"Failed to detach session log handler: {e}")
            finally:
                self._session_log_handler = None
            
            self.current_session = None
            logger.info(f"Stopped recording session: {result}")
            return result
        
        return {}
    
    async def _screenshot_loop(self):
        """Periodically capture screenshots"""
        while self.is_recording:
            try:
                await self._capture_screenshot()
                await asyncio.sleep(self.screenshot_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Screenshot capture error: {e}")
    
    async def _capture_screenshot(self):
        """Capture a single screenshot"""
        if not self.current_session:
            return
        
        try:
            # Capture screenshot
            screenshot = pyautogui.screenshot()
            # Milliseconds from start kept for ordering/metadata
            relative_ms = int((datetime.now() - self.current_session.start_time).total_seconds() * 1000)
            # Human-readable date-time prefix for filenames
            dt_now = datetime.now()
            datetime_prefix = dt_now.strftime('%Y_%m_%d_%H_%M_%S')
            
            session_dir = self.recordings_dir / self.current_session.id
            screenshots_dir = session_dir / "screenshots"
            
            # Build filenames with datetime prefix and timestamp suffix (matching frontend)
            full_filename = f"{datetime_prefix}_{relative_ms}_full.png"
            thumb_filename = f"{datetime_prefix}_{relative_ms}_thumb.jpg"
            full_path = screenshots_dir / full_filename
            thumb_path = screenshots_dir / thumb_filename
            
            # Save full screenshot
            screenshot.save(full_path)
            
            # Create and save thumbnail (convert RGBA to RGB for JPEG)
            thumbnail = screenshot.copy()
            thumbnail.thumbnail((320, 180), Image.Resampling.LANCZOS)
            # Convert RGBA to RGB if necessary
            if thumbnail.mode == 'RGBA':
                rgb_thumbnail = Image.new('RGB', thumbnail.size, (255, 255, 255))
                rgb_thumbnail.paste(thumbnail, mask=thumbnail.split()[3] if len(thumbnail.split()) > 3 else None)
                thumbnail = rgb_thumbnail
            thumbnail.save(thumb_path, "JPEG", quality=80)
            
            # Update session metadata (preserve old 'timestamp' key for compatibility)
            self.current_session.screenshots.append({
                "timestamp": relative_ms,  # legacy field name
                "relative_timestamp_ms": relative_ms,
                "datetime_prefix": datetime_prefix,
                "full_path": str(full_path),
                "thumb_path": str(thumb_path)
            })
            
            logger.debug(f"Captured screenshot {full_filename} (relative {relative_ms}ms)")
            
        except Exception as e:
            logger.error(f"Failed to capture screenshot: {e}")
    
    def list_audio_devices(self):
        try:
            devices = sd.query_devices()
            result = []
            for i, d in enumerate(devices):
                result.append({
                    'index': i,
                    'name': d.get('name'),
                    'max_input_channels': d.get('max_input_channels'),
                    'max_output_channels': d.get('max_output_channels')
                })
            return result
        except Exception as e:
            logger.error(f"list_audio_devices error: {e}")
            return []
    
    def set_preferred_devices(self, mic_pattern: Optional[str], sys_pattern: Optional[str]):
        # Only override if explicitly provided; keeps default MacBook Pro Microphone when None passed
        if mic_pattern is not None:
            self.preferred_mic_pattern = mic_pattern.lower() if mic_pattern else None
        if sys_pattern is not None:
            self.preferred_sys_pattern = sys_pattern.lower() if sys_pattern else None
        logger.info(f"Set preferred devices mic={self.preferred_mic_pattern} sys={self.preferred_sys_pattern}")
    
    async def _audio_recording_loop(self):
        """Record mic + system (BlackHole) + mixed track.
        Records one continuous audio file from start to end.
        Filenames: YYYY_MM_DD_HH_mm_SS_full_<track>.wav track in {mic, sys, mix}
        """
        if not self.current_session:
            return
        session_dir = self.recordings_dir / self.current_session.id / "audio"
        # Discover devices
        try:
            devices = sd.query_devices()
            mic_idx = None
            sys_idx = None
            
            # Print all available audio devices for debugging
            logger.info("=== Available Audio Devices ===")
            for i, d in enumerate(devices):
                if d.get('max_input_channels', 0) > 0:
                    logger.info(f"Device {i}: {d['name']} (inputs: {d.get('max_input_channels')}, outputs: {d.get('max_output_channels')})")
            
            for i, d in enumerate(devices):
                if d.get('max_input_channels', 0) > 0:
                    name_lower = d['name'].lower()
                    # Preferred matching takes precedence
                    if self.preferred_sys_pattern and self.preferred_sys_pattern in name_lower and sys_idx is None:
                        sys_idx = i; self._audio_device_names['system'] = d['name']
                    if self.preferred_mic_pattern and self.preferred_mic_pattern in name_lower and mic_idx is None:
                        mic_idx = i; self._audio_device_names['mic'] = d['name']
            # Fallback normal heuristic if still unset
            for i, d in enumerate(devices):
                if d.get('max_input_channels', 0) > 0:
                    name_lower = d['name'].lower()
                    if sys_idx is None and ('blackhole' in name_lower or 'loopback' in name_lower):
                        sys_idx = i; self._audio_device_names['system'] = d['name']
                    if mic_idx is None and 'blackhole' not in name_lower:
                        mic_idx = i; self._audio_device_names['mic'] = d['name']
            # Fallback if no mic found
            if mic_idx is None and sys_idx is not None:
                mic_idx = sys_idx
            if sys_idx is None:
                # Fallback: duplicate mic as system
                sys_idx = mic_idx
                if mic_idx is not None:
                    self._audio_device_names['system'] = self._audio_device_names['mic'] + ' (dup)'
            
            # Log device selection with BlackHole detection
            logger.info(f"=== Selected Audio Devices ===")
            logger.info(f"Microphone: {self._audio_device_names.get('mic', 'None')} (idx={mic_idx})")
            logger.info(f"System Audio: {self._audio_device_names.get('system', 'None')} (idx={sys_idx})")
            
            # Check if BlackHole is being used
            if self._audio_device_names.get('system') and 'blackhole' in self._audio_device_names['system'].lower():
                logger.info("✓ BlackHole device detected for system audio capture")
            else:
                logger.warning("⚠ BlackHole device NOT detected - system audio may not be captured properly")
                logger.warning("Please install BlackHole from https://github.com/ExistentialAudio/BlackHole")
        except Exception as e:
            logger.error(f"Audio device query failed: {e}")
            return
        if mic_idx is None:
            logger.warning("No audio input devices available; skipping audio recording")
            return

        loop = asyncio.get_event_loop()
        buffer_lock = asyncio.Lock()
        self._audio_chunk_index = 0
        start_time = datetime.now()

        def _mic_callback(indata, frames, time_info, status):  # noqa
            if status:
                logger.debug(f"Mic status: {status}")
            self._mic_buffers.append(indata.copy())

        def _sys_callback(indata, frames, time_info, status):  # noqa
            if status:
                logger.debug(f"Sys status: {status}")
            self._sys_buffers.append(indata.copy())

        # NEW: robust stream opening with fallback sample rates and partial success handling
        mic_stream = None
        sys_stream = None

        def _try_open(device_index: int, callback, label: str):
            """Attempt to open an InputStream with several sample rates.
            Returns (stream, samplerate_used) or (None, None) on failure."""
            if device_index is None:
                return None, None
            dev_info = None
            try:
                dev_info = sd.query_devices(device_index)
            except Exception:
                pass
            preferred_rates = []
            if dev_info:
                # Put device default first if available
                default_rate = int(dev_info.get('default_samplerate', 0) or 0)
                if default_rate:
                    preferred_rates.append(default_rate)
            preferred_rates += [r for r in self._fallback_sample_rates if r not in preferred_rates]
            last_err = None
            for rate in preferred_rates:
                try:
                    sd.check_input_settings(device=device_index, channels=1, samplerate=rate, dtype='float32')
                except Exception as ce:
                    last_err = ce
                    continue
                try:
                    stream = sd.InputStream(device=device_index, channels=1, callback=callback, samplerate=rate, dtype='float32')
                    stream.start()
                    logger.info(f"Opened {label} stream on device {device_index} @ {rate}Hz")
                    return stream, rate
                except Exception as e:
                    last_err = e
                    logger.warning(f"Failed opening {label} stream device={device_index} rate={rate}: {e}")
            if last_err:
                logger.error(f"Could not open {label} stream on device {device_index}: {last_err}")
            return None, None

        try:
            # Open mic first (hard requirement)
            self._mic_stream, mic_rate = _try_open(mic_idx, _mic_callback, 'mic')
            if self._mic_stream is None:
                logger.error("Aborting audio capture: microphone stream could not be started.")
                return
            # Choose session sample rate from mic stream (resampling skipped for simplicity)
            self.audio_sample_rate = mic_rate or self.audio_sample_rate
            # Open system stream if distinct and available
            if sys_idx is not None and sys_idx != mic_idx:
                self._sys_stream, sys_rate = _try_open(sys_idx, _sys_callback, 'system')
                if self._sys_stream is None:
                    logger.warning("Proceeding without separate system audio; will duplicate mic for system track.")
            else:
                self._sys_stream = None  # duplicate mic later
        except Exception as e:
            logger.error(f"Failed to start audio streams: {e}")
            return

        logger.info("Backend audio capture started (continuous recording for entire session)")

        try:
            while self.is_recording:
                await asyncio.sleep(1)
                # Accumulate only
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Audio recording error: {e}")
        finally:
            if self._mic_buffers or self._sys_buffers:
                await self._write_complete_audio(session_dir, start_time)
            try:
                if self._mic_stream:
                    self._mic_stream.stop(); self._mic_stream.close()
                if self._sys_stream:
                    self._sys_stream.stop(); self._sys_stream.close()
            except Exception:
                pass
            logger.info("Audio streams closed and complete audio files saved")

    async def _flush_audio_chunk(self, session_audio_dir: Path, start_time: datetime, allow_partial: bool = False):
        """Assemble and write one chunk for mic/sys/mix."""
        if not self._mic_buffers:
            return
        # Assemble mic
        mic_concat = np.concatenate(self._mic_buffers, axis=0)
        if not allow_partial and mic_concat.shape[0] < self.audio_frames_per_chunk:
            return
        use_frames = mic_concat.shape[0] if allow_partial else self.audio_frames_per_chunk
        mic_chunk = mic_concat[:use_frames]
        # Remainder
        remaining = mic_concat[use_frames:]
        self._mic_buffers = ([remaining] if remaining.size > 0 else [])
        # System (if duplicate, copy mic)
        if self._sys_stream is None and not self._sys_buffers:
            sys_chunk = mic_chunk.copy()
        else:
            if self._sys_buffers:
                sys_concat = np.concatenate(self._sys_buffers, axis=0)
            else:
                sys_concat = np.zeros_like(mic_concat)
            if sys_concat.shape[0] < use_frames:
                # Pad with zeros if needed
                pad_len = use_frames - sys_concat.shape[0]
                sys_concat = np.concatenate([sys_concat, np.zeros((pad_len, 1), dtype=np.float32)], axis=0)
            sys_chunk = sys_concat[:use_frames]
            remaining_sys = sys_concat[use_frames:]
            self._sys_buffers = ([remaining_sys] if remaining_sys.size > 0 else [])
        # Mixed
        mix_chunk = (mic_chunk + sys_chunk) / 2.0
        # Normalize to avoid clipping
        for name, arr in [("mic", mic_chunk), ("sys", sys_chunk), ("mix", mix_chunk)]:
            max_abs = np.max(np.abs(arr))
            if max_abs > 0.99:
                arr /= max_abs
        # Build filenames
        dt_prefix = datetime.now().strftime('%Y_%m_%d_%H_%M_%S')
        rel_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        for track_name, data in [("mic", mic_chunk), ("sys", sys_chunk), ("mix", mix_chunk)]:
            fname = f"{dt_prefix}_{self._audio_chunk_index}_{rel_ms}_{track_name}.wav"
            fpath = session_audio_dir / fname
            self._write_wav(fpath, data)
            if self.current_session:
                self.current_session.audio_files.setdefault(track_name, []).append(str(fpath))
        self._audio_chunk_index += 1
        self._save_metadata()
        logger.debug(f"Saved audio chunk index={self._audio_chunk_index -1} frames={use_frames}")

    async def _write_complete_audio(self, session_audio_dir: Path, start_time: datetime):
        """Write the complete audio recording as single files for mic/sys/mix."""
        if not self._mic_buffers:
            return
            
        logger.info("Writing complete audio files...")
        
        # Concatenate all mic buffers
        mic_complete = np.concatenate(self._mic_buffers, axis=0)
        
        # System audio
        if self._sys_stream is None and not self._sys_buffers:
            # Duplicate mic as system if no separate system stream
            sys_complete = mic_complete.copy()
        else:
            if self._sys_buffers:
                sys_complete = np.concatenate(self._sys_buffers, axis=0)
                # Ensure same length as mic
                if sys_complete.shape[0] < mic_complete.shape[0]:
                    pad_len = mic_complete.shape[0] - sys_complete.shape[0]
                    sys_complete = np.concatenate([sys_complete, np.zeros((pad_len, 1), dtype=np.float32)], axis=0)
                elif sys_complete.shape[0] > mic_complete.shape[0]:
                    sys_complete = sys_complete[:mic_complete.shape[0]]
            else:
                sys_complete = np.zeros_like(mic_complete)
        
        # Mixed audio
        mix_complete = (mic_complete + sys_complete) / 2.0
        
        # Normalize to avoid clipping
        for name, arr in [("mic", mic_complete), ("sys", sys_complete), ("mix", mix_complete)]:
            max_abs = np.max(np.abs(arr))
            if max_abs > 0.99:
                arr /= max_abs
        
        # Build filenames with datetime prefix
        dt_prefix = start_time.strftime('%Y_%m_%d_%H_%M_%S')
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Write complete audio files
        for track_name, data in [("mic", mic_complete), ("sys", sys_complete), ("mix", mix_complete)]:
            fname = f"{dt_prefix}_full_{track_name}.wav"
            fpath = session_audio_dir / fname
            self._write_wav(fpath, data)
            if self.current_session:
                self.current_session.audio_files.setdefault(track_name, []).append(str(fpath))
            logger.info(f"Saved complete {track_name} audio: {fname} (duration: {duration_ms}ms, frames: {data.shape[0]})")
        
        # Clear buffers
        self._mic_buffers.clear()
        self._sys_buffers.clear()
        self._save_metadata()
        logger.info(f"Complete audio files saved successfully (total duration: {duration_ms/1000:.1f}s)")
    
    async def _finalize_audio(self):
        # No need to flush chunks anymore since we write complete files
        pass

    def _write_wav(self, path_out: Path, data: np.ndarray):
        try:
            with wave.open(str(path_out), 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(self.audio_sample_rate)
                # Convert float32 [-1,1] to int16
                int_data = np.clip(data[:,0], -1.0, 1.0)
                int_data = (int_data * 32767).astype(np.int16)
                wf.writeframes(int_data.tobytes())
        except Exception as e:
            logger.error(f"Failed writing wav {path_out}: {e}")

    def _save_metadata(self):
        """Save session metadata to file"""
        if not self.current_session:
            return
        
        session_dir = self.recordings_dir / self.current_session.id
        metadata_path = session_dir / "metadata.json"
        
        with open(metadata_path, "w") as f:
            json.dump(self.current_session.dict(), f, indent=2, default=str)
    
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        return True