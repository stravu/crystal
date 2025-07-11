# Secure Storage Implementation for Crystal Fork

## Overview

This implementation adds secure storage for sensitive API keys using Electron's `safeStorage` API. The API keys are now encrypted before being stored in the configuration file, providing protection against unauthorized access.

## Changes Made

### 1. Modified `configManager.ts`

The main changes were made to `/main/src/services/configManager.ts`:

- **Added encryption/decryption methods**: 
  - `encryptValue()`: Encrypts plain text values using Electron's safeStorage API
  - `decryptValue()`: Decrypts encrypted values back to plain text
  
- **Automatic migration**: When the app starts, it checks for plain text API keys and automatically encrypts them
  
- **Transparent operation**: The encryption/decryption happens transparently - the rest of the application continues to work with plain text values

### 2. Security Features

- **Platform-specific encryption**: Uses the OS keychain/credential manager:
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API (libsecret)

- **Graceful fallback**: If secure storage is not available, the system falls back to plain text storage with a warning

- **Double encryption prevention**: Values already encrypted are not re-encrypted

- **Encrypted value format**: Encrypted values are stored with a prefix `enc:` followed by base64-encoded encrypted data

## How It Works

1. **On startup**: 
   - ConfigManager checks if encryption is available
   - Loads the config file
   - Decrypts any encrypted API keys
   - Migrates plain text keys to encrypted format if needed

2. **When saving config**:
   - API keys are encrypted before writing to disk
   - Other non-sensitive values remain in plain text

3. **When reading config**:
   - Encrypted values are automatically decrypted
   - The application receives plain text values

## Testing

A test script is provided at `/main/test-secure-storage.js`. To run it:

```bash
cd main
electron test-secure-storage.js
```

## Configuration File Format

Before encryption:
```json
{
  "gitRepoPath": "/home/user",
  "verbose": false,
  "anthropicApiKey": "sk-ant-api03-plaintext-key",
  "stravuApiKey": "stravu-plaintext-key"
}
```

After encryption:
```json
{
  "gitRepoPath": "/home/user", 
  "verbose": false,
  "anthropicApiKey": "enc:YmFzZTY0ZW5jcnlwdGVkZGF0YQ==",
  "stravuApiKey": "enc:YW5vdGhlcmVuY3J5cHRlZGtleQ=="
}
```

## Security Considerations

1. **Key Storage**: The encryption keys are managed by the operating system, not the application
2. **User Authentication**: On some systems, users may need to authenticate to access encrypted values
3. **Portability**: Encrypted config files are not portable between systems
4. **Backup**: Users should backup their API keys separately as encrypted configs cannot be decrypted on other machines

## Future Improvements

1. Add support for encrypting other sensitive data (if any)
2. Implement key rotation mechanism
3. Add audit logging for key access
4. Consider implementing additional security layers for highly sensitive environments