#!/bin/bash

# Script to build Flatpak package from AppImage
# This should be run after the AppImage is built

set -e

echo "Building Flatpak package for Crystal..."

# Check if flatpak-builder is installed
if ! command -v flatpak-builder &> /dev/null; then
    echo "Error: flatpak-builder is not installed"
    echo "Please install it with: sudo apt install flatpak-builder"
    exit 1
fi

# Check if AppImage exists
APPIMAGE=$(ls dist-electron/Crystal-*-x64.AppImage 2>/dev/null | head -n1)
if [ -z "$APPIMAGE" ]; then
    echo "Error: No AppImage found in dist-electron/"
    echo "Please build the AppImage first with: pnpm run build:linux"
    exit 1
fi

echo "Found AppImage: $APPIMAGE"

# Install required runtime and SDK if not present
echo "Installing Flatpak runtime and SDK..."
flatpak install -y flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08 org.electronjs.Electron2.BaseApp//23.08 || true

# Update the manifest with the actual AppImage path
sed -i "s|path: dist-electron/Crystal-\*.AppImage|path: $APPIMAGE|" build/linux/com.stravu.crystal.yml

# Build the Flatpak
echo "Building Flatpak..."
flatpak-builder --force-clean --repo=repo build-dir build/linux/com.stravu.crystal.yml

# Create a single-file bundle
echo "Creating Flatpak bundle..."
flatpak build-bundle repo crystal.flatpak com.stravu.crystal

# Restore the manifest
git checkout build/linux/com.stravu.crystal.yml

echo "Flatpak bundle created: crystal.flatpak"
echo ""
echo "To install locally:"
echo "  flatpak install crystal.flatpak"
echo ""
echo "To run:"
echo "  flatpak run com.stravu.crystal"