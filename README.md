# Screen2Action

A productivity tool combining screen recording, smart screenshots, and AI assistance

## Features

### 🪟 Floating Window for Recording
- **Mini floating window** (300x200px) for unobtrusive recording
- Always-on-top transparent window with draggable interface
- Built-in Monaco Editor for real-time markdown note-taking
- Recording controls with timer display
- Settings popover for output path and audio configuration
- One-click expand to full review window
- **AI-powered screenshot capture**: Type `!!!` followed by a command to capture and analyze screenshots

### 🎥 Meeting Recording + Content-Aligned Playback
- Synchronized screen, audio, and note recording
- Automatic periodic screenshots (configurable: 10/30/60 seconds)
- Enhanced review interface with Monaco Editor hover tooltips
- Interactive screenshot preview on text hover
- Double-click to insert screenshots into notes
- Audio track recording support (microphone/system sound)

### 📝 Review Page Widget System
- **Interactive widgets** above each H1 header in markdown notes
- **Screenshot gallery** with multi-select capability for each section
- **Quick actions** per section:
  - Insert selected screenshots directly into notes
  - Start AI chat with section context
  - Play 15 seconds of audio from section timestamp
- **MCP integration** for enhanced AI capabilities in section-specific chat

### 📸 Smart Screenshots + Command Operations
- Hotkey screenshots (⌘+Shift+S)
- **AI-triggered screenshots**: Type `!!!` in floating window to capture screen
- Natural language command processing with visual grounding
- Support for annotation, save, copy operations
- **Advanced image manipulation**:
  - Automatic bounding box detection and annotation
  - Smart cropping based on content detection
  - Arrow annotations for highlighting specific elements
- OCR text recognition
- MCP (Model Context Protocol) tool integration

### 🤖 Floating AI Window
- **Intelligent screenshot assistant** that appears below the floating markdown window
- **AI-powered screenshot analysis**:
  - Natural language commands for image manipulation
  - Visual grounding capabilities for element detection
  - Support for complex queries like "highlight the main chart" or "crop the navigation bar"
- **Interactive chat interface** for continuous conversation about screenshots
- **One-click actions**:
  - Insert processed screenshots into markdown notes
  - Copy screenshots to clipboard
  - Preview screenshots in full-screen mode
- **Collapsible design** to minimize screen space when not in use

### 📁 File Management
- Custom output path selection for recordings
- Automatic markdown notes storage with timestamps
- Improved error handling for missing recordings
- Screenshot rendering in review interface

## Technical Architecture

- **Frontend**: Electron + React + TypeScript
- **Backend**: Python + FastAPI
- **Communication**: WebSocket
- **AI**: OpenAI API / Azure OpenAI / Anthropic Claude API
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
# Edit backend/.env and add your OpenAI API key or Azure OpenAI credentials
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

### Quick Testing the Review Page

For rapid development and testing of the Review Page without going through the recording process:

#### Method 1: All-in-One Script (Recommended)
```bash
npm run test:review:full
# Or with custom session ID:
./test-review-full.sh YOUR_SESSION_ID
```
This script will:
- Check and start the Python backend if needed
- Start the frontend dev server
- Open the Review Page in your browser
- Handle cleanup when you press Ctrl+C

#### Method 2: Manual Setup
**Prerequisites: The Python backend server must be running!**

```bash
# Terminal 1 - Start the backend server:
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python run.py

# Terminal 2 - Start frontend and open browser:
npm run test:review
```
This will start the dev server and open the Review Page with the default test session after a 2-second delay.

#### Method 3: Other Options

**Shell Script with Custom Session ID:**
```bash
./test-review.sh [sessionId]
```

**HTML Test Launcher:**
1. Ensure backend is running
2. Start dev server: `npm run dev:renderer`
3. Open `test-review.html` in browser

**Direct URL:**
1. Ensure backend is running
2. Start dev server: `npm run dev:renderer`
3. Open: `http://localhost:3000?testMode=review&sessionId=YOUR_SESSION_ID`

This bypasses the need to start from floating window, record audio, and complete a full recording session.

### Build Production Version

```bash
npm run build
npm run dist
```

### Build DMG Installer (macOS)

To create a distributable DMG installer:

```bash
npm run build:dmg
```

This creates a complete installer that bundles both the frontend and Python backend. Users can:
1. Download and open the DMG file
2. Drag Screen2Action to Applications folder
3. Launch the app and configure API keys via Settings menu

See [DMG Build Guide](docs/DMG_BUILD_GUIDE.md) for detailed instructions.

### Release Workflows (GitHub Actions)

The repository includes two release workflows (in `.github/workflows/`):

#### 1) Automatic Release on Version Tags (`release.yml`)
- Triggers on: push of tags matching `v*.*.*` (e.g., `v1.0.0`, `v2.1.3`)
- Builds for: macOS, Linux, and Windows in parallel
- Creates: a GitHub Release with all platform artifacts automatically

#### 2) Manual Release (`manual-release.yml`)
- Triggers on: manual workflow dispatch from the GitHub Actions tab
- Options:
  - Specify version number
  - Mark as pre-release
  - Create as draft for review

#### How to Use

**Automatic Releases**
```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0

# Or create an annotated tag with a message
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

**Manual Releases**
1. Go to GitHub → Actions tab
2. Select "Manual Build and Release"
3. Click "Run workflow"
4. Enter version and options
5. Click "Run workflow" button

### Continuous Integration

#### GitHub Actions

The project uses GitHub Actions for automated testing on all pull requests:

- **Frontend Tests**: Run Jest unit tests with coverage reporting
- **Backend Tests**: Run pytest tests using uv
- **Test Status Required**: Pull requests must pass all tests before merging to main

#### Branch Protection Rules

To ensure code quality, configure the following branch protection rules for the `main` branch in your GitHub repository settings:

1. Go to **Settings** → **Branches**
2. Add a branch protection rule for `main`
3. Enable these settings:
   - ✅ **Require a pull request before merging**
   - ✅ **Require status checks to pass before merging**
     - Select `frontend-tests`
     - Select `backend-tests`
     - Select `all-tests-pass`
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Dismiss stale pull request approvals when new commits are pushed**
   - Optional: **Require conversation resolution before merging**

This ensures that:
- All code changes go through pull requests
- Both frontend and backend tests must pass
- The branch is up-to-date with main before merging
- Tests are re-run when new commits are added

### Run Tests

#### Frontend Tests
```bash
# Run all frontend tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Backend Tests
```bash
# Run all backend tests
cd backend
uv run pytest

# Run tests with coverage
uv run pytest --cov=app --cov-report=html

# Run specific test file
uv run pytest tests/test_recording_service.py

# Run tests with verbose output
uv run pytest -v

# Run tests with specific markers
uv run pytest -m "not slow"
```

#### End-to-End Tests (Playwright)
```bash
# Run E2E tests for Electron app (builds app and starts backend automatically)
npm run test:e2e

# Run E2E tests with UI (interactive mode)
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Debug E2E tests
npm run test:e2e:debug
```

The E2E tests will:
- Automatically build the Electron app
- Start the Python backend server if not running
- Launch the Electron application
- Test complete workflows including:
  - Recording with voice narration
  - Adding notes with H1 paragraphs
  - Stopping recording and navigating to review
  - Playing audio in the review page
  - Verifying timestamps and note synchronization

#### Git Hooks (pre-commit)

On every commit, a Husky pre-commit hook runs these steps in order:

1) Frontend unit tests (Jest)
```bash
npm run test
```

2) Backend unit tests (pytest via uv)
```bash
cd backend
uv run pytest -q
```

3) E2E tests (Playwright for Electron)
```bash
npm run test:e2e
```

Notes:
- Any failure blocks the commit. Use `--no-verify` to bypass in emergencies.
- E2E includes a full build; commits will take longer.
- Ensure `uv` is installed for backend tests.

#### E2E Floating Window Mode

For automated tests, the Electron main process supports a floating-only mode:
- Set `S2A_E2E_FLOATING_ONLY=1` in the environment before launch to create only the floating window.
- Tests can still expand to the main window to validate the review flow.

#### Integration Tests
```bash
# Test review page with mock data
npm run test:review:full

# Test with specific session
./test-review-full.sh YOUR_SESSION_ID
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
   - **Azure OpenAI**: Set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`, and `AZURE_OPENAI_DEPLOYMENT`
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

## Unified Recordings Storage (floating_UI)

All sessions (screenshots, notes, audio) are stored under a single directory shared by Electron (frontend) and Python (backend).

Priority when resolving the recordings directory:
1) Environment variable (highest)
- Set S2A_RECORDINGS_DIR to an absolute path (supports ~)
- Example (zsh):
```bash
export S2A_RECORDINGS_DIR=~/Screen2Action/recordings
```
2) Config file: `config/app.json`
```json
{
  "recordingsDir": "~/Screen2Action/recordings"
}
```
3) Fallback
- macOS: `~/Documents/Screen2Action/recordings`

Details
- Electron main uses `src/main/config.ts:getRecordingsDir()` and all file/audio/screenshot IPC handlers rely on it
- Backend uses the same resolution logic in `backend/app/services/recording_service.py`
- Renderer can query the resolved path via `window.electronAPI.settings.getRecordingsDir()`

Migrating existing sessions
- Move your session folders into the configured recordingsDir, preserving structure:
```
<recordingsDir>/<sessionId>/{metadata.json, notes.md, *_notes.md, screenshots/, audio/}
```