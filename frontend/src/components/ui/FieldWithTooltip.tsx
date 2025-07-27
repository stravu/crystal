import React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Tooltip } from './Tooltip';

export interface FieldWithTooltipProps {
  label: string;
  tooltip: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FieldWithTooltip: React.FC<FieldWithTooltipProps> = ({
  label,
  tooltip,
  required = false,
  children,
  className,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <label className="block text-label font-medium text-text-primary">
          {label}
          {required && <span className="text-status-error ml-1">*</span>}
        </label>
        <Tooltip content={tooltip} side="right">
          <HelpCircle className="w-4 h-4 text-text-tertiary hover:text-text-secondary cursor-help transition-colors" />
        </Tooltip>
      </div>
      {children}
    </div>
  );
};

FieldWithTooltip.displayName = 'FieldWithTooltip';