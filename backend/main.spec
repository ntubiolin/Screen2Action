# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for Screen2Action backend

import sys
import os
from pathlib import Path

# Get the backend directory
backend_dir = Path(os.getcwd()).absolute()

a = Analysis(
    ['app/main.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        # Include any data files your app needs
        ('app', 'app'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'websockets',
        'websockets.legacy',
        'websockets.legacy.server',
        'fastapi',
        'pydantic',
        'pydantic_core',
        'openai',
        'anthropic',
        'PIL',
        'PIL.Image',
        'cv2',
        'numpy',
        'pytesseract',
        'easyocr',
        'sounddevice',
        'scipy',
        'scipy.io',
        'scipy.io.wavfile',
        'tenacity',
        'mcp_use',
        'langchain',
        'langchain_openai',
        'langchain_ollama',
        'multiprocessing',
        'multiprocessing.pool',
        'multiprocessing.dummy',
        'concurrent.futures',
        'asyncio',
        'aiofiles',
        'python_multipart',
        'json_logging',
        'dotenv',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pytest',
        'pytest_asyncio',
        'black',
        'ruff',
        'mypy',
        'ipython',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='screen2action-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)