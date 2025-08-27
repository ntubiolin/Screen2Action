# Multi-stage build for Screen2Action

# Stage 1: Build Backend
FROM python:3.11-slim AS backend-builder

WORKDIR /build/backend

# Install system dependencies for Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python package management
RUN pip install --no-cache-dir uv

# Copy backend files
COPY backend/pyproject.toml backend/uv.lock* ./
COPY backend/app ./app

# Install dependencies using uv
RUN uv sync --frozen

# Stage 2: Build Frontend and Electron App
FROM node:20-bullseye AS frontend-builder

WORKDIR /build

# Install system dependencies for Electron build
RUN apt-get update && apt-get install -y \
    build-essential \
    libgtk-3-0 \
    libnotify-dev \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY electron-builder.json ./

# Install Node dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public
COPY index.html ./

# Copy assets and resources
COPY assets ./assets
COPY resources ./resources
COPY build ./build

# Build the application
RUN npm run build:renderer && npm run build:electron

# Stage 3: Bundle Backend for Distribution
FROM python:3.11-slim AS backend-bundler

WORKDIR /bundle

# Install PyInstaller for bundling
RUN pip install --no-cache-dir pyinstaller

# Copy backend from builder stage
COPY --from=backend-builder /build/backend /bundle/backend

# Copy bundle script
COPY scripts/bundle-backend.js /bundle/scripts/

# Create bundled backend
RUN cd backend && \
    pyinstaller \
    --onedir \
    --name screen2action-backend \
    --hidden-import=uvicorn \
    --hidden-import=fastapi \
    --hidden-import=websockets \
    --hidden-import=openai \
    --hidden-import=anthropic \
    --add-data "app:app" \
    --distpath ../dist-backend \
    app/main.py

# Stage 4: Final Build Stage
FROM node:20-bullseye AS release-builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libgtk-3-0 \
    libnotify-dev \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xvfb \
    wine \
    wine64 \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend
COPY --from=frontend-builder /build/dist ./dist
COPY --from=frontend-builder /build/node_modules ./node_modules
COPY --from=frontend-builder /build/package.json ./package.json
COPY --from=frontend-builder /build/electron-builder.json ./electron-builder.json

# Copy bundled backend
COPY --from=backend-bundler /bundle/dist-backend ./dist-backend

# Copy backend source (for reference)
COPY backend ./backend

# Copy assets and build resources
COPY assets ./assets
COPY resources ./resources
COPY build ./build

# Build the Electron app for all platforms
RUN npm run dist

# Output stage - copy release artifacts
FROM alpine:latest AS output

WORKDIR /output

# Copy release artifacts
COPY --from=release-builder /app/release ./release

# Set up volume for output
VOLUME ["/output/release"]

CMD ["sh", "-c", "cp -r /output/release/* /output/release/"]