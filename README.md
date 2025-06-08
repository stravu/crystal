# Crystal - Build Instructions

## Prerequisites

- Node.js 22.15.1
- pnpm (`npm install -g pnpm`)

## Build Steps

```bash
# Install dependencies
pnpm install

# Build main process (required before running Electron)
pnpm run build:main

# Run as Electron app in development mode
pnpm electron-dev

# Run frontend only (without Electron shell)
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

**Note:** You must run `pnpm run build:main` at least once before running `pnpm electron-dev` to compile the main process.

## Building Packaged Electron App

### Build for Current Platform
```bash
pnpm build
```

### Build for All Platforms
```bash
# Build for macOS
pnpm build:mac

# Build for Windows
pnpm build:win

# Build for Linux
pnpm build:linux

# Build for all platforms at once
pnpm build:all
```

**Note:** Cross-platform builds have limitations:
- Windows apps can be built on any platform
- macOS apps can only be built on macOS
- Linux apps can be built on any platform

## Build Output

After building, packaged applications will be in the `dist-electron` directory:
- macOS: `Crystal-1.0.0-arm64.dmg` and `Crystal-1.0.0-arm64-mac.zip`
- Windows: `Crystal Setup 1.0.0.exe`
- Linux: `Crystal-1.0.0.AppImage`

## Clean Build

To ensure a clean build:
```bash
git clean -fXd
pnpm install
pnpm build
```