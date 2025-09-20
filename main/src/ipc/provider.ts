import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { ProviderDiscoveryService } from '../services/providerDiscoveryService';
import { PROVIDERS } from '../data/providers';

export function registerProviderHandlers(ipcMain: IpcMain, { logger }: AppServices): void {
  const providerDiscoveryService = new ProviderDiscoveryService(logger);

  ipcMain.handle('providers:discover', async () => {
    try {
      console.log('[Providers] Discovering available providers...');
      const providers = await providerDiscoveryService.discoverAvailableProviders();
      console.log('[Providers] Discovered providers:', providers.length);
      return { success: true, data: providers };
    } catch (error) {
      console.error('Failed to discover providers:', error);
      return { success: false, error: 'Failed to discover providers' };
    }
  });

  ipcMain.handle('providers:configs', async () => {
    try {
      console.log('[Providers] Getting provider configurations...');
      return { success: true, data: PROVIDERS };
    } catch (error) {
      console.error('Failed to get provider configs:', error);
      return { success: false, error: 'Failed to get provider configs' };
    }
  });

  ipcMain.handle('providers:switch', async (_event, providerId: string) => {
    try {
      console.log('[Providers] Switching to provider:', providerId);

      // Validate provider exists
      const provider = PROVIDERS.find(p => p.id === providerId);
      if (!provider) {
        return { success: false, error: `Provider ${providerId} not found` };
      }

      // Check if provider is available
      const availableProviders = await providerDiscoveryService.discoverAvailableProviders();
      const isAvailable = availableProviders.some(p => p.providerId === providerId && p.isAvailable);

      if (!isAvailable) {
        return { success: false, error: `Provider ${providerId} is not available` };
      }

      console.log('[Providers] Successfully switched to provider:', provider.name);
      return { success: true, data: provider };
    } catch (error) {
      console.error('Failed to switch provider:', error);
      return { success: false, error: 'Failed to switch provider' };
    }
  });

  ipcMain.handle('providers:models', async (_event, providerId: string) => {
    try {
      console.log('[Providers] Getting models for provider:', providerId);

      const provider = PROVIDERS.find(p => p.id === providerId);
      if (!provider) {
        return { success: false, error: `Provider ${providerId} not found` };
      }

      // Get available models from discovery service
      const availableProviders = await providerDiscoveryService.discoverAvailableProviders();
      const providerConfig = availableProviders.find(p => p.providerId === providerId);

      let models = provider.models;
      if (providerConfig && providerConfig.detectedModels.length > 0) {
        // Filter models to only include detected ones
        models = provider.models.filter(model =>
          providerConfig.detectedModels.includes(model.id)
        );
      }

      console.log('[Providers] Available models:', models.length);
      return { success: true, data: models };
    } catch (error) {
      console.error('Failed to get provider models:', error);
      return { success: false, error: 'Failed to get provider models' };
    }
  });
}