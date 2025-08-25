@echo off
REM Wrapper script to start the backend with the correct Python environment on Windows

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Check if virtual environment exists
if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
    set PYTHON_CMD=%SCRIPT_DIR%.venv\Scripts\python.exe
) else if exist "%SCRIPT_DIR%venv\Scripts\python.exe" (
    set PYTHON_CMD=%SCRIPT_DIR%venv\Scripts\python.exe
) else (
    REM Fallback to system Python
    set PYTHON_CMD=python
)

REM Start the backend
"%PYTHON_CMD%" "%SCRIPT_DIR%run.py"