// Test setup file for Vitest
import { vi } from 'vitest';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getName: vi.fn(() => 'Crystal'),
    getVersion: vi.fn(() => '0.1.0'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

// Set up global test environment
global.console = {
  ...console,
  // Suppress logs during tests unless debugging
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};