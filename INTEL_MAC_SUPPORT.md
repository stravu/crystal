# Intel Mac Support for Crystal

This document describes the changes made to support Intel-based Macs (x64 architecture) in Crystal.

## Problem

Crystal was originally built only for the architecture of the build machine. When built on an Apple Silicon Mac (ARM64), the resulting application would only work on ARM64 Macs, not Intel Macs.

## Solution

### 1. Updated Build Configuration

Modified `package.json` to explicitly specify target architectures for macOS builds:

```json
"mac": {
  // ... other config ...
  "target": [
    {
      "target": "default",
      "arch": ["x64", "arm64"]
    }
  ]
}
```

### 2. Added Architecture-Specific Build Scripts

Added new build scripts to support different build options:

- `build:mac` - Builds for both architectures (default)
- `build:mac:universal` - Creates a universal binary (single app supporting both architectures)
- `build:mac:x64` - Builds only for Intel Macs
- `build:mac:arm64` - Builds only for Apple Silicon Macs
- `release:mac:universal` - Releases a universal binary

## Building for Intel Macs

### Option 1: Build for Both Architectures (Recommended)
```bash
pnpm run build:mac
```
This creates separate `.dmg` files for each architecture:
- `Crystal-{version}-arm64.dmg` - For Apple Silicon Macs
- `Crystal-{version}-x64.dmg` - For Intel Macs

### Option 2: Universal Binary
```bash
pnpm run build:mac:universal
```
This creates a single `.dmg` file that works on both Intel and Apple Silicon Macs. The app will be larger as it contains code for both architectures.

### Option 3: Intel-Only Build
```bash
pnpm run build:mac:x64
```
This creates a build specifically for Intel Macs only.

## Native Dependencies

Crystal uses native Node.js modules that are architecture-specific:
- `@homebridge/node-pty-prebuilt-multiarch` - Provides prebuilt binaries for both x64 and arm64
- `better-sqlite3` - Compiled during installation for the target architecture

The `electron-builder` configuration ensures these modules are properly rebuilt for each target architecture during the build process.

## Testing

To verify Intel Mac support:
1. Build using one of the methods above
2. Test the resulting `.dmg` on an Intel Mac
3. Verify all features work correctly, especially:
   - Terminal functionality (uses node-pty)
   - Database operations (uses better-sqlite3)
   - Claude Code integration

## Release Process

For releases supporting both architectures:
```bash
pnpm run release:mac:universal
```

This creates a universal binary and publishes it to the configured release channel.