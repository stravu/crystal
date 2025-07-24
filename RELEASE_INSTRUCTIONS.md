# Crystal Release Instructions

This document outlines the process for releasing new versions of Crystal for macOS with automatic updates.

## Prerequisites

Configure these secrets in your GitHub repository (Settings → Secrets and variables → Actions):

**Required for macOS Signing & Notarization:**
- `APPLE_CERTIFICATE`: Base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD`: Certificate password
- `APPLE_ID`: Apple Developer account email
- `APPLE_APP_PASSWORD`: App-specific password for notarization
- `APPLE_TEAM_ID`: Apple Developer Team ID

**To encode your certificate for GitHub secrets:**
```bash
base64 -i certificate.p12 -o certificate_base64.txt
```
Copy the contents of the base64 file to the GitHub secret.

**Note:** The `GITHUB_TOKEN` is automatically provided by GitHub Actions.

## Release Process

### 1. Prepare the Release

```bash
# Ensure you're on the main branch
git checkout main
git pull origin main

# Run tests and ensure everything passes
pnpm test
pnpm typecheck
```

### 2. Update Version

Edit `package.json` and update the version number:
```json
{
  "version": "0.1.2"  // Update this
}
```

### 3. Update Changelog

Create or update `CHANGELOG.md` with release notes:
```markdown
## v0.1.2 - 2024-06-14

### Added
- Feature X
- Feature Y

### Fixed
- Bug A
- Bug B

### Changed
- Improvement C
```

### 4. Commit Version Changes

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.1.2"
git push origin main
```

### 5. Create and Push Git Tag

```bash
git tag v0.1.2
git push origin v0.1.2
```

### 6. Automated Release

Once you push the tag, GitHub Actions will automatically:
- Build the macOS application
- Sign and notarize the app (if certificates are configured)
- Generate auto-update metadata files (`latest-mac.yml`)
- Create a GitHub release with the .dmg file

**No manual action needed** - just wait for the workflow to complete.

### 7. Verify Release

1. Go to https://github.com/stravu/crystal/releases
2. Verify the new release is created with:
   - Proper version tag
   - Release notes from the commit history
   - macOS .dmg file
   - Auto-update metadata file (`latest-mac.yml`)

## Auto-Update Files

The build process automatically generates these files required for auto-updates:

- **latest-mac.yml** - macOS update metadata
- **Crystal-[version]-mac.zip** - macOS update package
- **Crystal-[version].dmg** - macOS installer

## Build Configuration

The release configuration is defined in `package.json`:

```json
{
  "build": {
    "appId": "com.stravu.crystal",
    "productName": "Crystal",
    "mac": {
      "category": "public.app-category.developer-tools",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "notarize": true
    },
    "publish": {
      "provider": "github",
      "owner": "stravu",
      "repo": "crystal"
    }
  }
}
```

## Troubleshooting

### Auto-update not working

1. **Missing update files**: Ensure the GitHub Actions workflow completed successfully
2. **Certificate issues**: Check that all Apple certificates are properly configured in GitHub secrets
3. **Notarization fails**: Verify Apple credentials are correct and the app-specific password is valid

### Build fails

1. **Native dependencies**: The workflow runs `pnpm electron:rebuild` automatically
2. **Certificate not found**: Ensure the certificate is properly base64 encoded
3. **Version conflicts**: Make sure the version in package.json matches the git tag

## Testing Updates

To test auto-updates:

1. Install an older version of Crystal
2. Crystal will automatically check for updates on startup
3. When an update is found, the in-app dialog will appear
4. Click "Download Update" to test the auto-update process

## Best Practices

1. **Semantic Versioning**: Follow semver (MAJOR.MINOR.PATCH)
2. **Release Notes**: Keep CHANGELOG.md updated with user-friendly notes
3. **Testing**: Test the release workflow on a test repository first
4. **Incremental Updates**: Avoid jumping multiple major versions

## Emergency Rollback

If a release has critical issues:

1. Delete the problematic release and tag from GitHub
2. Fix the issue in the code
3. Create a new version (e.g., if 0.1.2 was bad, release 0.1.3)
4. Follow the normal release process

## Additional Notes

- Auto-updates only work for signed and notarized applications
- Development builds cannot auto-update
- Users can always manually download from GitHub releases if auto-update fails
- Settings and data are preserved during updates
- Crystal checks for updates on startup and every 24 hours