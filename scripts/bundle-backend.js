#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Backend bundling script for Screen2Action
 * This script prepares the Python backend for distribution with the Electron app
 */

const platform = os.platform();
const backendDir = path.join(__dirname, '..', 'backend');
const distDir = path.join(__dirname, '..', 'dist-backend');

console.log('🔧 Bundling Python backend for distribution...');

// Clean previous build
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy backend files
console.log('📁 Copying backend files...');
copyDirectory(backendDir, distDir, ['.venv', 'venv', '__pycache__', '*.pyc', '*.pyo', '*.pyd', 'test_*']);

// Create requirements.txt with pinned versions
console.log('📦 Creating requirements.txt...');
createRequirementsTxt();

// Create startup script
console.log('🚀 Creating startup scripts...');
createStartupScripts();

console.log('✅ Backend bundling complete!');

function copyDirectory(src, dest, excludePatterns = []) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    
    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        // Check if item should be excluded
        const shouldExclude = excludePatterns.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(item);
            }
            return item === pattern;
        });
        
        if (shouldExclude) {
            continue;
        }
        
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath, excludePatterns);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function createRequirementsTxt() {
    const pyprojectPath = path.join(backendDir, 'pyproject.toml');
    const requirementsPath = path.join(distDir, 'requirements.txt');
    
    if (fs.existsSync(pyprojectPath)) {
        const pyproject = fs.readFileSync(pyprojectPath, 'utf-8');
        const depLines = pyproject.match(/dependencies\s*=\s*\[(.*?)\]/s);
        
        if (depLines) {
            const deps = depLines[1]
                .split(',')
                .map(dep => dep.trim().replace(/['"]/g, ''))
                .filter(dep => dep && !dep.startsWith('#'));
            
            fs.writeFileSync(requirementsPath, deps.join('\n'));
        }
    }
    
    // Also copy the requirements.txt if it exists
    const originalReqPath = path.join(backendDir, 'requirements.txt');
    if (fs.existsSync(originalReqPath)) {
        fs.copyFileSync(originalReqPath, requirementsPath);
    }
}

function createStartupScripts() {
    // Create a cross-platform startup script
    const startupScript = `#!/usr/bin/env python3
"""
Screen2Action Backend Startup Script
Automatically installs dependencies and starts the backend server
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def install_uv():
    """Install uv package manager if not available"""
    try:
        subprocess.run(['uv', '--version'], check=True, capture_output=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Installing uv package manager...")
        if platform.system() == "Windows":
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'uv'], check=True)
        else:
            # Use curl installer for Unix-like systems
            subprocess.run(['curl', '-LsSf', 'https://astral.sh/uv/install.sh'], check=True)
        return True

def setup_environment():
    """Set up Python virtual environment and install dependencies"""
    backend_dir = Path(__file__).parent
    venv_dir = backend_dir / '.venv'
    
    # Create virtual environment if it doesn't exist
    if not venv_dir.exists():
        print("Creating Python virtual environment...")
        if install_uv():
            subprocess.run(['uv', 'venv'], cwd=backend_dir, check=True)
        else:
            subprocess.run([sys.executable, '-m', 'venv', str(venv_dir)], check=True)
    
    # Install dependencies
    requirements_file = backend_dir / 'requirements.txt'
    if requirements_file.exists():
        print("Installing Python dependencies...")
        if install_uv():
            subprocess.run(['uv', 'sync'], cwd=backend_dir, check=True)
        else:
            # Use pip as fallback
            pip_path = venv_dir / ('Scripts/pip' if platform.system() == 'Windows' else 'bin/pip')
            subprocess.run([str(pip_path), 'install', '-r', str(requirements_file)], check=True)

def start_server():
    """Start the FastAPI server"""
    backend_dir = Path(__file__).parent
    venv_dir = backend_dir / '.venv'
    
    # Determine Python executable path
    if platform.system() == 'Windows':
        python_exe = venv_dir / 'Scripts/python.exe'
    else:
        python_exe = venv_dir / 'bin/python'
    
    # Start the server
    server_script = backend_dir / 'run.py'
    print(f"Starting backend server...")
    subprocess.run([str(python_exe), str(server_script)], cwd=backend_dir)

if __name__ == '__main__':
    try:
        setup_environment()
        start_server()
    except Exception as e:
        print(f"Error starting backend: {e}")
        sys.exit(1)
`;

    fs.writeFileSync(path.join(distDir, 'start_backend.py'), startupScript);
    
    // Make executable on Unix-like systems
    if (platform !== 'win32') {
        fs.chmodSync(path.join(distDir, 'start_backend.py'), '755');
    }
}