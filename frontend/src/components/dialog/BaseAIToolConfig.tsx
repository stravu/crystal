import React from 'react';
import { Card } from '../ui/Card';
import { Sparkles } from 'lucide-react';
import type { AttachedImage, AttachedText } from '../../types/session';

export interface BaseAIToolConfig {
  prompt?: string;
  model?: string;
  attachedImages?: AttachedImage[];
  attachedTexts?: AttachedText[];
  ultrathink?: boolean;
}

export interface BaseAIToolConfigProps {
  config: BaseAIToolConfig;
  onChange: (config: BaseAIToolConfig) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const BaseAIToolConfigComponent: React.FC<BaseAIToolConfigProps> = ({
  children
}) => {
  return (
    <Card variant="bordered" className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-interactive" />
        <span className="text-sm font-medium text-text-secondary">AI Tool Configuration</span>
      </div>
      
      {children}
    </Card>
  );
};