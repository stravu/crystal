import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'active' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isActive?: boolean;
  children: React.ReactNode;
}

const pillVariants = {
  default: {
    base: 'bg-surface-interactive text-text-secondary hover:bg-surface-interactive-hover hover:text-text-primary shadow-sm hover:shadow-md border border-border-interactive-subtle hover:border-border-interactive',
    active: 'bg-interactive text-text-on-interactive hover:bg-interactive-hover shadow-md border border-interactive-hover',
  },
  active: {
    base: 'bg-interactive text-text-on-interactive hover:bg-interactive-hover shadow-md border border-interactive-hover',
    active: 'bg-interactive text-text-on-interactive hover:bg-interactive-hover shadow-md border border-interactive-hover',
  },
  success: {
    base: 'bg-surface-interactive text-text-secondary hover:bg-surface-interactive-hover hover:text-text-primary shadow-sm hover:shadow-md border border-border-interactive-subtle hover:border-border-interactive',
    active: 'bg-status-success text-text-on-status-success hover:bg-status-success-hover shadow-md border border-status-success',
  },
  warning: {
    base: 'bg-surface-interactive text-text-secondary hover:bg-surface-interactive-hover hover:text-text-primary shadow-sm hover:shadow-md border border-border-interactive-subtle hover:border-border-interactive',
    active: 'bg-status-warning text-text-on-status-warning hover:bg-status-warning-hover shadow-md border border-status-warning',
  },
  danger: {
    base: 'bg-surface-interactive text-text-secondary hover:bg-surface-interactive-hover hover:text-text-primary shadow-sm hover:shadow-md border border-border-interactive-subtle hover:border-border-interactive',
    active: 'bg-status-error text-text-on-status-error hover:bg-status-error-hover shadow-md border border-status-error',
  },
};

const pillSizes = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-xs',
};

export const Pill = forwardRef<HTMLButtonElement, PillProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'md',
    icon,
    iconPosition = 'left',
    isActive = false,
    children,
    disabled,
    ...props 
  }, ref) => {
    const variantStyles = pillVariants[variant];
    const currentVariantStyle = isActive ? variantStyles.active : variantStyles.base;
    
    return (
      <button
        ref={ref}
        className={cn(
          // Base styles - match switch radius and remove scaling
          'rounded-full font-medium leading-none',
          'inline-flex items-center justify-center gap-1.5',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-focus-ring-subtle focus:ring-offset-2',
          'focus:ring-offset-bg-primary',
          // Size
          pillSizes[size],
          // Variant & state
          currentVariantStyle,
          // Disabled
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        disabled={disabled}
        {...props}
      >
        {icon && iconPosition === 'left' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
        {children}
        {icon && iconPosition === 'right' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Pill.displayName = 'Pill';

// Toggle Pill - A pill that shows on/off state with a checkbox-like indicator
export interface TogglePillProps extends Omit<PillProps, 'icon' | 'iconPosition'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  icon?: React.ReactNode; // Icon to show when checked
}

export const TogglePill = forwardRef<HTMLButtonElement, TogglePillProps>(
  ({ 
    checked = false,
    onCheckedChange,
    icon,
    children,
    onClick,
    ...props 
  }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onCheckedChange?.(!checked);
      onClick?.(e);
    };
    
    const indicator = (
      <div className={cn(
        'w-3.5 h-3.5 rounded-full border-2 transition-all duration-200',
        'flex items-center justify-center',
        checked 
          ? 'bg-interactive border-interactive' 
          : 'border-border-primary'
      )}>
        {checked && icon && (
          <span className="text-text-on-interactive">{icon}</span>
        )}
      </div>
    );
    
    return (
      <Pill
        ref={ref}
        icon={indicator}
        iconPosition="left"
        isActive={checked}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Pill>
    );
  }
);

TogglePill.displayName = 'TogglePill';