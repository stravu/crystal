import React, { useState, useRef, useEffect, ReactNode, CSSProperties } from 'react';
import { cn } from '../../utils/cn';

export interface DropdownItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showDot?: boolean;
  dotColor?: string;
}

export interface DropdownProps {
  // Trigger element
  trigger: ReactNode;
  triggerClassName?: string;
  
  // Items
  items: DropdownItem[];
  selectedId?: string;
  
  // Appearance
  position?: 'auto' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  width?: 'auto' | 'sm' | 'md' | 'lg' | 'full';
  
  // Behavior
  closeOnSelect?: boolean;
  onOpenChange?: (open: boolean) => void;
  
  // Optional footer content (e.g., settings button)
  footer?: ReactNode;
  
  // Custom styles
  className?: string;
  menuClassName?: string;
  itemClassName?: string;
  style?: CSSProperties;
}

const widthClasses = {
  auto: 'w-auto',
  sm: 'w-48',
  md: 'w-56',
  lg: 'w-64',
  full: 'w-full',
};

const positionClasses = {
  'bottom-left': 'left-0 top-full mt-2',
  'bottom-right': 'right-0 top-full mt-2',
  'top-left': 'left-0 bottom-full mb-2',
  'top-right': 'right-0 bottom-full mb-2',
};

const variantStyles = {
  default: 'text-text-secondary hover:bg-interactive/10 hover:text-text-primary hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
  success: 'text-status-success hover:bg-interactive/10 hover:text-text-primary hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
  warning: 'text-status-warning hover:bg-interactive/10 hover:text-text-primary hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
  danger: 'text-status-error hover:bg-interactive/10 hover:text-text-primary hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
};

const selectedVariantStyles = {
  default: 'bg-interactive/15 text-interactive shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] border border-interactive/30',
  success: 'bg-interactive/15 text-status-success shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] border border-status-success/30',
  warning: 'bg-interactive/15 text-status-warning shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] border border-status-warning/30',
  danger: 'bg-interactive/15 text-status-error shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] border border-status-error/30',
};

export function Dropdown({
  trigger,
  triggerClassName,
  items,
  selectedId,
  position = 'auto',
  width = 'md',
  closeOnSelect = true,
  onOpenChange,
  footer,
  className,
  menuClassName,
  itemClassName,
  style,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [actualPosition, setActualPosition] = useState<'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'>('bottom-right');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
  };

  const handleClose = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    
    item.onClick?.();
    
    if (closeOnSelect) {
      handleClose();
    }
  };

  // Smart positioning for auto mode
  useEffect(() => {
    if (isOpen && position === 'auto' && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      // If there's less than 200px below the element, show it above
      const spaceBelow = viewportHeight - rect.bottom;
      const shouldShowAbove = spaceBelow < 200;
      
      setActualPosition(shouldShowAbove ? 'top-right' : 'bottom-right');
    } else if (position !== 'auto') {
      setActualPosition(position);
    }
  }, [isOpen, position]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    // Add a small delay to prevent immediate closing when clicking the trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={cn('relative', className)} style={style}>
      {/* Trigger */}
      <div 
        onClick={handleToggle} 
        className={triggerClassName}
        // Make trigger focusable for keyboard navigation
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        {trigger}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={contentRef}
          className={cn(
            'absolute z-50',
            'bg-surface-primary rounded-md shadow-dropdown-elevated',
            'border border-border-subtle/60',
            'backdrop-blur-sm',
            // Enhanced animations based on position
            actualPosition.includes('top') ? 'animate-dropdown-enter-up' : 'animate-dropdown-enter',
            // Add atmospheric layering with subtle ring in dark mode
            'ring-1 ring-border-secondary/30 dark:ring-white/5',
            // Match pill button radius exactly
            'overflow-hidden',
            positionClasses[actualPosition],
            widthClasses[width],
            menuClassName
          )}
          style={{
            ...style,
            // Add subtle inner glow for depth
            boxShadow: 'var(--shadow-dropdown-elevated), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          }}
        >
            {/* Enhanced Dropdown Arrow - cohesive with panel */}
            {actualPosition.includes('top') && (
              <div 
                className={cn(
                  "absolute -bottom-1 w-2.5 h-2.5 bg-surface-primary transform rotate-45",
                  "border-r border-b border-border-subtle/60",
                  actualPosition.includes('right') ? 'right-4' : 'left-4'
                )}
                style={{
                  boxShadow: 'var(--shadow-dropdown-pointer)',
                  filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))',
                }}
              />
            )}
            {actualPosition.includes('bottom') && (
              <div 
                className={cn(
                  "absolute -top-1 w-2.5 h-2.5 bg-surface-primary transform rotate-45",
                  "border-l border-t border-border-subtle/60",
                  actualPosition.includes('right') ? 'right-4' : 'left-4'
                )}
                style={{
                  boxShadow: 'var(--shadow-dropdown-pointer)',
                  filter: 'drop-shadow(0 -1px 2px rgba(0, 0, 0, 0.1))',
                }}
              />
            )}
            <div className="p-1.5">
              {items.map((item, index) => {
                const Icon = item.icon;
                const isSelected = item.id === selectedId;
                const variant = item.variant || 'default';
                
                return (
                  <React.Fragment key={item.id}>
                    {/* Use vertical spacing instead of divider lines */}
                    {index > 0 && items[index - 1].variant !== item.variant && (
                      <div className="h-2" />
                    )}
                    
                    <button
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-sm',
                        'transition-all duration-200 ease-out flex items-center gap-3',
                        'focus:outline-none focus:ring-2 focus:ring-focus-ring-subtle',
                        'min-h-[2.5rem] group relative', // Better touch target and consistent height
                        item.disabled && 'opacity-50 cursor-not-allowed',
                        !item.disabled && !isSelected && variantStyles[variant],
                        isSelected && selectedVariantStyles[variant],
                        itemClassName
                      )}
                    >
                      {/* Enhanced Icon with better hierarchy */}
                      {Icon && (
                        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                          <Icon className={cn(
                            'w-4 h-4 transition-colors duration-200 ease-out',
                            'stroke-[1.5]', // Slightly heavier stroke weight
                            item.iconColor || 'text-current'
                          )} />
                        </div>
                      )}
                      
                      {/* Enhanced Content area with better typography */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className={cn(
                          'text-sm font-medium leading-tight',
                          'transition-colors duration-200 ease-out',
                          'group-hover:text-inherit' // Inherit hover color from parent
                        )}>
                          {item.label}
                        </div>
                        {item.description && (
                          <div className="text-xs text-text-tertiary mt-1 leading-tight transition-colors duration-200 ease-out">
                            {item.description}
                          </div>
                        )}
                      </div>
                      
                      {/* Status indicator with better alignment */}
                      {(isSelected || item.showDot) && (
                        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                          <div 
                            className={cn(
                              'w-2 h-2 rounded-full',
                              isSelected && 'bg-interactive shadow-sm',
                              item.showDot && !isSelected && item.dotColor
                            )}
                          />
                        </div>
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
              
              {/* Footer */}
              {footer && (
                <>
                  <div className="border-t border-border-secondary my-1.5" />
                  {footer}
                </>
              )}
            </div>
        </div>
      )}
    </div>
  );
}

// Dropdown Menu Item component for custom footer items
export function DropdownMenuItem({
  icon: Icon,
  label,
  onClick,
  className,
  ...props
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: ReactNode;
  onClick?: () => void;
  className?: string;
  [key: string]: any;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-sm',
        'text-text-secondary hover:bg-interactive/10 hover:text-text-primary hover:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        'transition-all duration-200 ease-out flex items-center gap-3',
        'focus:outline-none focus:ring-2 focus:ring-focus-ring-subtle',
        'min-h-[2.5rem] group', // Better touch target and consistent height
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
          <Icon className="w-4 h-4 text-text-tertiary group-hover:text-current stroke-[1.5] transition-colors duration-200 ease-out" />
        </div>
      )}
      <span className="text-sm font-medium group-hover:text-inherit transition-colors duration-200 ease-out">{label}</span>
    </button>
  );
}