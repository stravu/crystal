import React from 'react';
import { cn } from '../../utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
}

const sizeClasses = {
  sm: {
    container: 'h-5 w-9',
    thumb: 'h-3 w-3',
    translateOn: 'translate-x-5',
    translateOff: 'translate-x-1'
  },
  md: {
    container: 'h-6 w-11',
    thumb: 'h-4 w-4',
    translateOn: 'translate-x-6',
    translateOff: 'translate-x-1'
  },
  lg: {
    container: 'h-7 w-14',
    thumb: 'h-5 w-5',
    translateOn: 'translate-x-8',
    translateOff: 'translate-x-1'
  }
};

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className,
  id
}) => {
  const sizes = sizeClasses[size];

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-interactive focus:ring-offset-2',
        sizes.container,
        checked ? 'bg-interactive' : 'bg-surface-tertiary',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer',
        className
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-surface-primary transition-transform',
          sizes.thumb,
          checked ? sizes.translateOn : sizes.translateOff
        )}
      />
    </button>
  );
};

interface ToggleFieldProps extends ToggleProps {
  label: string;
  description?: string;
  id?: string;
}

export const ToggleField: React.FC<ToggleFieldProps> = ({
  label,
  description,
  id,
  ...toggleProps
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <label 
          htmlFor={id}
          className="font-medium text-text-primary cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p className="text-sm text-text-secondary">{description}</p>
        )}
      </div>
      <Toggle id={id} {...toggleProps} />
    </div>
  );
};