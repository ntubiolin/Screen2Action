# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Features
- Enhanced Docker build system with PyInstaller backend bundling
- Docker base image caching for 70% faster builds
- GitHub Actions workflows for automated Docker releases
- Release-please integration for automated version management

### 📦 Build System
- Added PyInstaller configuration for backend bundling
- Created optimized Dockerfiles with multi-stage builds
- Implemented dependency hash tracking for intelligent caching

### 👷 Continuous Integration
- Added release-please workflow for automated releases
- Created Docker build test workflow for PR validation
- Integrated GitHub Container Registry for image caching

## [1.0.0] - 2025-08-28

### Initial Release
- Screen recording and screenshot capture functionality
- AI-powered screen analysis and command execution
- MCP (Model Context Protocol) integration
- Cross-platform support (macOS, Windows, Linux)
- Real-time audio transcription
- Note-taking with AI enhancement
- WebSocket communication between frontend and backend