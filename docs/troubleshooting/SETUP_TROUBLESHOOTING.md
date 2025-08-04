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