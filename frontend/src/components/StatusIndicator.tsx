import React, { useEffect, useState } from 'react';
import { Session } from '../types/session';
import { AlertCircle, CheckCircle, Loader2, PauseCircle, Bell } from 'lucide-react';
import { isDocumentVisible } from '../utils/performanceUtils';
import { Badge } from './ui/Badge';
import { StatusDot } from './ui/StatusDot';
import { cn } from '../utils/cn';

interface StatusIndicatorProps {
  session: Session;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  showProgress?: boolean;
}

export const StatusIndicator = React.memo(({ 
  session, 
  size = 'medium', 
  showText = false, 
  showProgress = false 
}: StatusIndicatorProps) => {
  const [animationsEnabled, setAnimationsEnabled] = useState(isDocumentVisible());
  
  // Use the session status from the prop - parent component manages the session state
  const currentStatus = session.status;

  useEffect(() => {
    const handleVisibilityChange = () => {
      setAnimationsEnabled(isDocumentVisible());
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  const getStatusConfig = (status: Session['status'], statusMessage?: string) => {
    switch (status) {
      case 'initializing':
        return {
          variant: 'success' as const,
          badgeVariant: 'success' as const,
          dotStatus: 'running' as const,
          icon: Loader2,
          text: statusMessage || 'Initializing',
          tooltip: statusMessage || 'Setting up git worktree and environment',
          spin: true,
          animated: true
        };
      case 'running':
        return {
          variant: 'success' as const,
          badgeVariant: 'success' as const,
          dotStatus: 'running' as const,
          icon: Loader2,
          text: 'Running',
          tooltip: 'Claude is actively processing your request',
          spin: true,
          animated: true
        };
      case 'waiting':
        return {
          variant: 'warning' as const,
          badgeVariant: 'warning' as const,
          dotStatus: 'waiting' as const,
          icon: PauseCircle,
          text: 'Waiting for input',
          tooltip: 'Claude needs your input to continue',
          pulse: true,
          animated: true
        };
      case 'stopped':
        return {
          variant: 'default' as const,
          badgeVariant: 'default' as const,
          dotStatus: 'default' as const,
          icon: CheckCircle,
          text: 'Completed',
          tooltip: 'Task finished successfully',
          animated: false
        };
      case 'completed_unviewed':
        return {
          variant: 'info' as const,
          badgeVariant: 'info' as const,
          dotStatus: 'info' as const,
          icon: Bell,
          text: 'New activity',
          tooltip: 'Session has new unviewed results',
          pulse: true,
          animated: true
        };
      case 'error':
        return {
          variant: 'error' as const,
          badgeVariant: 'error' as const,
          dotStatus: 'error' as const,
          icon: AlertCircle,
          text: 'Error',
          tooltip: 'Something went wrong with the session',
          animated: false
        };
      default:
        return {
          variant: 'default' as const,
          badgeVariant: 'default' as const,
          dotStatus: 'default' as const,
          icon: AlertCircle,
          text: 'Unknown',
          tooltip: 'Unknown status',
          animated: false
        };
    }
  };

  const getBadgeSize = (size: string) => {
    switch (size) {
      case 'small':
        return 'sm' as const;
      case 'large':
        return 'lg' as const;
      default:
        return 'md' as const;
    }
  };

  const getDotSize = (size: string) => {
    switch (size) {
      case 'small':
        return 'sm' as const;
      case 'large':
        return 'lg' as const;
      default:
        return 'md' as const;
    }
  };

  const config = getStatusConfig(currentStatus, session.statusMessage);
  const badgeSize = getBadgeSize(size);
  const dotSize = getDotSize(size);
  
  
  // Disable animations when not visible or for non-active states
  const shouldAnimate = animationsEnabled && config.animated;

  const estimateProgress = (): number => {
    if (currentStatus === 'stopped') return 100;
    if (currentStatus === 'error') return 0;
    if (currentStatus === 'waiting') return 75;
    if (currentStatus === 'running') return 50;
    if (currentStatus === 'initializing') return 25;
    return 0;
  };


  // When showText is true, render as a badge
  if (showText) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant={config.badgeVariant}
          size={badgeSize}
          animated={shouldAnimate}
          pulse={config.pulse}
          icon={React.createElement(config.icon, {
            className: cn(
              'w-4 h-4',
              config.spin && shouldAnimate && 'animate-spin'
            )
          })}
          className={config.tooltip ? `cursor-help` : undefined}
          title={config.tooltip}
        >
          {config.text}
        </Badge>

        {/* Progress Bar */}
        {showProgress && (
          <div className="flex-1 ml-2">
            <div className="w-full bg-surface-tertiary rounded-full h-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all duration-1000 ease-out',
                  config.dotStatus === 'running' && 'bg-status-success',
                  config.dotStatus === 'waiting' && 'bg-status-warning',
                  config.dotStatus === 'error' && 'bg-status-error',
                  config.dotStatus === 'info' && 'bg-status-info',
                  config.dotStatus === 'default' && 'bg-text-tertiary'
                )}
                style={{ width: `${estimateProgress()}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Simple dot indicator for when showText is false
  return (
    <StatusDot
      status={config.dotStatus}
      size={dotSize}
      animated={shouldAnimate && !config.pulse}
      pulse={config.pulse && shouldAnimate}
      className={config.tooltip ? 'cursor-help' : undefined}
      title={config.tooltip}
    />
  );
});

StatusIndicator.displayName = 'StatusIndicator';