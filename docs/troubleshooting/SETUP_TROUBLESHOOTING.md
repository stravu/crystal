# Setup Troubleshooting Guide

## Python distutils Error

If you encounter this error during `pnpm run setup`:
```
ModuleNotFoundError: No module named 'distutils'
```

This happens because Python 3.12+ removed the `distutils` module that `node-gyp` depends on.

### Quick Fix:
```bash
brew install python-setuptools
```

### Alternative Solutions:

1. **Use Python 3.11 with pyenv**:
   ```bash
   brew install pyenv
   pyenv install 3.11.9
   pyenv global 3.11.9
   ```

2. **Use the setup script**:
   ```bash
   ./setup-dev.sh
   ```

## Other Common Issues

### electron-rebuild failures
- Ensure Xcode Command Line Tools are installed: `xcode-select --install`
- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`

### pnpm permission errors
- Never use `sudo` with pnpm
- Fix npm permissions: `npm config set prefix ~/.npm-global`

## Windows Build Requirements

### Spectre-mitigated Libraries Error

If you encounter this error during `pnpm run setup` on Windows:
```
LINK : fatal error LNK1181: cannot open input file 'MSVCRT.lib'
```

Or similar errors mentioning missing `.lib` files, this means you need to install the Spectre-mitigated libraries in Visual Studio.

### Solution:

1. **Install Visual Studio 2022** (Community Edition is free):
   - Download from [https://visualstudio.microsoft.com/](https://visualstudio.microsoft.com/)
   
2. **Install Required Components**:
   - Open **Visual Studio Installer**
   - Click **Modify** on your Visual Studio 2022 installation
   - Go to the **Individual components** tab
   - Search for "Spectre" in the search box
   - Check the following components:
     - `MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)`
     - `MSVC v143 - VS 2022 C++ ARM64/ARM64EC Spectre-mitigated libs (Latest)` (if building for ARM64)
   - Click **Modify** to install

3. **Restart your terminal** and run `pnpm run setup` again

### Why is this needed?

Node.js native modules on Windows are built with Visual Studio's C++ compiler. Recent security updates require Spectre-mitigated libraries to be installed separately. These libraries provide protection against Spectre vulnerability exploits.

### Alternative: Use Pre-built Binaries

If you're having trouble with the build process, consider waiting for official Windows binaries to be released in future versions of Crystal.