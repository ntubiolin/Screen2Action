# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0](https://github.com/ntubiolin/Screen2Action/compare/v0.0.4...v0.1.0) (2025-08-28)


### Features

* add Docker build system for cross-platform releases ([3206104](https://github.com/ntubiolin/Screen2Action/commit/3206104d3aa99f80cf34ce6e12e74cbe9fe270a8))
* Enhance Docker build system with PyInstaller and base image caching ([93598e7](https://github.com/ntubiolin/Screen2Action/commit/93598e74ae0ac9c2083a474e6e7ccc64608522f0))
* Enhanced Docker build system with PyInstaller and caching ([c797a13](https://github.com/ntubiolin/Screen2Action/commit/c797a13e27a33ce21adaa08218242b2d0d85fc86))


### Bug Fixes

* update docker-compose to docker compose for compatibility ([a26e781](https://github.com/ntubiolin/Screen2Action/commit/a26e781ae97bb62fa0f445f572f84cef9c584a29))

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
