import React, { useRef } from 'react';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Input';
import { Shield, ShieldOff, Sparkles, Brain, Target, Zap, Paperclip, X, FileText } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';

export interface ClaudeCodeConfig {
  prompt?: string;
  model: string; // Changed to support both Claude and GLM models
  permissionMode: 'ignore' | 'approve';
  ultrathink?: boolean;
  attachedImages?: any[];
  attachedTexts?: any[];
}

interface ClaudeCodeConfigProps {
  config: ClaudeCodeConfig;
  onChange: (config: ClaudeCodeConfig) => void;
  projectId?: string;
  disabled?: boolean;
  onPaste?: (e: React.ClipboardEvent) => void;
  onRemoveImage?: (id: string) => void;
  onRemoveText?: (id: string) => void;
  providerId?: string; // Add provider ID to determine which models to show
}

export const ClaudeCodeConfigComponent: React.FC<ClaudeCodeConfigProps> = ({
  config,
  onChange,
  projectId,
  disabled = false,
  onPaste,
  onRemoveImage,
  onRemoveText,
  providerId = 'anthropic' // Default to anthropic
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Define available models based on provider
  const getAvailableModels = () => {
    if (providerId === 'zai') {
      return [
        { id: 'glm-4.5', name: 'GLM-4.5', description: 'High capability', icon: Brain, default: true },
        { id: 'glm-4.5-air', name: 'GLM-4.5-Air', description: 'Fast & efficient', icon: Zap, default: false }
      ];
    }

    // Default Claude models
    return [
      { id: 'auto', name: 'Auto', description: 'Default', icon: Sparkles, default: true },
      { id: 'sonnet', name: 'Sonnet', description: 'Balanced', icon: Brain, default: false },
      { id: 'opus', name: 'Opus', description: 'Advanced', icon: Target, default: false },
      { id: 'haiku', name: 'Haiku', description: 'Fast', icon: Zap, default: false }
    ];
  };

  const availableModels = getAvailableModels();
  
  const processFile = async (file: File): Promise<any | null> => {
    const generateImageId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!file.type.startsWith('image/')) {
      console.warn('File is not an image:', file.name);
      return null;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn('Image file too large (max 10MB):', file.name);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve({
            id: generateImageId(),
            name: file.name,
            dataUrl: e.target.result as string,
            size: file.size,
            type: file.type,
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };
  return (
    <div className="space-y-4">
      {/* Prompt Field */}
      <div>
        <label htmlFor="claude-prompt" className="block text-sm font-medium text-text-secondary mb-2">
          Initial Prompt
        </label>
        {(config.attachedImages?.length ?? 0) > 0 || (config.attachedTexts?.length ?? 0) > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {config.attachedTexts?.map(text => (
              <div key={text.id} className="relative group">
                <div className="h-12 px-3 flex items-center gap-2 bg-surface-secondary rounded border border-border-primary">
                  <FileText className="w-4 h-4 text-text-secondary" />
                  <span className="text-xs text-text-secondary max-w-[150px] truncate">
                    {text.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    if (onRemoveText) {
                      onRemoveText(text.id);
                    } else {
                      onChange({
                        ...config,
                        attachedTexts: (config.attachedTexts || []).filter(item => item.id !== text.id)
                      });
                    }
                  }}
                  className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  aria-label={`Remove ${text.name}`}
                >
                  <X className="w-2.5 h-2.5 text-text-secondary" />
                </button>
              </div>
            ))}

            {config.attachedImages?.map(image => (
              <div key={image.id} className="relative group">
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="h-12 w-12 object-cover rounded border border-border-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    if (onRemoveImage) {
                      onRemoveImage(image.id);
                    } else {
                      onChange({
                        ...config,
                        attachedImages: (config.attachedImages || []).filter(item => item.id !== image.id)
                      });
                    }
                  }}
                  className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  aria-label={`Remove ${image.name}`}
                >
                  <X className="w-2.5 h-2.5 text-text-secondary" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="relative">
          <FilePathAutocomplete
            value={config.prompt || ''}
            onChange={(value) => onChange({ ...config, prompt: value })}
            projectId={projectId}
            placeholder="Describe your task... (use @ to reference files)"
            className="w-full px-3 py-2 pr-10 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary placeholder-text-tertiary"
            isTextarea={true}
            rows={3}
            onPaste={onPaste}
            disabled={disabled}
          />
          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-2 right-2 p-1.5 rounded hover:bg-surface-hover transition-colors"
            title="Attach images"
            disabled={disabled}
          >
            <Paperclip className="w-4 h-4 text-text-tertiary hover:text-text-secondary" />
          </button>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
              const image = await processFile(file);
              if (image) {
                onChange({ 
                  ...config, 
                  attachedImages: [...(config.attachedImages || []), image] 
                });
              }
            }
            e.target.value = ''; // Reset input
          }}
        />
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Model
        </label>
        <div className={`grid gap-2 ${availableModels.length <= 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
          {availableModels.map((model) => {
            const IconComponent = model.icon;
            const isSelected = config.model === model.id;
            const isDefault = model.default;

            return (
              <Card
                key={model.id}
                variant={isSelected ? 'interactive' : 'bordered'}
                padding="sm"
                className={`relative cursor-pointer transition-all ${
                  isSelected
                    ? 'border-interactive bg-interactive/10'
                    : ''
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (!disabled) {
                    onChange({ ...config, model: model.id });
                  }
                }}
              >
                <div className="flex flex-col items-center gap-1 py-2">
                  <IconComponent className={`w-5 h-5 ${isSelected ? 'text-interactive' : ''}`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-interactive' : ''}`}>{model.name}</span>
                  <span className="text-xs opacity-75">{isDefault ? 'Default' : model.description}</span>
                </div>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Additional Options */}
      <div className="space-y-3">
        {/* Ultrathink Mode */}
        <Checkbox
          id="claude-ultrathink"
          label="Enable ultrathink mode"
          checked={config.ultrathink || false}
          onChange={(e) => onChange({ ...config, ultrathink: e.target.checked })}
          disabled={disabled}
        />
        
        {/* Permission Mode */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Permission Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Card
              variant={config.permissionMode === 'ignore' ? 'interactive' : 'bordered'}
              padding="sm"
              className={`relative cursor-pointer transition-all ${
                config.permissionMode === 'ignore'
                  ? 'border-interactive bg-interactive/10'
                  : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onChange({ ...config, permissionMode: 'ignore' })}
            >
              <div className="flex flex-col items-center gap-1 py-2">
                <ShieldOff className={`w-5 h-5 ${config.permissionMode === 'ignore' ? 'text-interactive' : 'text-text-tertiary'}`} />
                <span className={`text-sm font-medium ${config.permissionMode === 'ignore' ? 'text-interactive' : ''}`}>Skip</span>
                <span className="text-xs opacity-75">Default</span>
              </div>
              {config.permissionMode === 'ignore' && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
              )}
            </Card>
            
            <Card
              variant={config.permissionMode === 'approve' ? 'interactive' : 'bordered'}
              padding="sm"
              className={`relative cursor-pointer transition-all ${
                config.permissionMode === 'approve'
                  ? 'border-status-success bg-status-success/10'
                  : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onChange({ ...config, permissionMode: 'approve' })}
            >
              <div className="flex flex-col items-center gap-1 py-2">
                <Shield className={`w-5 h-5 ${config.permissionMode === 'approve' ? 'text-status-success' : ''}`} />
                <span className={`text-sm font-medium ${config.permissionMode === 'approve' ? 'text-status-success' : ''}`}>Manual</span>
                <span className="text-xs opacity-75">Approve</span>
              </div>
              {config.permissionMode === 'approve' && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-status-success rounded-full" />
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
