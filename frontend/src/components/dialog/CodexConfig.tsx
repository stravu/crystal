import React, { useRef } from 'react';
import { Card } from '../ui/Card';
import { Cpu, Paperclip, X, FileText, Brain, Gauge, Zap } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';
import { CODEX_MODELS, type OpenAICodexModel } from '../../../../shared/types/models';
import type { AttachedImage, AttachedText } from '../../types/session';

export interface CodexConfig {
  prompt?: string;
  model?: OpenAICodexModel;
  modelProvider?: string;
  approvalPolicy?: 'auto' | 'manual';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch?: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  attachedImages?: AttachedImage[];
  attachedTexts?: AttachedText[];
}

interface CodexConfigProps {
  config: CodexConfig;
  onChange: (config: CodexConfig) => void;
  projectId?: string;
  disabled?: boolean;
  onPaste?: (e: React.ClipboardEvent) => void;
  onRemoveImage?: (id: string) => void;
  onRemoveText?: (id: string) => void;
}

export const CodexConfigComponent: React.FC<CodexConfigProps> = ({
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
        <label htmlFor="codex-prompt" className="block text-sm font-medium text-text-secondary mb-2">
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
        <div className="grid grid-cols-3 gap-2">
          {Object.values(CODEX_MODELS).filter(m => m.id !== 'auto').map(modelCfg => (
            <Card
              key={modelCfg.id}
              variant={config.model === modelCfg.id ? 'interactive' : 'bordered'}
              padding="sm"
              className={`relative cursor-pointer transition-all ${
                config.model === modelCfg.id ? 'border-interactive bg-interactive/10' : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onChange({ ...config, model: modelCfg.id as OpenAICodexModel, modelProvider: 'openai' })}
              title={modelCfg.description}
            >
              <div className="flex flex-col items-center gap-1 py-2">
                <Cpu className={`w-5 h-5 ${config.model === modelCfg.id ? 'text-interactive' : ''}`} />
                <span className={`text-sm font-medium ${config.model === modelCfg.id ? 'text-interactive' : ''}`}>{modelCfg.label}</span>
                <span className="text-xs opacity-75">OpenAI</span>
              </div>
              {config.model === modelCfg.id && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Thinking Level */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Thinking Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Card
            variant={(config.thinkingLevel || 'medium') === 'low' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              (config.thinkingLevel || 'medium') === 'low' ? 'border-interactive bg-interactive/10' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, thinkingLevel: 'low' })}
            title="Low thinking - Faster responses with less reasoning"
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Gauge className={`w-5 h-5 ${(config.thinkingLevel || 'medium') === 'low' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${(config.thinkingLevel || 'medium') === 'low' ? 'text-interactive' : ''}`}>Low</span>
              <span className="text-xs opacity-75">Fast</span>
            </div>
            {(config.thinkingLevel || 'medium') === 'low' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
          <Card
            variant={(config.thinkingLevel || 'medium') === 'medium' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              (config.thinkingLevel || 'medium') === 'medium' ? 'border-interactive bg-interactive/10' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, thinkingLevel: 'medium' })}
            title="Medium thinking - Balanced speed and reasoning (default)"
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Brain className={`w-5 h-5 ${(config.thinkingLevel || 'medium') === 'medium' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${(config.thinkingLevel || 'medium') === 'medium' ? 'text-interactive' : ''}`}>Medium</span>
              <span className="text-xs opacity-75">Balanced</span>
            </div>
            {(config.thinkingLevel || 'medium') === 'medium' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
          <Card
            variant={(config.thinkingLevel || 'medium') === 'high' ? 'interactive' : 'bordered'}
            padding="sm"
            className={`relative cursor-pointer transition-all ${
              (config.thinkingLevel || 'medium') === 'high' ? 'border-interactive bg-interactive/10' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onChange({ ...config, thinkingLevel: 'high' })}
            title="High thinking - Slower but more thorough reasoning"
          >
            <div className="flex flex-col items-center gap-1 py-2">
              <Zap className={`w-5 h-5 ${(config.thinkingLevel || 'medium') === 'high' ? 'text-interactive' : ''}`} />
              <span className={`text-sm font-medium ${(config.thinkingLevel || 'medium') === 'high' ? 'text-interactive' : ''}`}>High</span>
              <span className="text-xs opacity-75">Thorough</span>
            </div>
            {(config.thinkingLevel || 'medium') === 'high' && (
              <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
            )}
          </Card>
        </div>
      </div>

      {/* Additional Options */}
      <div className="space-y-3">
        {/* Web Search - Hidden for Codex as it doesn't work */}
        {/* <Checkbox
          id="codex-websearch"
          label="Enable web search"
          checked={config.webSearch || false}
          onChange={(e) => onChange({ ...config, webSearch: e.target.checked })}
          disabled={disabled}
        /> */}
        
        {/* Approval Policy - Hidden as Crystal doesn't implement approval handling for Codex */}
        {/* Manual approval mode requires implementing exec_approval_request and patch_approval_request handlers */}
        {/* which Crystal currently doesn't support, so we default to 'auto' */}
        
        {/* Sandbox Mode */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Sandbox Mode
          </label>
          <div className="space-y-2">
            <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="codex-sandbox"
                value="read-only"
                checked={config.sandboxMode === 'read-only'}
                onChange={(e) => onChange({ ...config, sandboxMode: e.target.value as 'read-only' | 'workspace-write' | 'danger-full-access' })}
                className="text-interactive"
                disabled={disabled}
              />
              <span className="text-sm text-text-secondary">Read-only</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="codex-sandbox"
                value="workspace-write"
                checked={config.sandboxMode === 'workspace-write'}
                onChange={(e) => onChange({ ...config, sandboxMode: e.target.value as 'read-only' | 'workspace-write' | 'danger-full-access' })}
                className="text-interactive"
                disabled={disabled}
              />
              <span className="text-sm text-text-secondary">Workspace write</span>
              <span className="text-xs text-text-tertiary">(default)</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="codex-sandbox"
                value="danger-full-access"
                checked={config.sandboxMode === 'danger-full-access'}
                onChange={(e) => onChange({ ...config, sandboxMode: e.target.value as 'read-only' | 'workspace-write' | 'danger-full-access' })}
                className="text-interactive"
                disabled={disabled}
              />
              <span className="text-sm text-status-error">Full access (dangerous)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
