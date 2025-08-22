#!/bin/bash

# Build script for creating DMG installer for Screen2Action
# This script builds both frontend and backend, then creates a DMG installer

set -e  # Exit on any error

echo "🚀 Building Screen2Action DMG installer..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "DMG creation is only supported on macOS"
    exit 1
fi

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 20+."
        exit 1
    fi
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.10+."
        exit 1
    fi
    
    if ! command -v uv &> /dev/null; then
        print_warning "uv is not installed. Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        source ~/.bashrc 2>/dev/null || true
        source ~/.zshrc 2>/dev/null || true
        export PATH="$HOME/.cargo/bin:$PATH"
    fi
    
    print_success "All dependencies are available"
}

# Detach any mounted DMG volumes from previous runs
detach_mounted_volumes() {
    print_status "Detaching any mounted DMG volumes..."
    for vol in /Volumes/Screen2Action* /Volumes/Screen2Action\ Installer*; do
        if [[ -d "$vol" ]]; then
            print_warning "Detaching $vol"
            hdiutil detach -force "$vol" >/dev/null 2>&1 || true
        fi
    done
}

# Clean previous builds
clean_build() {
    print_status "Cleaning previous builds..."
    detach_mounted_volumes
    # Clear immutable flags and permissions if any
    chflags -R nouchg,noschg dist 2>/dev/null || true
    chflags -R nouchg,noschg release 2>/dev/null || true
    chflags -R nouchg,noschg dist-backend 2>/dev/null || true
    chmod -R u+w dist 2>/dev/null || true
    chmod -R u+w release 2>/dev/null || true
    chmod -R u+w dist-backend 2>/dev/null || true
    # Remove directories, ignore errors
    rm -rf dist/ release/ dist-backend/ 2>/dev/null || true
    print_success "Clean complete"
}

# Install frontend dependencies
install_frontend_deps() {
    print_status "Installing frontend dependencies..."
    npm install
    print_success "Frontend dependencies installed"
}

# Install backend dependencies
setup_backend() {
    print_status "Setting up Python backend..."
    cd backend
    
    if [ ! -d ".venv" ]; then
        print_status "Creating Python virtual environment..."
        uv venv
    fi
    
    print_status "Installing Python dependencies..."
    uv sync
    
    cd ..
    print_success "Backend setup complete"
}

# Bundle backend for distribution
bundle_backend() {
    print_status "Bundling Python backend..."
    node scripts/bundle-backend.js
    print_success "Backend bundling complete"
}

# Build single-file backend binary (Plan A)
build_backend_binary() {
    print_status "Building backend executable (Plan A)..."
    chmod +x scripts/build-backend-binary.sh
    scripts/build-backend-binary.sh
    print_success "Backend executable built for current arch"
    print_status "If you need a universal DMG with both darwin-arm64 and darwin-x64 backends, run this build on each architecture to produce both bin/darwin-arm64 and bin/darwin-x64." 
}

# Build frontend
build_frontend() {
    print_status "Building frontend..."
    npm run build
    print_success "Frontend build complete"
}

# Create app icons (placeholder)
create_icons() {
    print_status "Creating app icons..."
    
    # Create assets directory if it doesn't exist
    mkdir -p assets
    
    # For now, we'll create a simple placeholder icon
    # In a real project, you would have actual icon files
    if [ ! -f "assets/icon.icns" ]; then
        print_warning "No icon.icns found. Creating placeholder..."
        # You would normally have actual icon files here
        # For now, we'll create empty files that electron-builder can handle
        touch assets/icon.icns
        touch assets/icon.ico
        touch assets/icon.png
    fi
    
    print_success "Icons ready"
}

# Create DMG installer
create_dmg() {
    print_status "Creating DMG installer..."
    
    # Set environment variables for production build
    export NODE_ENV=production
    
    npm run dist
    
    print_success "DMG creation complete!"
    
    # Find and display the created DMG file
    DMG_FILE=$(find release/ -name "*.dmg" | head -1)
    if [ -n "$DMG_FILE" ]; then
        DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
        print_success "DMG file created: $DMG_FILE ($DMG_SIZE)"
        print_status "The DMG installer is ready for distribution!"
    else
        print_error "DMG file not found in release directory"
        exit 1
    fi
}

# Main build process
main() {
    print_status "Starting DMG build process..."
    
    check_dependencies
    clean_build
    install_frontend_deps
    setup_backend
    bundle_backend
    build_backend_binary
    build_frontend
    create_icons
    create_dmg
    
    print_success "🎉 DMG build complete!"
    print_status "The installer is ready for distribution."
    print_status "Users can install Screen2Action by:"
    print_status "1. Opening the DMG file"
    print_status "2. Dragging Screen2Action to Applications folder"
    print_status "3. Running Screen2Action from Applications"
    print_status "4. Configuring API keys through the Settings menu"
}

# Run main function
main "$@"