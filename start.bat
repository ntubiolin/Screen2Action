@echo off
echo Starting Screen2Action...

REM Check if uv is installed
where uv >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: uv is not installed. Please install it first:
    echo powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
    exit /b 1
)

REM Check if Python virtual environment exists
if not exist "backend\.venv" (
    echo Creating Python virtual environment with uv...
    cd backend
    uv venv
    uv sync
    cd ..
) else (
    echo Python virtual environment found. Syncing dependencies...
    cd backend
    uv sync
    cd ..
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)

REM Start backend in new window
echo Starting Python backend...
start "Screen2Action Backend" cmd /k "cd backend && .venv\Scripts\activate && python run.py"

REM Wait for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend
echo Starting Electron frontend...
call npm run dev