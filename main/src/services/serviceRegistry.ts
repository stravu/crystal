/**
 * Service Registry for accessing singleton services across the application.
 * Services are registered during app initialization in index.ts
 */

import type { DatabaseService } from '../database/database';
import type { ConfigManager } from './configManager';

interface ServiceRegistry {
  databaseService?: DatabaseService;
  configManager?: ConfigManager;
}

const registry: ServiceRegistry = {};

export function registerService<K extends keyof ServiceRegistry>(
  name: K, 
  service: ServiceRegistry[K]
): void {
  registry[name] = service;
}

export function getService<K extends keyof ServiceRegistry>(
  name: K
): ServiceRegistry[K] | undefined {
  return registry[name];
}

export function getDatabaseService(): DatabaseService {
  const service = registry.databaseService;
  if (!service) {
    throw new Error('DatabaseService not initialized. Make sure services are initialized before use.');
  }
  return service;
}

export function getConfigManager(): ConfigManager {
  const service = registry.configManager;
  if (!service) {
    throw new Error('ConfigManager not initialized. Make sure services are initialized before use.');
  }
  return service;
}