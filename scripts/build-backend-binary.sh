#!/bin/bash
set -euo pipefail

# Build a single-file executable for the Python backend (Plan A)
# Output per-platform/arch under dist-backend/bin/<platform>-<arch>/Screen2ActionBackend

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
DIST_BACKEND_DIR="$ROOT_DIR/dist-backend"
BIN_DIR_BASE="$DIST_BACKEND_DIR/bin"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')" # darwin/linux
ARCH_NATIVE="$(uname -m)" # arm64 or x86_64

# Map uname to node arch strings
map_arch() {
  case "$1" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64) echo "x64" ;;
    *) echo "$1" ;;
  esac
}

ARCH_MAPPED="$(map_arch "$ARCH_NATIVE")"
TARGET_DIR="$BIN_DIR_BASE/${PLATFORM}-${ARCH_MAPPED}"

info "Building backend single-file executable for ${PLATFORM}-${ARCH_MAPPED}..."

# Ensure dist-backend exists
mkdir -p "$TARGET_DIR"

# Choose python from backend venv if available
PYTHON="python3"
if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  PYTHON="$BACKEND_DIR/.venv/bin/python"
elif [[ -x "$BACKEND_DIR/venv/bin/python" ]]; then
  PYTHON="$BACKEND_DIR/venv/bin/python"
fi

info "Using Python at: $PYTHON"

# Ensure pip exists (uv venv may not include pip). Use ensurepip as bootstrap.
if ! "$PYTHON" -m pip --version >/dev/null 2>&1; then
  info "Bootstrapping pip via ensurepip..."
  "$PYTHON" -m ensurepip --upgrade || true
fi

# Ensure pyinstaller is installed in that environment
info "Installing PyInstaller (if needed)..."
"$PYTHON" -m pip install --upgrade pip >/dev/null 2>&1 || true
"$PYTHON" -m pip install --upgrade pyinstaller

# Entry script
ENTRY="$BACKEND_DIR/run.py"
if [[ ! -f "$ENTRY" ]]; then
  error "Entry script not found: $ENTRY"
  exit 1
fi

# Name per platform
APP_NAME="Screen2ActionBackend"

# Build flags
WORK_DIR="$DIST_BACKEND_DIR/.pyi-build-${PLATFORM}-${ARCH_MAPPED}"
SPEC_DIR="$DIST_BACKEND_DIR/.pyi-spec-${PLATFORM}-${ARCH_MAPPED}"
rm -rf "$WORK_DIR" "$SPEC_DIR"

info "Running PyInstaller..."
"$PYTHON" -m PyInstaller \
  --onefile \
  --name "${APP_NAME}" \
  --clean \
  --distpath "$TARGET_DIR" \
  --workpath "$WORK_DIR" \
  --specpath "$SPEC_DIR" \
  --exclude-module pyautogui \
  --exclude-module rubicon \
  --exclude-module rubicon-objc \
  --exclude-module mouseinfo \
  --exclude-module pygetwindow \
  --exclude-module pymsgbox \
  --exclude-module pytweening \
  --exclude-module pyscreeze \
  "$ENTRY"

# Ensure executable permissions on Unix
chmod +x "$TARGET_DIR/${APP_NAME}" || true

# Print size
if [[ -f "$TARGET_DIR/${APP_NAME}" ]]; then
  SIZE=$(du -h "$TARGET_DIR/${APP_NAME}" | cut -f1)
  success "Backend binary created at: $TARGET_DIR/${APP_NAME} (${SIZE})"
else
  error "Backend binary not created. Please check PyInstaller output."
  exit 1
fi

info "Tip: To produce both darwin-arm64 and darwin-x64, run this script on each architecture (or use a cross-compile setup for PyInstaller)."
