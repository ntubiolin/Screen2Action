#!/bin/bash

# Docker Build Script for Screen2Action
# This script handles building releases using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BUILD_TARGET="all"
CLEAN_BUILD=false
VERBOSE=false
USE_BASE_IMAGE=true

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build Screen2Action releases using Docker

OPTIONS:
    -t, --target <platform>  Build target: mac, win, linux, or all (default: all)
    -c, --clean             Clean build (removes previous builds)
    -v, --verbose           Verbose output
    -b, --no-base           Don't use base image (full rebuild)
    -h, --help              Show this help message

EXAMPLES:
    $0                      # Build for all platforms using base image
    $0 --target mac         # Build only for macOS
    $0 --target win --clean # Clean build for Windows
    $0 -t linux -v          # Verbose build for Linux
    $0 --no-base            # Full rebuild without base image

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--target)
            BUILD_TARGET="$2"
            shift 2
            ;;
        -c|--clean)
            CLEAN_BUILD=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -b|--no-base)
            USE_BASE_IMAGE=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_message $RED "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate build target
case $BUILD_TARGET in
    mac|win|linux|all)
        ;;
    *)
        print_message $RED "Invalid build target: $BUILD_TARGET"
        print_message $YELLOW "Valid targets are: mac, win, linux, all"
        exit 1
        ;;
esac

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_message $RED "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_message $RED "Docker is not running. Please start Docker first."
    exit 1
fi

# Clean previous builds if requested
if [ "$CLEAN_BUILD" = true ]; then
    print_message $YELLOW "Cleaning previous builds..."
    rm -rf release-*
    docker compose down --remove-orphans 2>/dev/null || true
    docker system prune -f
fi

# Set Docker Compose command options
COMPOSE_OPTS=""
if [ "$VERBOSE" = true ]; then
    COMPOSE_OPTS="--verbose"
fi

# Function to build for a specific platform
build_platform() {
    local platform=$1
    print_message $GREEN "Building for $platform..."
    
    # Create output directory
    mkdir -p "release-$platform"
    
    # Run Docker Compose build
    if [ "$VERBOSE" = true ]; then
        docker compose build "build-$platform"
        docker compose run --rm "build-$platform"
    else
        docker compose build "build-$platform" 2>&1 | grep -E "Step|Successfully|ERROR" || true
        docker compose run --rm "build-$platform" 2>&1 | grep -E "Building|Creating|ERROR|Warning" || true
    fi
    
    # Check if build was successful
    if [ -d "release-$platform" ] && [ "$(ls -A release-$platform)" ]; then
        print_message $GREEN "✓ $platform build completed successfully"
        print_message $YELLOW "  Output: release-$platform/"
    else
        print_message $RED "✗ $platform build failed or produced no output"
        return 1
    fi
}

# Main build process
print_message $GREEN "=== Screen2Action Docker Build ==="
print_message $YELLOW "Target: $BUILD_TARGET"

# Build or update base image if using it
if [ "$USE_BASE_IMAGE" = true ]; then
    print_message $GREEN "Checking base image..."
    chmod +x scripts/docker-base-build.sh
    ./scripts/docker-base-build.sh || {
        print_message $RED "Failed to prepare base image"
        exit 1
    }
    DOCKERFILE="Dockerfile.optimized"
else
    DOCKERFILE="Dockerfile"
fi

# Ensure backend lock file exists
if [ ! -f "backend/uv.lock" ]; then
    print_message $YELLOW "Creating backend uv.lock file..."
    cd backend && uv lock && cd ..
fi

# Build based on target
case $BUILD_TARGET in
    all)
        build_platform "mac"
        build_platform "win"
        build_platform "linux"
        ;;
    *)
        build_platform "$BUILD_TARGET"
        ;;
esac

# Summary
print_message $GREEN "\n=== Build Summary ==="
for platform in mac win linux; do
    if [ -d "release-$platform" ] && [ "$(ls -A release-$platform)" ]; then
        print_message $GREEN "✓ $platform: $(ls release-$platform | wc -l) files"
        if [ "$VERBOSE" = true ]; then
            ls -lh "release-$platform" | head -5
        fi
    fi
done

print_message $GREEN "\nBuild process completed!"
print_message $YELLOW "Release files are available in the release-* directories"