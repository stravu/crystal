import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/Select';
import { Badge } from './ui/Badge';
import { API } from '../utils/api';
import { Brain, Zap, Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ProviderConfig, DiscoveredProvider, ProviderModel } from '../types/providers';

interface ProviderSelectionProps {
  selectedProvider?: string;
  selectedModel?: string;
  onProviderChange: (providerId: string, modelId: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ProviderSelection({
  selectedProvider,
  selectedModel,
  onProviderChange,
  className = '',
  disabled = false
}: ProviderSelectionProps) {
  const [availableProviders, setAvailableProviders] = useState<DiscoveredProvider[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load discovered providers (availability)
      const discoveredResponse = await API.providers.discover();
      const discovered: DiscoveredProvider[] = discoveredResponse.data || [];
      setAvailableProviders(discovered);

      // Load provider configurations
      const configsResponse = await API.providers.getConfigs();
      const configs: ProviderConfig[] = configsResponse.data || [];
      setProviderConfigs(configs);
    } catch (err) {
      console.error('Failed to load providers:', err);
      setError('Failed to load provider configurations');
    } finally {
      setLoading(false);
    }
  };

  const getProviderConfig = (providerId: string): ProviderConfig | undefined => {
    return providerConfigs.find(config => config.id === providerId);
  };

  const getAvailableModels = (providerId: string): ProviderModel[] => {
    const discovered = availableProviders.find(p => p.providerId === providerId);
    const config = getProviderConfig(providerId);

    if (!config) return [];

    // Use discovered models if available, otherwise fall back to config models
    if (discovered && discovered.detectedModels.length > 0) {
      return config.models.filter(model =>
        discovered.detectedModels.includes(model.id)
      );
    }

    return config.models;
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'anthropic':
        return <Brain className="w-5 h-5" />;
      case 'zai':
        return <Zap className="w-5 h-5" />;
      default:
        return <Shield className="w-5 h-5" />;
    }
  };

  const getProviderStatus = (providerId: string): 'available' | 'unavailable' | 'loading' => {
    if (loading) return 'loading';
    const discovered = availableProviders.find(p => p.providerId === providerId);
    return discovered?.isAvailable ? 'available' : 'unavailable';
  };

  const selectedProviderConfig = selectedProvider ? getProviderConfig(selectedProvider) : undefined;
  const availableModels = selectedProvider ? getAvailableModels(selectedProvider) : [];
  const currentStatus = selectedProvider ? getProviderStatus(selectedProvider) : 'loading';

  if (loading && availableProviders.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading providers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="bordered" className={`p-4 border-red-500 ${className}`}>
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadProviders} className="ml-auto">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          AI Provider
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providerConfigs.map((provider) => {
            const status = getProviderStatus(provider.id);
            const isSelected = selectedProvider === provider.id;
            const discovered = availableProviders.find(p => p.providerId === provider.id);

            return (
              <Card
                key={provider.id}
                variant={isSelected ? 'interactive' : 'bordered'}
                padding="sm"
                className={`
                  relative cursor-pointer transition-all
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}
                  ${isSelected ? 'ring-2 ring-blue-500' : ''}
                `}
                onClick={() => {
                  if (!disabled && status === 'available') {
                    const firstModel = getAvailableModels(provider.id)[0];
                    if (firstModel) {
                      onProviderChange(provider.id, firstModel.id);
                    }
                  }
                }}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getProviderIcon(provider.id)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {provider.name}
                      </h4>
                      <div className="flex items-center space-x-2">
                        {status === 'available' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {status === 'unavailable' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        {status === 'loading' && (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {provider.description}
                    </p>

                    {discovered?.configPath && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Config: {discovered.configPath.split('/').pop()}
                      </p>
                    )}

                    {provider.models.length > 0 && (
                      <div className="flex items-center space-x-1 mt-2">
                        <Badge variant="primary" className="text-xs">
                          {provider.models.length} models
                        </Badge>
                        {provider.capabilities.supportsResume && (
                          <Badge variant="default" className="text-xs">
                            Resume
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Model Selection */}
      {selectedProviderConfig && availableModels.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Model
          </label>
          <Select
            value={selectedModel}
            onValueChange={(modelId) => onProviderChange(selectedProvider!, modelId)}
            disabled={disabled || currentStatus !== 'available'}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{model.name}</span>
                    {model.default && (
                      <Badge variant="default" className="ml-2 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProviderConfig.costTracking && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pricing: ${selectedProviderConfig.costTracking.prices[selectedModel || selectedProviderConfig.models[0]?.id]?.inputPricePer1m || 0}/1M input tokens
            </p>
          )}
        </div>
      )}

      {/* Status Messages */}
      {selectedProvider && currentStatus === 'unavailable' && (
        <Card variant="bordered" className="p-3 border-yellow-500">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            <span className="text-sm">
              Provider "{selectedProviderConfig?.name}" is not available. Please check your configuration.
            </span>
          </div>
        </Card>
      )}

      {/* Configuration Info */}
      {selectedProviderConfig && (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>
            <strong>Capabilities:</strong>{' '}
            {selectedProviderConfig.capabilities.supportsFileOperations && 'File Operations '}
            {selectedProviderConfig.capabilities.supportsGitIntegration && 'Git Integration '}
            {selectedProviderConfig.capabilities.supportsSystemPrompts && 'System Prompts'}
          </p>
          <p>
            <strong>Command:</strong> {selectedProviderConfig.command.executable}{' '}
            {selectedProviderConfig.command.args.join(' ')}
          </p>
        </div>
      )}
    </div>
  );
}