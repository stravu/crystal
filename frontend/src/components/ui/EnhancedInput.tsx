import React from 'react';
import { cn } from '../../utils/cn';
import { Input, InputProps } from './Input';

export interface EnhancedInputProps extends Omit<InputProps, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  required?: boolean;
  showRequiredIndicator?: boolean;
}

export const EnhancedInput = React.forwardRef<HTMLInputElement, EnhancedInputProps>(
  ({ 
    className, 
    size = 'md',
    required = false,
    showRequiredIndicator = false,
    label,
    error,
    ...props 
  }, ref) => {
    
    const sizeClasses = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-3 text-base',
      lg: 'px-5 py-4 text-lg',
    };

    // Show error for required fields that are empty
    const showRequiredError = required && showRequiredIndicator && !props.value;
    const actualError = error || (showRequiredError ? 'This field is required' : undefined);

    return (
      <Input
        ref={ref}
        label={label}
        error={actualError}
        required={required}
        className={cn(
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

EnhancedInput.displayName = 'EnhancedInput';