#!/bin/bash

# Docker Base Image Builder for Screen2Action
# This script manages the base image with cached dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_IMAGE="screen2action-base"
BASE_TAG="latest"
DEPENDENCIES_HASH_FILE=".docker-deps-hash"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to calculate dependencies hash
calculate_deps_hash() {
    local hash=""
    
    # Hash package.json and package-lock.json
    if [ -f "package.json" ]; then
        hash="${hash}$(sha256sum package.json | cut -d' ' -f1)"
    fi
    if [ -f "package-lock.json" ]; then
        hash="${hash}$(sha256sum package-lock.json | cut -d' ' -f1)"
    fi
    
    # Hash Python dependencies
    if [ -f "backend/pyproject.toml" ]; then
        hash="${hash}$(sha256sum backend/pyproject.toml | cut -d' ' -f1)"
    fi
    if [ -f "backend/uv.lock" ]; then
        hash="${hash}$(sha256sum backend/uv.lock | cut -d' ' -f1)"
    fi
    
    # Create final hash
    echo "$hash" | sha256sum | cut -d' ' -f1
}

# Function to check if base image needs rebuild
needs_rebuild() {
    local current_hash=$(calculate_deps_hash)
    
    # Check if hash file exists
    if [ ! -f "$DEPENDENCIES_HASH_FILE" ]; then
        print_message $YELLOW "No previous dependency hash found. Base image needs to be built."
        return 0
    fi
    
    # Compare hashes
    local stored_hash=$(cat "$DEPENDENCIES_HASH_FILE")
    if [ "$current_hash" != "$stored_hash" ]; then
        print_message $YELLOW "Dependencies have changed. Base image needs to be rebuilt."
        print_message $YELLOW "  Previous hash: ${stored_hash:0:12}..."
        print_message $YELLOW "  Current hash:  ${current_hash:0:12}..."
        return 0
    fi
    
    # Check if image exists
    if ! docker images | grep -q "^${BASE_IMAGE}.*${BASE_TAG}"; then
        print_message $YELLOW "Base image not found locally. Building..."
        return 0
    fi
    
    print_message $GREEN "Dependencies unchanged. Using existing base image."
    return 1
}

# Function to build base image
build_base_image() {
    print_message $GREEN "Building base image with cached dependencies..."
    
    # Build the base image
    docker build -f Dockerfile.base -t "${BASE_IMAGE}:${BASE_TAG}" . || {
        print_message $RED "Failed to build base image"
        exit 1
    }
    
    # Store the new hash
    local new_hash=$(calculate_deps_hash)
    echo "$new_hash" > "$DEPENDENCIES_HASH_FILE"
    
    print_message $GREEN "✓ Base image built successfully: ${BASE_IMAGE}:${BASE_TAG}"
    print_message $YELLOW "  Dependency hash: ${new_hash:0:12}..."
}

# Function to force rebuild
force_rebuild() {
    print_message $YELLOW "Forcing base image rebuild..."
    rm -f "$DEPENDENCIES_HASH_FILE"
    build_base_image
}

# Main script logic
main() {
    local force_rebuild=false
    local check_only=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                force_rebuild=true
                shift
                ;;
            -c|--check)
                check_only=true
                shift
                ;;
            -h|--help)
                cat << EOF
Usage: $0 [OPTIONS]

Build and manage the Docker base image for Screen2Action

OPTIONS:
    -f, --force    Force rebuild of base image
    -c, --check    Check if rebuild is needed without building
    -h, --help     Show this help message

EXAMPLES:
    $0              # Build base image if dependencies changed
    $0 --force      # Force rebuild base image
    $0 --check      # Check if rebuild is needed

EOF
                exit 0
                ;;
            *)
                print_message $RED "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_message $RED "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_message $RED "Docker is not running"
        exit 1
    fi
    
    print_message $GREEN "=== Screen2Action Base Image Manager ==="
    
    # Check only mode
    if [ "$check_only" = true ]; then
        if needs_rebuild; then
            print_message $YELLOW "Base image rebuild is needed"
            exit 0
        else
            print_message $GREEN "Base image is up to date"
            exit 0
        fi
    fi
    
    # Force rebuild mode
    if [ "$force_rebuild" = true ]; then
        force_rebuild
        exit 0
    fi
    
    # Normal mode - build if needed
    if needs_rebuild; then
        build_base_image
    fi
    
    print_message $GREEN "Base image ready: ${BASE_IMAGE}:${BASE_TAG}"
}

# Run main function
main "$@"