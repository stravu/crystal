import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
  title?: string;
}

const variantClasses = {
  default: 'bg-surface-secondary text-text-secondary border-border-secondary dark:border-border-secondary/60',
  success: 'bg-status-success/20 text-status-success border-status-success/30 dark:border-status-success/20',
  warning: 'bg-status-warning/20 text-status-warning border-status-warning/30 dark:border-status-warning/20',
  error: 'bg-status-error/20 text-status-error border-status-error/30 dark:border-status-error/20',
  info: 'bg-status-info/20 text-status-info border-status-info/30 dark:border-status-info/20',
  primary: 'bg-interactive/20 text-interactive border-interactive/30 dark:border-interactive/20'
};

const sizeClasses = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2'
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  children,
  className,
  animated = false,
  pulse = false,
  icon,
  title
}) => {
  return (
    <div 
      className={cn(
        'inline-flex items-center gap-2 rounded-full border transition-all duration-200',
        variantClasses[variant],
        sizeClasses[size],
        animated && 'relative overflow-hidden',
        className
      )}
      title={title}
    >
      {/* Animated background effect */}
      {animated && (
        <div className="absolute inset-0 -z-10">
          <div 
            className={cn(
              'absolute inset-0 opacity-20',
              variant === 'success' && 'bg-status-success',
              variant === 'warning' && 'bg-status-warning',
              variant === 'error' && 'bg-status-error',
              variant === 'info' && 'bg-status-info',
              pulse && 'animate-pulse'
            )} 
          />
        </div>
      )}
      
      {icon}
      
      <span className="font-medium">
        {children}
      </span>
      
      {/* Pulsing dot for active states */}
      {pulse && (
        <div className="relative flex h-2 w-2">
          <span className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            variant === 'success' && 'bg-status-success',
            variant === 'warning' && 'bg-status-warning',
            variant === 'error' && 'bg-status-error',
            variant === 'info' && 'bg-status-info'
          )}></span>
          <span className={cn(
            'relative inline-flex rounded-full h-2 w-2',
            variant === 'success' && 'bg-status-success',
            variant === 'warning' && 'bg-status-warning',
            variant === 'error' && 'bg-status-error',
            variant === 'info' && 'bg-status-info'
          )}></span>
        </div>
      )}
    </div>
  );
};