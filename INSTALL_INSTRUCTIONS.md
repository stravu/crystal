# Crystal Installation Instructions

This guide covers how to install Crystal from pre-built releases on macOS and Linux.

## Download

Download the appropriate release for your platform from the releases page.

## macOS Installation

### Option 1: Direct Installation (Recommended)

1. **Download the `.dmg` file** (e.g., `Crystal-1.0.0-arm64.dmg` for Apple Silicon or `Crystal-1.0.0.dmg` for Intel)

2. **Install the application:**
   ```bash
   # Open the DMG file
   open Crystal-*.dmg
   
   # Drag Crystal.app to your Applications folder
   ```

3. **First time opening (IMPORTANT - Unsigned App):**
   
   Since Crystal isn't signed with an Apple Developer certificate, macOS will block it by default. You have several options:

   **Method A: Right-click to Open (Easiest)**
   - Right-click (or Control-click) on Crystal.app in Applications
   - Select "Open" from the context menu
   - In the dialog that appears, click "Open"
   - You'll only need to do this once

   **Method B: System Settings (macOS Ventura 13+ / Sonoma 14+)**
   - Try to open Crystal normally (double-click)
   - When blocked, go to System Settings > Privacy & Security
   - Scroll down to the Security section
   - You'll see "Crystal was blocked from use because it is not from an identified developer"
   - Click "Open Anyway"
   - Confirm by clicking "Open" in the next dialog

   **Method C: System Preferences (macOS Monterey 12 and earlier)**
   - Try to open Crystal normally (double-click)
   - When blocked, go to System Preferences > Security & Privacy > General tab
   - You'll see "Crystal was blocked from use because it is not from an identified developer"
   - Click "Open Anyway"
   - Confirm by clicking "Open" in the next dialog

### Option 2: Command Line Installation

```bash
# Mount the DMG
hdiutil attach Crystal-*.dmg

# Copy to Applications
cp -R /Volumes/Crystal/Crystal.app /Applications/

# Unmount the DMG
hdiutil detach /Volumes/Crystal

# Remove quarantine attribute (allows opening without security prompt)
xattr -d com.apple.quarantine /Applications/Crystal.app
```

### Troubleshooting macOS

**"Crystal is damaged and can't be opened"**

This happens when macOS quarantine attributes get corrupted. Fix with:
```bash
xattr -cr /Applications/Crystal.app
```

**"Crystal can't be opened because Apple cannot check it for malicious software"**

This is the standard Gatekeeper message for unsigned apps. Use one of the methods above (Method A, B, or C) to open it.

**Alternative: Disable Gatekeeper Temporarily (Not Recommended)**

For advanced users only - this reduces system security:
```bash
# Disable Gatekeeper temporarily
sudo spctl --master-disable

# Open Crystal normally

# Re-enable Gatekeeper (IMPORTANT!)
sudo spctl --master-enable
```

**If Crystal doesn't appear in Privacy & Security settings:**

Sometimes the "Open Anyway" button doesn't appear immediately:
1. Make sure you've tried to open the app first (double-click)
2. Wait 30 seconds and check Privacy & Security again
3. Try opening the app from Finder (not Spotlight or Launchpad)
4. If still not appearing, use Method A (right-click to open)

## Linux Installation

### AppImage Installation

Crystal is distributed as an AppImage, which works on most Linux distributions without installation.

1. **Download the AppImage file** (e.g., `Crystal-1.0.0-x86_64.AppImage` for Intel/AMD or `Crystal-1.0.0-arm64.AppImage` for ARM)

2. **Make it executable:**
   ```bash
   chmod +x Crystal-*.AppImage
   ```

3. **Run Crystal:**
   ```bash
   ./Crystal-*.AppImage
   ```

### Optional: System-wide Installation

To make Crystal available system-wide:

```bash
# Move to a directory in PATH
sudo mv Crystal-*.AppImage /usr/local/bin/crystal

# Now you can run it from anywhere
crystal
```

### Desktop Integration

For desktop menu integration:

```bash
# 1. Move AppImage to a permanent location
mkdir -p ~/.local/bin
mv Crystal-*.AppImage ~/.local/bin/crystal

# 2. Create desktop entry
cat > ~/.local/share/applications/crystal.desktop << EOF
[Desktop Entry]
Name=Crystal
Comment=Multi-Session Claude Code Manager
Exec=$HOME/.local/bin/crystal
Icon=crystal
Type=Application
Categories=Development;
EOF

# 3. Update desktop database
update-desktop-database ~/.local/share/applications/
```

### Troubleshooting Linux

**FUSE Error:**
If you see "cannot mount AppImage, please install FUSE":

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora/RHEL
sudo dnf install fuse fuse-libs

# Arch
sudo pacman -S fuse2
```

**Alternative: Extract and Run**
If AppImage doesn't work, you can extract it:

```bash
# Extract AppImage contents
./Crystal-*.AppImage --appimage-extract

# Run the extracted version
./squashfs-root/AppRun

# Optional: Create alias
echo "alias crystal='$PWD/squashfs-root/AppRun'" >> ~/.bashrc
source ~/.bashrc
```

## Verifying Installation

After installation, Crystal should:
1. Open without security warnings
2. Have access to create and manage git worktrees
3. Be able to spawn Claude Code sessions

## Uninstalling

### macOS
```bash
# Remove application
rm -rf /Applications/Crystal.app

# Remove application data
rm -rf ~/Library/Application\ Support/Crystal
rm -rf ~/.crystal
```

### Linux
```bash
# Remove AppImage
rm /usr/local/bin/crystal  # or wherever you placed it

# Remove application data
rm -rf ~/.config/Crystal
rm -rf ~/.crystal

# Remove desktop entry (if created)
rm ~/.local/share/applications/crystal.desktop
```

## Notes

- Crystal stores its data in `~/.crystal` on all platforms
- The application requires Claude Code to be installed separately
- Git must be available in your system PATH
- First launch may take longer as it initializes the database