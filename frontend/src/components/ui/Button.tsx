import React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    fullWidth = false,
    loading = false,
    loadingText,
    icon,
    disabled,
    children,
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50';
    
    const variants = {
      primary: 'bg-interactive text-text-on-interactive hover:bg-interactive-hover focus:ring-interactive shadow-button hover:shadow-button-hover',
      secondary: 'bg-surface-secondary text-text-secondary hover:bg-surface-hover focus:ring-border-primary',
      ghost: 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover focus:ring-border-primary',
      danger: 'bg-status-error text-white hover:bg-status-error-hover focus:ring-status-error',
    };
    
    const sizes = {
      sm: 'px-button-x-sm py-button-y-sm text-sm rounded-button',
      md: 'px-button-x py-button-y text-button rounded-button',
      lg: 'px-button-x-lg py-button-y-lg text-lg rounded-button',
    };
    
    const widthStyles = fullWidth ? 'w-full' : '';
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          widthStyles,
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg 
            className="animate-spin -ml-1 mr-2 h-4 w-4" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {icon && !loading && <span className="mr-2">{icon}</span>}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Icon Button variant
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'fullWidth'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ 
    className, 
    variant = 'ghost', 
    size = 'md', 
    icon,
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center transition-all duration-normal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-50';
    
    const variants = {
      primary: 'bg-interactive text-text-on-interactive hover:bg-interactive-hover focus:ring-interactive',
      secondary: 'bg-surface-secondary text-text-secondary hover:bg-surface-hover focus:ring-border-primary',
      ghost: 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover focus:ring-border-primary',
      danger: 'bg-status-error text-white hover:bg-status-error-hover focus:ring-status-error',
    };
    
    const sizes = {
      sm: 'p-1 rounded',
      md: 'p-2 rounded-md',
      lg: 'p-3 rounded-lg',
    };
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';