import { Session } from '../types/session';

interface StatusIndicatorProps {
  session: Session;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  showProgress?: boolean;
}

export function StatusIndicator({ 
  session, 
  size = 'medium', 
  showText = false, 
  showProgress = false 
}: StatusIndicatorProps) {
  const getStatusConfig = (status: Session['status']) => {
    switch (status) {
      case 'initializing':
        return {
          status: 'initializing',
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          icon: '🔄',
          text: 'Initializing',
          animated: true,
        };
      case 'running':
        return {
          status: 'running',
          color: 'bg-green-500',
          textColor: 'text-green-600',
          bgColor: 'bg-green-50',
          icon: '▶️',
          text: 'Running',
          animated: true,
        };
      case 'waiting':
        return {
          status: 'waiting',
          color: 'bg-yellow-500',
          textColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          icon: '⏸️',
          text: 'Waiting',
          animated: true,
          pulse: true,
        };
      case 'stopped':
        return {
          status: 'stopped',
          color: 'bg-gray-500',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '✅',
          text: 'Success',
          animated: false,
        };
      case 'completed_unviewed':
        return {
          status: 'completed_unviewed',
          color: 'bg-yellow-500',
          textColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          icon: '🔔',
          text: 'New results',
          animated: true,
          pulse: true,
        };
      case 'error':
        return {
          status: 'error',
          color: 'bg-red-500',
          textColor: 'text-red-600',
          bgColor: 'bg-red-50',
          icon: '❌',
          text: 'Error',
          animated: false,
        };
      default:
        return {
          status: 'unknown',
          color: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '📝',
          text: 'Unknown',
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
            inline-flex items-center 
            px-3 py-1 
            rounded-full 
            ${config.bgColor} 
            border 
            ${config.status === 'error' ? 'border-red-200' : 
              config.status === 'running' ? 'border-green-200' : 
              config.status === 'waiting' ? 'border-yellow-200' :
              config.status === 'initializing' ? 'border-blue-200' :
              'border-gray-200'}
            ${config.animated ? 'relative overflow-hidden' : ''}
          `}
        >
          {/* Animated background effect for active states */}
          {config.animated && (
            <div className="absolute inset-0 -z-10">
              <div 
                className={`
                  absolute inset-0 
                  ${config.color} 
                  opacity-20 
                  animate-pulse
                `} 
              />
              {config.status === 'running' && (
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
          <span className="text-lg mr-1.5">{config.icon}</span>
          <span className={`${sizeClasses.text} font-semibold ${config.textColor}`}>
            {config.text}
          </span>
          
          {/* Pulsing dot for waiting status */}
          {config.status === 'waiting' && (
            <div className="ml-2 relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="flex-1 ml-2">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
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
    <div className={`flex items-center ${sizeClasses.spacing}`}>
      {/* Status Indicator Dot */}
      <div className={`relative ${sizeClasses.container} flex items-center justify-center`}>
        <div
          className={`
            ${sizeClasses.dot} 
            ${config.color} 
            rounded-full 
            ${config.animated ? 'animate-pulse' : ''}
            ${config.pulse ? 'animate-ping' : ''}
          `}
        />
        {config.pulse && (
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
}