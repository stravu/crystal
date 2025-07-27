import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | null;
  label?: string;
  description?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, label, description, helperText, fullWidth, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={id}
            className="block text-sm font-medium text-text-primary mb-2"
          >
            {label}
          </label>
        )}
        
        <textarea
          id={id}
          className={cn(
            'w-full px-3 py-2 rounded-md border transition-colors',
            'text-text-primary placeholder-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-interactive focus:border-interactive',
            error 
              ? 'border-status-error bg-surface-primary' 
              : 'border-border-primary bg-surface-primary hover:border-border-hover',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          ref={ref}
          {...props}
        />
        
        {error && (
          <p className="mt-2 text-sm text-status-error">
            {error}
          </p>
        )}
        
        {description && !error && (
          <p className="mt-2 text-sm text-text-tertiary">
            {description}
          </p>
        )}
        
        {helperText && !error && !description && (
          <p className="mt-2 text-sm text-text-tertiary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';