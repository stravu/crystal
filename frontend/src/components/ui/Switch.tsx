import React, { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../utils/cn';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, icon, size = 'md', ...props }, ref) => {
  const sizeClasses = {
    sm: {
      track: 'w-8 h-4',
      thumb: 'w-3 h-3',
      thumbTranslate: 'data-[state=checked]:translate-x-4',
      label: 'text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      track: 'w-9 h-5',
      thumb: 'w-4 h-4',
      thumbTranslate: 'data-[state=checked]:translate-x-4',
      label: 'text-xs',
      icon: 'w-3.5 h-3.5',
    },
    lg: {
      track: 'w-11 h-6',
      thumb: 'w-5 h-5',
      thumbTranslate: 'data-[state=checked]:translate-x-5',
      label: 'text-sm',
      icon: 'w-4 h-4',
    },
  };

  const sizeConfig = sizeClasses[size];

  const switchElement = (
    <div className={cn('inline-flex items-center gap-2', className)}>
      {/* Label on the left */}
      {label && (
        <label 
          htmlFor={props.id}
          className={cn(
            'font-medium transition-colors duration-200',
            'cursor-pointer flex items-center gap-1.5',
            'hover:text-text-primary',
            props.checked ? 'text-text-primary' : 'text-text-secondary',
            sizeConfig.label
          )}
        >
          {icon && (
            <span className={cn(
              'transition-colors duration-200',
              props.checked ? 'text-interactive-on-dark' : 'text-text-tertiary',
              sizeConfig.icon
            )}>
              {icon}
            </span>
          )}
          {label}
        </label>
      )}
      
      {/* Switch Root */}
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          // Base styles
          'group relative inline-flex items-center shrink-0',
          'cursor-pointer select-none',
          'rounded-full border',
          'transition-all duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Size
          sizeConfig.track,
          // Off state
          'data-[state=unchecked]:bg-surface-interactive',
          'data-[state=unchecked]:border-border-interactive-subtle',
          // On state
          'data-[state=checked]:bg-interactive',
          'data-[state=checked]:border-interactive-hover',
          // Hover states
          'hover:data-[state=unchecked]:bg-surface-interactive-hover',
          'hover:data-[state=unchecked]:border-border-interactive',
          'hover:data-[state=checked]:bg-interactive-hover',
          // Focus state
          'focus-visible:outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-focus-ring-subtle',
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-bg-primary'
        )}
        {...props}
      >
        {/* Switch Thumb */}
        <SwitchPrimitive.Thumb className={cn(
          'pointer-events-none block rounded-full',
          'transition-transform duration-200',
          'shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
          sizeConfig.thumb,
          // Position
          'data-[state=unchecked]:translate-x-0.5',
          sizeConfig.thumbTranslate,
          // Colors
          'data-[state=unchecked]:bg-gray-100',
          'data-[state=checked]:bg-white',
          // Dark mode colors
          'dark:data-[state=unchecked]:bg-gray-600',
          'dark:data-[state=checked]:bg-white'
        )} />
      </SwitchPrimitive.Root>
    </div>
  );

  return switchElement;
});

Switch.displayName = 'Switch';

// Compact Switch variant for inline use
export const InlineSwitch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  Omit<SwitchProps, 'size'>
>(({ className, ...props }, ref) => (
  <Switch 
    ref={ref} 
    size="sm" 
    className={cn('inline-flex', className)} 
    {...props} 
  />
));

InlineSwitch.displayName = 'InlineSwitch';