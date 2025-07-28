import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Card } from './Card';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  variant?: 'default' | 'subtle';
  className?: string;
}

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  children,
  defaultExpanded = true,
  variant = 'default',
  className
}: CollapsibleCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card 
      variant="bordered" 
      padding="none" 
      className={cn(
        'overflow-hidden transition-all duration-200',
        variant === 'subtle' && 'border-border-secondary bg-surface-secondary/30',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full p-4 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-interactive/20 focus:ring-inset'
        )}
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-tertiary" />
          )}
        </div>
        
        {icon && (
          <div className="flex-shrink-0 text-interactive">
            {icon}
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-text-primary">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-text-tertiary mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border-primary/50">
          <div className="pt-4">
            {children}
          </div>
        </div>
      )}
    </Card>
  );
}