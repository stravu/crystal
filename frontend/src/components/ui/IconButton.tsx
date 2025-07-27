import React from 'react';
import { cn } from '../../utils/cn';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ 
    className, 
    variant = 'ghost', 
    size = 'md', 
    icon,
    disabled,
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50 rounded';
    
    const variants = {
      primary: 'bg-interactive text-white hover:bg-interactive-hover focus:ring-interactive shadow-button hover:shadow-button-hover',
      secondary: 'bg-surface-secondary text-text-secondary hover:bg-surface-hover focus:ring-border-primary',
      ghost: 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover focus:ring-border-primary',
      danger: 'bg-status-error text-white hover:bg-status-error-hover focus:ring-status-error',
    };

    const sizes = {
      sm: 'h-8 w-8 text-sm',
      md: 'h-10 w-10 text-base',
      lg: 'h-12 w-12 text-lg',
    };

    return (
      <button
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled}
        ref={ref}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';