# Release Process for Crystal

## Overview

Crystal uses GitHub Actions to automatically build and release for macOS when you create a new version tag.

## Prerequisites

1. Ensure you have push access to the repository
2. The `GITHUB_TOKEN` is automatically provided by GitHub Actions
3. Update the version in `package.json`

## Release Steps

### 1. Update Version

```bash
# Update version in package.json
# Edit the "version" field to your new version (e.g., "0.2.0")
```

### 2. Commit Changes

```bash
git add package.json
git commit -m "chore: bump version to v0.2.0"
git push origin main
```

### 3. Create and Push Tag

```bash
# Create a tag matching the version
git tag v0.2.0
git push origin v0.2.0
```

### 4. Monitor the Release

1. Go to the [Actions tab](https://github.com/stravu/crystal/actions)
2. Watch the "Release Crystal" workflow
3. The workflow will:
   - Build Crystal for macOS
   - Upload the artifacts to GitHub
   - Create a draft release

### 5. Publish the Release

1. Go to [Releases](https://github.com/stravu/crystal/releases)
2. Find your draft release
3. Edit the release notes as needed
4. Click "Publish release"

## Build Outputs

The release workflow creates:
- **macOS**: `Crystal-{version}.dmg`

## Manual Release (Alternative)

You can also trigger a release manually:

1. Go to [Actions](https://github.com/stravu/crystal/actions)
2. Click "Release Crystal" workflow
3. Click "Run workflow"
4. Enter the tag name (e.g., `v0.2.0`)
5. Click "Run workflow"

## Configuration

The release process is configured in:
- `.github/workflows/release.yml` - Release workflow
- `package.json` - Build configuration in the "build" section

### electron-builder Configuration

The `package.json` contains electron-builder settings:
```json
{
  "build": {
    "appId": "com.stravu.crystal",
    "productName": "Crystal",
    "directories": {
      "output": "dist-electron"
    },
    "publish": {
      "provider": "github",
      "owner": "stravu",
      "repo": "crystal"
    }
  }
}
```

## Code Signing (macOS)

Currently, the GitHub Actions builds are not code-signed. This means macOS users will see a "damaged" app warning. 

### For Users: How to Run Unsigned Apps

If you download Crystal from GitHub releases on macOS:

1. **First attempt**: Double-click the app, you'll see it's "damaged" or can't be opened
2. **Solution**: Right-click the app and select "Open" from the context menu
3. **Alternative**: Run in Terminal: `xattr -cr /Applications/Crystal.app`

### For Developers: Setting Up Code Signing

To properly sign and notarize the app:

1. Join Apple Developer Program ($99/year)
2. Create certificates:
   - Developer ID Application certificate
   - Developer ID Installer certificate
3. Export as .p12 file with password
4. Add GitHub secrets:
   - `CSC_LINK`: base64-encoded .p12 file (`base64 -i certificate.p12`)
   - `CSC_KEY_PASSWORD`: password for the .p12 file
   - `APPLE_ID`: your Apple ID
   - `APPLE_ID_PASSWORD`: app-specific password (not your regular password)
   - `APPLE_TEAM_ID`: your Apple Developer Team ID

## Troubleshooting

### Build Fails
- Check Python version (should be 3.11)
- Ensure native dependencies build correctly
- Check the Actions logs for specific errors

### Release Not Publishing
- Ensure the tag format is `v*` (e.g., `v1.0.0`)
- Check that `GITHUB_TOKEN` has proper permissions
- Verify the workflow has completed successfully

### Missing Artifacts
- Check the build logs for errors
- Ensure the build scripts complete successfully
- Verify artifacts are uploaded in the workflow

### macOS "Damaged" App
- This occurs because the app isn't code-signed
- See "Code Signing (macOS)" section above for solutions