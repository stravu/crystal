import React, { forwardRef, useId } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../utils/cn';

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const SwitchSimple = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, icon, size = 'md', id, ...props }, ref) => {
  // Generate a unique ID - hooks must be called unconditionally
  const generatedId = useId();
  const switchId = id || generatedId;
  const sizes = {
    sm: {
      track: 'h-4 w-8',
      thumb: 'h-3 w-3 data-[state=checked]:translate-x-4',
      label: 'text-xs',
      icon: 'w-3 h-3',
    },
    md: {
      track: 'h-5 w-9',
      thumb: 'h-4 w-4 data-[state=checked]:translate-x-4',
      label: 'text-xs',
      icon: 'w-3.5 h-3.5',
    },
    lg: {
      track: 'h-6 w-11',
      thumb: 'h-5 w-5 data-[state=checked]:translate-x-5',
      label: 'text-sm',
      icon: 'w-4 h-4',
    },
  };

  const sizeConfig = sizes[size];

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {label && (
        <label 
          htmlFor={switchId}
          className={cn(
            'font-medium cursor-pointer inline-flex items-center gap-1 transition-colors duration-200',
            sizeConfig.label,
            props.checked ? 'text-text-secondary' : 'text-text-tertiary',
            'hover:text-text-primary'
          )}
        >
          {icon && (
            <span className={cn(
              'inline-flex items-center justify-center transition-colors duration-200',
              sizeConfig.icon,
              props.checked ? 'text-interactive-on-dark' : 'text-text-muted'
            )}>
              {icon}
            </span>
          )}
          <span>{label}</span>
        </label>
      )}
      
      <SwitchPrimitive.Root
        ref={ref}
        id={switchId}
        className={cn(
          'group peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // OFF state - with proper background and border
          'data-[state=unchecked]:bg-surface-interactive',
          'data-[state=unchecked]:border data-[state=unchecked]:border-border-interactive-subtle',
          'data-[state=unchecked]:hover:bg-surface-interactive-hover',
          'data-[state=unchecked]:hover:border-border-interactive',
          // ON state - blue background
          'data-[state=checked]:bg-interactive',
          'data-[state=checked]:border data-[state=checked]:border-interactive-hover',
          'data-[state=checked]:hover:bg-interactive-hover',
          // Add subtle inset shadow for depth
          'shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]',
          sizeConfig.track
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block rounded-full shadow-md ring-0 transition-all duration-200',
            'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
            // Thumb colors
            'data-[state=unchecked]:bg-white data-[state=unchecked]:border data-[state=unchecked]:border-gray-200',
            'data-[state=checked]:bg-white data-[state=checked]:shadow-lg',
            // Add elevation on hover
            'group-hover:shadow-lg',
            sizeConfig.thumb
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
});

SwitchSimple.displayName = 'SwitchSimple';