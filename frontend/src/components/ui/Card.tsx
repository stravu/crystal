import React from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  nesting?: 'primary' | 'secondary' | 'tertiary';
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ 
    className, 
    variant = 'default',
    padding = 'md',
    nesting = 'primary',
    children,
    ...props 
  }, ref) => {
    const baseStyles = 'rounded-card transition-all duration-normal';
    
    const variants = {
      default: '',
      bordered: 'border',
      elevated: 'shadow-card hover:shadow-modal',
      interactive: 'cursor-pointer hover:shadow-md'
    };
    
    const nestingLevels = {
      primary: 'bg-surface-primary border-border-primary',
      secondary: 'bg-surface-secondary border-border-secondary',
      tertiary: 'bg-bg-tertiary border-border-secondary'
    };
    
    const paddings = {
      none: '',
      sm: 'p-card-sm',
      md: 'p-card',
      lg: 'p-card-lg'
    };
    
    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          nestingLevels[nesting],
          variants[variant],
          paddings[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header component for consistent card headers
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, actions, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between pb-4 mb-4 border-b border-border-primary',
          className
        )}
        {...props}
      >
        <div className="flex-1">{children}</div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

// Card Content component for consistent spacing
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

// Card Footer component
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-end gap-3 pt-4 mt-4 border-t border-border-primary',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';