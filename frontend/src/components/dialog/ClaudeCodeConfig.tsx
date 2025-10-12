import React, { useRef } from 'react';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Input';
import { Shield, ShieldOff, Sparkles, Brain, Target, Zap, Paperclip, X, FileText } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';
import type { AttachedImage, AttachedText } from '../../types/session';

export interface ClaudeCodeConfig {
  prompt?: string;
  model: 'auto' | 'sonnet' | 'opus' | 'haiku';
  permissionMode: 'ignore' | 'approve';
  ultrathink?: boolean;
  attachedImages?: AttachedImage[];
  attachedTexts?: AttachedText[];
}

interface ClaudeCodeConfigProps {
  config: ClaudeCodeConfig;
  onChange: (config: ClaudeCodeConfig) => void;
  projectId?: string;
  disabled?: boolean;
  onPaste?: (e: React.ClipboardEvent) => void;
  onRemoveImage?: (id: string) => void;
  onRemoveText?: (id: string) => void;
}

export const ClaudeCodeConfigComponent: React.FC<ClaudeCodeConfigProps> = ({
  config,
  onChange,
  projectId,
  disabled = false,
  onPaste,
  onRemoveImage,
  onRemoveText
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File): Promise<AttachedImage | null> => {
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
      {/* Prompt Field - Hidden since it's now at the top level */}
      <div className="hidden">
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
        <div className="grid grid-cols-4 gap-2">
          <Card
            variant={config.model === 'auto' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              config.model === 'auto'
                ? 'border-interactive bg-interactive/10'
                : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, model: 'auto' })}
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Sparkles className={`w-5 h-5 ${config.model === 'auto' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${config.model === 'auto' ? 'text-interactive' : ''}`}>Auto</span>
              <span className="text-xs opacity-75">Default</span>
            </div>
            {config.model === 'auto' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
          
          <Card
            variant={config.model === 'sonnet' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              config.model === 'sonnet'
                ? 'border-interactive bg-interactive/10'
                : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, model: 'sonnet' })}
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Target className={`w-5 h-5 ${config.model === 'sonnet' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${config.model === 'sonnet' ? 'text-interactive' : ''}`}>Sonnet</span>
              <span className="text-xs opacity-75">Balanced</span>
            </div>
            {config.model === 'sonnet' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
          
          <Card
            variant={config.model === 'opus' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              config.model === 'opus'
                ? 'border-interactive bg-interactive/10'
                : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, model: 'opus' })}
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Brain className={`w-5 h-5 ${config.model === 'opus' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${config.model === 'opus' ? 'text-interactive' : ''}`}>Opus</span>
              <span className="text-xs opacity-75">Maximum</span>
            </div>
            {config.model === 'opus' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
          
          <Card
            variant={config.model === 'haiku' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              config.model === 'haiku'
                ? 'border-status-success bg-status-success/10'
                : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, model: 'haiku' })}
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Zap className={`w-5 h-5 ${config.model === 'haiku' ? 'text-status-success' : ''}`} />
              <span className={`text-sm font-medium ${config.model === 'haiku' ? 'text-status-success' : ''}`}>Haiku</span>
              <span className="text-xs opacity-75">Fast</span>
            </div>
            {config.model === 'haiku' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-status-success rounded-full" />
            )}
          </Card>
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
