#!/bin/bash

# Verification script for Screen2Action DMG build
# This script checks if all required components are present for DMG creation

set -e

echo "🔍 Verifying Screen2Action build setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

ERRORS=0

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_fail "DMG creation requires macOS"
    ERRORS=$((ERRORS + 1))
else
    print_pass "Running on macOS"
fi

# Check Node.js
print_check "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_pass "Node.js installed: $NODE_VERSION"
else
    print_fail "Node.js not found. Please install Node.js 20+."
    ERRORS=$((ERRORS + 1))
fi

# Check npm
print_check "Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_pass "npm installed: $NPM_VERSION"
else
    print_fail "npm not found."
    ERRORS=$((ERRORS + 1))
fi

# Check Python
print_check "Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    print_pass "Python installed: $PYTHON_VERSION"
else
    print_fail "Python 3 not found. Please install Python 3.10+."
    ERRORS=$((ERRORS + 1))
fi

# Check uv
print_check "Checking uv package manager..."
if command -v uv &> /dev/null; then
    UV_VERSION=$(uv --version)
    print_pass "uv installed: $UV_VERSION"
else
    print_warning "uv not found. It will be installed automatically during build."
fi

# Check project structure
print_check "Checking project structure..."

REQUIRED_FILES=(
    "package.json"
    "electron-builder.json"
    "backend/pyproject.toml"
    "scripts/build-dmg.sh"
    "scripts/bundle-backend.js"
    "resources/app-config.json"
    "src/main/index.ts"
    "src/preload/index.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_pass "Found: $file"
    else
        print_fail "Missing: $file"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check required directories
REQUIRED_DIRS=(
    "src/main"
    "src/renderer"
    "src/preload"
    "backend"
    "scripts"
    "resources"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        print_pass "Found directory: $dir"
    else
        print_fail "Missing directory: $dir"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check if assets directory exists (create if missing)
print_check "Checking assets directory..."
if [ -d "assets" ]; then
    print_pass "Assets directory exists"
else
    print_warning "Assets directory missing. Creating placeholder..."
    mkdir -p assets
    touch assets/icon.icns
    touch assets/icon.ico  
    touch assets/icon.png
    print_pass "Created placeholder assets"
fi

# Check package.json scripts
print_check "Checking package.json scripts..."
if grep -q "build:dmg" package.json; then
    print_pass "build:dmg script found"
else
    print_fail "build:dmg script missing in package.json"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "bundle:backend" package.json; then
    print_pass "bundle:backend script found"
else
    print_fail "bundle:backend script missing in package.json"
    ERRORS=$((ERRORS + 1))
fi

# Check electron-builder configuration
print_check "Checking electron-builder configuration..."
if [ -f "electron-builder.json" ]; then
    if grep -q "dmg" electron-builder.json; then
        print_pass "DMG configuration found in electron-builder.json"
    else
        print_fail "DMG configuration missing in electron-builder.json"
        ERRORS=$((ERRORS + 1))
    fi
else
    print_fail "electron-builder.json not found"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
    print_pass "✅ All checks passed! Ready to build DMG."
    echo ""
    echo "To build the DMG installer, run:"
    echo "  npm run build:dmg"
    echo ""
    echo "The installer will be created in the 'release/' directory."
else
    print_fail "❌ $ERRORS error(s) found. Please fix the issues above before building."
    exit 1
fi