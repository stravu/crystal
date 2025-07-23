import React from 'react';
import { cn } from '../../utils/cn';

interface StatusDotProps {
  status: 'running' | 'waiting' | 'success' | 'error' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
}

const statusColors = {
  running: 'bg-status-success',
  waiting: 'bg-status-warning',
  success: 'bg-status-success',
  error: 'bg-status-error',
  info: 'bg-status-info',
  default: 'bg-status-neutral'
};

const sizeClasses = {
  sm: {
    dot: 'w-2 h-2',
    container: 'w-3 h-3'
  },
  md: {
    dot: 'w-3 h-3',
    container: 'w-4 h-4'
  },
  lg: {
    dot: 'w-4 h-4',
    container: 'w-5 h-5'
  }
};

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  animated = false,
  pulse = false,
  className,
  title
}) => {
  const sizes = sizeClasses[size];
  const color = statusColors[status];

  return (
    <div 
      className={cn('relative flex items-center justify-center', sizes.container, className)}
      title={title}
    >
      <div
        className={cn(
          sizes.dot,
          color,
          'rounded-full',
          animated && 'animate-pulse',
          pulse && 'animate-ping'
        )}
      />
      {pulse && (
        <div
          className={cn(
            'absolute inset-0',
            sizes.dot,
            color,
            'rounded-full opacity-75'
          )}
        />
      )}
    </div>
  );
};