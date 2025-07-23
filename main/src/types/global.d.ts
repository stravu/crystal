/// <reference lib="dom" />

/**
 * Global type declarations for ReadableStream and related Web Streams API
 * This ensures TypeScript knows these are available globally after polyfill
 */
declare global {
  // These types are imported from the DOM lib, but we re-declare them here
  // to ensure they're available in the Node.js context after polyfilling
  var ReadableStream: typeof globalThis.ReadableStream;
  var WritableStream: typeof globalThis.WritableStream;
  var TransformStream: typeof globalThis.TransformStream;
}

export {};