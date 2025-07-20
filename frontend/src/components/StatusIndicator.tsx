import React, { useEffect, useRef, useState } from 'react';
import { Session } from '../types/session';
import { AlertCircle, CheckCircle, Loader2, PauseCircle, Bell } from 'lucide-react';
import { isDocumentVisible } from '../utils/performanceUtils';

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
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setAnimationsEnabled(isDocumentVisible());
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  const getStatusConfig = (status: Session['status']) => {
    switch (status) {
      case 'initializing':
        return {
          status: 'initializing',
          color: 'bg-green-500',
          textColor: 'text-green-400',
          bgColor: 'bg-green-900/20',
          borderColor: 'border-green-800',
          icon: Loader2,
          text: 'Initializing',
          tooltip: 'Setting up git worktree and environment',
          animated: true,
          spin: true,
        };
      case 'running':
        return {
          status: 'running',
          color: 'bg-green-500',
          textColor: 'text-green-400',
          bgColor: 'bg-green-900/20',
          borderColor: 'border-green-800',
          icon: Loader2,
          text: 'Running',
          tooltip: 'Claude is actively processing your request',
          animated: true,
          spin: true,
        };
      case 'waiting':
        return {
          status: 'waiting',
          color: 'bg-amber-500',
          textColor: 'text-amber-400',
          bgColor: 'bg-amber-900/20',
          borderColor: 'border-amber-800',
          icon: PauseCircle,
          text: 'Waiting for input',
          tooltip: 'Claude needs your input to continue',
          animated: true,
          pulse: true,
        };
      case 'stopped':
        return {
          status: 'stopped',
          color: 'bg-gray-400',
          textColor: 'text-gray-400',
          bgColor: 'bg-gray-800',
          borderColor: 'border-gray-700',
          icon: CheckCircle,
          text: 'Completed',
          tooltip: 'Task finished successfully',
          animated: false,
        };
      case 'completed_unviewed':
        return {
          status: 'completed_unviewed',
          color: 'bg-blue-500',
          textColor: 'text-blue-400',
          bgColor: 'bg-blue-900/20',
          borderColor: 'border-blue-800',
          icon: Bell,
          text: 'New activity',
          tooltip: 'Session has new unviewed results',
          animated: true,
          pulse: true,
        };
      case 'error':
        return {
          status: 'error',
          color: 'bg-red-500',
          textColor: 'text-red-400',
          bgColor: 'bg-red-900/20',
          borderColor: 'border-red-800',
          icon: AlertCircle,
          text: 'Error',
          tooltip: 'Something went wrong with the session',
          animated: false,
        };
      default:
        return {
          status: 'unknown',
          color: 'bg-gray-400',
          textColor: 'text-gray-400',
          bgColor: 'bg-gray-800',
          borderColor: 'border-gray-700',
          icon: AlertCircle,
          text: 'Unknown',
          tooltip: 'Unknown status',
          animated: false,
        };
    }
  };

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'small':
        return {
          dot: 'w-2 h-2',
          container: 'w-3 h-3',
          text: 'text-xs',
          spacing: 'space-x-1',
        };
      case 'large':
        return {
          dot: 'w-4 h-4',
          container: 'w-5 h-5',
          text: 'text-sm',
          spacing: 'space-x-3',
        };
      default: // medium
        return {
          dot: 'w-3 h-3',
          container: 'w-4 h-4',
          text: 'text-sm',
          spacing: 'space-x-2',
        };
    }
  };

  const config = getStatusConfig(session.status);
  const sizeClasses = getSizeClasses(size);
  
  // Disable animations when not visible or for non-active states
  const shouldAnimate = animationsEnabled && config.animated && 
    ['running', 'initializing', 'waiting', 'completed_unviewed'].includes(session.status);

  const estimateProgress = (): number => {
    if (session.status === 'stopped') return 100;
    if (session.status === 'error') return 0;
    if (session.status === 'waiting') return 75;
    if (session.status === 'running') return 50;
    if (session.status === 'initializing') return 25;
    return 0;
  };


  // When showText is true, render as a chip
  if (showText) {
    return (
      <div className={`flex items-center ${sizeClasses.spacing}`}>
        {/* Status Chip */}
        <div 
          className={`
            inline-flex items-center gap-2
            px-3 py-1.5 
            rounded-full 
            ${config.bgColor} 
            border 
            ${config.borderColor}
            ${shouldAnimate ? 'relative overflow-hidden' : ''}
            transition-all duration-200
          `}
          title={config.tooltip}
        >
          {/* Animated background effect for active states */}
          {shouldAnimate && (
            <div className="absolute inset-0 -z-10">
              <div 
                className={`
                  absolute inset-0 
                  ${config.color} 
                  opacity-20 
                  ${animationsEnabled ? 'animate-pulse' : ''}
                `} 
              />
              {(config.status === 'running' || config.status === 'initializing') && (
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"
                  style={{
                    animation: 'shimmer 2s infinite',
                  }}
                />
              )}
            </div>
          )}
          
          {/* Status icon and text */}
          {React.createElement(config.icon, {
            className: `w-4 h-4 ${config.textColor} ${config.spin && animationsEnabled ? 'animate-spin' : ''}` 
          })}
          <span className={`${sizeClasses.text} font-medium ${config.textColor}`}>
            {config.text}
          </span>
          
          {/* Pulsing dot for waiting/new activity status */}
          {config.pulse && shouldAnimate && (
            <div className="relative flex h-2 w-2">
              <span className={`${animationsEnabled ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`}></span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="flex-1 ml-2">
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div
                className={`${config.color} h-1.5 rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${estimateProgress()}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Original dot indicator for when showText is false
  return (
    <div className={`flex items-center ${sizeClasses.spacing}`} title={config.tooltip}>
      {/* Status Indicator Dot */}
      <div className={`relative ${sizeClasses.container} flex items-center justify-center`} ref={elementRef}>
        <div
          className={`
            ${sizeClasses.dot} 
            ${config.color} 
            rounded-full 
            ${shouldAnimate && config.animated && animationsEnabled ? 'animate-pulse' : ''}
            ${shouldAnimate && config.pulse && animationsEnabled ? 'animate-ping' : ''}
          `}
        />
        {config.pulse && shouldAnimate && (
          <div
            className={`
              absolute inset-0 
              ${sizeClasses.dot} 
              ${config.color} 
              rounded-full 
              opacity-75
            `}
          />
        )}
      </div>
    </div>
  );
});

StatusIndicator.displayName = 'StatusIndicator';