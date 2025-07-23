# Polyfills

This directory contains polyfills needed for the Crystal application to run properly in different Node.js environments.

## ReadableStream Polyfill

The `readablestream.ts` file provides a polyfill for the Web Streams API (ReadableStream, WritableStream, TransformStream) which is required by the Claude Code SDK.

### Why is this needed?

The `@anthropic-ai/claude-code` SDK uses the ReadableStream API internally, but this API is not available in older Node.js versions or might not be globally available in some Electron contexts.

### How it works:

1. First, it checks if ReadableStream is already available globally
2. If not, it tries to use Node.js's built-in `stream/web` module (available in Node 16.5+)
3. If that fails, it falls back to the `web-streams-polyfill` package
4. The polyfill makes these APIs available globally for the Claude Code SDK to use

### Usage:

This polyfill is automatically loaded at the very beginning of the main process in `index.ts` before any other imports to ensure it's available when the Claude Code SDK is initialized.