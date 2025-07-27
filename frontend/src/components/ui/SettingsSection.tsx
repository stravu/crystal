import React from 'react';
import { cn } from '../../utils/cn';

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  spacing?: 'sm' | 'md' | 'lg';
}

export function SettingsSection({
  title,
  description,
  icon,
  children,
  className,
  spacing = 'md'
}: SettingsSectionProps) {
  const spacingClasses = {
    sm: 'space-y-3',
    md: 'space-y-4',
    lg: 'space-y-6'
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex-shrink-0 mt-0.5 text-interactive">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-text-primary">
            {title}
          </h4>
          {description && (
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className={cn('ml-6', spacingClasses[spacing])}>
        {children}
      </div>
    </div>
  );
}