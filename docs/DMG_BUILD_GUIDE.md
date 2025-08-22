# DMG Installation Build Guide

This guide explains how to create a distributable DMG installer for Screen2Action on macOS.

## Prerequisites

- macOS (required for DMG creation)
- Node.js 20+
- Python 3.10+
- uv package manager (will be auto-installed if missing)

## Building the DMG

### Quick Build

```bash
npm run build:dmg
```

This single command will:
1. Check all dependencies
2. Install frontend dependencies
3. Set up Python backend environment
4. Bundle the Python backend for distribution
5. Build the frontend
6. Create the DMG installer

### Manual Build Steps

If you prefer to run individual steps:

```bash
# 1. Install frontend dependencies
npm install

# 2. Set up Python backend
cd backend
uv venv
uv sync
cd ..

# 3. Bundle backend for distribution
npm run bundle:backend

# 4. Build frontend and Electron app
npm run build

# 5. Create DMG
npm run dist
```

## What Gets Packaged

The DMG installer includes:

1. **Electron Frontend**: React-based UI compiled to static files
2. **Python Backend**: FastAPI server with all dependencies
3. **Configuration System**: UI for setting API keys and options
4. **Startup Scripts**: Cross-platform backend launcher
5. **Resources**: App configuration and settings

## DMG Structure

```
Screen2Action.dmg
├── Screen2Action.app/
│   ├── Contents/
│   │   ├── MacOS/
│   │   │   └── Screen2Action (main executable)
│   │   ├── Resources/
│   │   │   ├── backend/ (Python server)
│   │   │   ├── resources/ (app config)
│   │   │   └── app.asar (frontend)
│   │   └── Info.plist
│   └── Applications symlink
```

## Installation Process

1. **Mount DMG**: User double-clicks the DMG file
2. **Drag to Applications**: User drags Screen2Action to Applications folder
3. **First Launch**: App creates configuration directories
4. **Backend Setup**: Python environment is set up automatically
5. **Configuration**: User can set API keys via Settings menu

## Configuration

After installation, users can configure the app through:

- **Settings Menu**: Access via main menu → Settings
- **Configuration File**: `~/Library/Application Support/Screen2Action/config.json`
- **Environment Variables**: Backend `.env` file

### Configurable Options

- OpenAI API Key and Model
- Ollama Model (local LLM alternative)
- Brave Search API Key
- GitHub Token
- Custom recordings directory

## Troubleshooting

### Build Issues

1. **Missing Dependencies**: Run `npm run build:dmg` which checks and installs dependencies
2. **Python Environment**: Ensure Python 3.10+ is installed
3. **Code Signing**: For distribution, you'll need Apple Developer certificates

### Runtime Issues

1. **Backend Won't Start**: Check Python installation and permissions
2. **Configuration Not Saving**: Check file permissions in user directory
3. **API Features Not Working**: Ensure API keys are properly configured

## Distribution

The created DMG file can be distributed through:

1. **Direct Download**: Host the DMG file on your website
2. **GitHub Releases**: Upload as release asset
3. **Mac App Store**: Requires additional setup and Apple Developer Program

## Code Signing (Optional)

For public distribution, sign the app with Apple Developer certificates:

```bash
# Add to electron-builder.json
{
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)"
  }
}
```

## Security Considerations

- The app will request permissions for screen recording and microphone access
- Users may need to grant permissions in System Preferences → Security & Privacy
- For first launch, users might need to right-click → Open to bypass Gatekeeper

## File Locations

After installation, the app uses these directories:

- **App Bundle**: `/Applications/Screen2Action.app/`
- **User Configuration**: `~/Library/Application Support/Screen2Action/`
- **Recordings**: `~/Documents/Screen2Action/recordings/` (default)
- **Logs**: `~/Library/Logs/Screen2Action/`