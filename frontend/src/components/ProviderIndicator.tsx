import React from 'react';
import { Brain, Bot, Cloud } from 'lucide-react';

interface ProviderIndicatorProps {
  providerId?: string;
  providerModel?: string;
  size?: 'small' | 'medium' | 'large';
  showModel?: boolean;
}

const PROVIDER_CONFIGS = {
  'zai': {
    name: 'Z.ai',
    icon: Brain,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30'
  },
  'anthropic': {
    name: 'Claude',
    icon: Bot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30'
  },
  'openai': {
    name: 'OpenAI',
    icon: Cloud,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30'
  }
};

const DEFAULT_CONFIG = {
  name: 'Unknown',
  icon: Bot,
  color: 'text-gray-500',
  bgColor: 'bg-gray-500/10',
  borderColor: 'border-gray-500/30'
};

export const ProviderIndicator: React.FC<ProviderIndicatorProps> = ({
  providerId,
  providerModel,
  size = 'medium',
  showModel = true
}) => {
  if (!providerId) {
    return null;
  }

  const config = PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS] || DEFAULT_CONFIG;
  const Icon = config.icon;

  const sizeClasses = {
    small: 'text-xs px-2 py-1 gap-1',
    medium: 'text-sm px-3 py-1.5 gap-1.5',
    large: 'text-base px-4 py-2 gap-2'
  };

  const iconSizes = {
    small: 14,
    medium: 16,
    large: 18
  };

  return (
    <div
      className={`
        inline-flex items-center rounded-md border
        ${config.bgColor} ${config.borderColor} ${config.color}
        ${sizeClasses[size]}
      `}
      title={`${config.name}${providerModel && showModel ? ` (${providerModel})` : ''}`}
    >
      <Icon size={iconSizes[size]} />
      <span className="font-medium">{config.name}</span>
      {providerModel && showModel && (
        <span className="text-xs opacity-75">({providerModel})</span>
      )}
    </div>
  );
};