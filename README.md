# Screen2Action

A productivity tool combining screen recording, smart screenshots, and AI assistance

## Features

### 🎥 Meeting Recording + Content-Aligned Playback
- Synchronized screen, audio, and note recording
- Automatic periodic screenshots (every 10 seconds)
- Three-column review interface (note rendering, media timeline, AI assistant)
- Audio track recording support (microphone/system sound) - in development

### 📸 Smart Screenshots + Command Operations
- Hotkey screenshots (⌘+Shift+S)
- Natural language command processing
- Support for annotation, save, copy operations
- OCR text recognition
- MCP (Model Context Protocol) tool integration

### 📁 File Management
- Custom output path selection for recordings
- Automatic markdown notes storage
- Improved error handling for missing recordings
- Screenshot rendering in review interface

## Technical Architecture

- **Frontend**: Electron + React + TypeScript
- **Backend**: Python + FastAPI
- **Communication**: WebSocket
- **AI**: OpenAI API / Anthropic Claude API
- **Media Processing**: FFmpeg, PyAutoGUI, Pillow

## Installation Guide

### Prerequisites

- Node.js 20+ 
- Python 3.10+
- uv (Python package manager) - [Installation Guide](https://docs.astral.sh/uv/)
- FFmpeg (for audio processing)
- Tesseract (for OCR)
- BlackHole (for system audio capture on macOS) - [Download from GitHub](https://github.com/ExistentialAudio/BlackHole)

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Backend Dependencies

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Set up Python environment with uv
cd backend
uv venv
uv sync
```

### 3. Set Environment Variables

Copy `.env.example` and set API keys:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your OpenAI API key
```

## Starting the Application

### Method 1: Start Frontend and Backend Separately

**Start Python Backend:**
```bash
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python run.py
```

**Start Electron Frontend:**
```bash
npm run dev
```

### Method 2: Use Startup Script

```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

## Usage Instructions

### Meeting Recording Mode

1. Click the "Meeting Recording" tab
2. Select the screen to record
3. Click "Start Recording"
4. Take notes in the Markdown editor
5. (Optional) Click "Output Path" to select custom save location
6. Click "Stop Recording"
7. Automatically enter the three-column review interface

### Smart Screenshot Mode

1. Click the "Smart Screenshot" tab
2. Press the screenshot button or use hotkey
3. Enter natural language commands in the command input box
4. System automatically executes corresponding operations

### AI Assistant Features

In the third column of the review interface, you can:
- Summarize key points from notes
- Professionally rewrite content
- Extract action items
- Translate to other languages
- Use MCP servers for enhanced capabilities (filesystem, web search, browser automation, etc.)

## Project Structure

```
Screen2Action/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # React frontend
│   └── preload/       # Preload scripts
├── backend/
│   ├── app/
│   │   ├── services/  # Business logic
│   │   ├── models/    # Data models
│   │   └── main.py    # FastAPI application
│   └── requirements.txt
├── recordings/        # Recording file storage
├── screenshots/       # Screenshot storage
└── spec/
    ├── user_story.md  # User stories
    └── rfc.md         # Architecture design document
```

## Development Guide

### Build Production Version

```bash
npm run build
npm run dist
```

### Run Tests

```bash
npm test
```

### Code Style

- Frontend: ESLint + Prettier
- Backend: Black + Pylint

## API Documentation

Backend API documentation is available after startup at:
```
http://localhost:8765/docs
```

## Troubleshooting

### Common Issues

1. **Screenshot function not working**
   - macOS: Grant screen recording permission in System Preferences
   - Windows: Run as administrator

2. **No sound in audio recording**
   - Check microphone permission settings
   - Confirm audio input device is correct
   - Note: Audio recording feature is currently in development

3. **OCR recognition failure**
   - Confirm Tesseract is installed
   - Check if language packs are properly installed

4. **"No recording file found" error**
   - The application now creates the recordings directory automatically
   - Check if the session ID is correct
   - Verify recordings are saved in the `recordings/` directory

## License

MIT License

## Contributing

Pull Requests and Issues are welcome!

## Contact

For questions or suggestions, please contact via GitHub Issues.

## MCP (Model Context Protocol) Integration

### Overview
Screen2Action now supports MCP servers for enhanced AI capabilities. MCP allows the AI assistant to interact with various tools and services, providing more powerful and context-aware assistance.

### Available MCP Servers
- **Filesystem** (📁): Read, write, and manage files
- **Memory** (🧠): Create and query in-memory knowledge graphs
- **Puppeteer** (🎭): Automate web browsers for testing and scraping
- **Web Search** (🔍): Search the web using Brave Search API (requires API key)
- **GitHub** (🐙): Interact with GitHub repositories (requires token)
- **PostgreSQL** (🐘): Query and manage PostgreSQL databases (requires connection string)

### Configuration
1. Copy the environment file:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Configure your preferred LLM (required for intelligent MCP tasks):
   - **OpenAI**: Set `OPENAI_API_KEY` and `OPENAI_MODEL`
   - **Ollama**: Set `OLLAMA_MODEL` and ensure Ollama is running locally

3. Configure MCP servers (optional):
   - Edit `backend/config/mcp_servers.json` to enable/disable servers
   - Add API keys for specific servers in `.env` file

### Using MCP in the AI Assistant
1. In the review interface, open the AI Assistant panel (Column C)
2. Select an MCP server from the dropdown menu
3. Enter your task or query in the text input
4. The AI will use the selected MCP server to process your request intelligently

### Adding Custom MCP Servers
Edit `backend/config/mcp_servers.json` to add custom MCP servers:
```json
{
  "servers": {
    "custom-server": {
      "command": "path/to/server",
      "args": ["--option", "value"],
      "description": "My custom MCP server",
      "icon": "🚀",
      "enabled": true
    }
  }
}
```

## Recent Updates (2025-08-13)

### Latest Changes
- **Added**: MCP (Model Context Protocol) support with multiple server options
- **Added**: MCP server dropdown selection in AI Assistant panel
- **Added**: Intelligent task execution using mcp-use package
- **Added**: Filtered agent wrapper for handling large data (screenshots)
- **Added**: Configuration management for MCP servers

### Previous Updates (2025-08-12)
- **Enhanced**: Continuous audio recording - Records one complete audio file from start to end of session
- **Added**: BlackHole device detection and verification for system audio capture
- **Fixed**: Markdown timestamp recording - Now supports [MM:SS] format in notes for precise timing
- **Improved**: Audio playback now plays from note timestamp to next note's timestamp
- **Added**: Device selection logging to verify BlackHole is being used correctly

### Previous Updates
- **Fixed**: Audio playback button now properly configured (audio recording in development)
- **Fixed**: Screenshots now render correctly in review interface
- **Added**: Custom output path selection for recordings
- **Added**: Automatic markdown notes storage to file system
- **Improved**: Better error handling for missing recording files
- **Changed**: Screenshot frequency adjusted to 10 seconds per capture
- **Cleaned**: Removed unused imports for better code quality

## Audio Recording Setup

### System Audio Capture (macOS)
For capturing system audio, install BlackHole:
1. Download from: https://github.com/ExistentialAudio/BlackHole
2. Configure Multi-Output Device in Audio MIDI Setup
3. The app will automatically detect and use BlackHole for system audio

### Note Timestamps
When taking notes during recording, you can use timestamp format:
- Format: `[MM:SS] Your note here`
- Example: `[01:30] Important discussion point`
- Notes without timestamps will be distributed evenly across recording duration