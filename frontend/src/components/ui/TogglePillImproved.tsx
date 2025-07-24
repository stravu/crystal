import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import { Check } from 'lucide-react';

export interface TogglePillImprovedProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

export const TogglePillImproved = forwardRef<HTMLButtonElement, TogglePillImprovedProps>(
  ({ 
    checked = false,
    onCheckedChange,
    icon,
    children,
    onClick,
    size = 'md',
    className,
    disabled,
    ...props 
  }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        onCheckedChange?.(!checked);
        onClick?.(e);
      }
    };
    
    const sizeClasses = {
      sm: 'px-3 py-1 text-xs gap-1.5',
      md: 'px-3.5 py-1.5 text-xs gap-2',
    };

    const indicatorSizeClasses = {
      sm: 'w-3.5 h-3.5',
      md: 'w-4 h-4',
    };

    const iconSizeClasses = {
      sm: 'w-2.5 h-2.5',
      md: 'w-3 h-3',
    };
    
    return (
      <button
        ref={ref}
        role="switch"
        aria-checked={checked}
        className={cn(
          // Base styles
          'rounded-full font-medium leading-none',
          'inline-flex items-center',
          'transition-all duration-200',
          'cursor-pointer select-none',
          'border',
          
          // Size
          sizeClasses[size],
          
          // State styles
          checked ? [
            // On state
            'bg-interactive-surface',
            'text-interactive-on-dark',
            'border-interactive-border',
            'hover:bg-interactive-surface-hover',
            'hover:border-interactive-border-hover',
            'hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]',
          ] : [
            // Off state
            'bg-surface-interactive',
            'text-text-interactive-muted',
            'border-border-interactive-subtle',
            'hover:bg-surface-interactive-hover',
            'hover:text-text-secondary',
            'hover:border-border-interactive',
            'hover:translate-y-[-1px]',
            'hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]',
          ],
          
          // Focus state - keyboard only
          'focus-visible:outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-focus-ring-subtle',
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-bg-primary',
          
          // Active/pressed state
          'active:scale-[0.98]',
          'active:transition-transform',
          'active:duration-75',
          
          // Disabled state
          disabled && [
            'opacity-50',
            'cursor-not-allowed',
            'hover:scale-100',
            'hover:translate-y-0',
            'hover:shadow-none',
          ],
          
          className
        )}
        disabled={disabled}
        onClick={handleClick}
        {...props}
      >
        {/* Indicator */}
        <div className={cn(
          'rounded border-2 transition-all duration-200',
          'flex items-center justify-center flex-shrink-0',
          indicatorSizeClasses[size],
          checked ? [
            'bg-interactive',
            'border-interactive',
          ] : [
            'bg-surface-secondary',
            'border-border-secondary',
          ]
        )}>
          {checked && (
            icon ? (
              <span className={cn('text-white', iconSizeClasses[size])}>
                {icon}
              </span>
            ) : (
              <Check className={cn('text-white', iconSizeClasses[size])} />
            )
          )}
        </div>
        
        {/* Label */}
        <span className="font-medium">
          {children}
        </span>
      </button>
    );
  }
);

TogglePillImproved.displayName = 'TogglePillImproved';