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
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          icon: '🔄',
          text: 'Initializing',
          animated: true,
        };
      case 'running':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-600',
          bgColor: 'bg-green-50',
          icon: '🏃',
          text: 'Running',
          animated: true,
        };
      case 'waiting':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          icon: '⏸️',
          text: 'Waiting for input',
          animated: true,
          pulse: true,
        };
      case 'stopped':
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          icon: '✅',
          text: 'Completed',
          animated: false,
        };
      case 'error':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-600',
          bgColor: 'bg-red-50',
          icon: '❌',
          text: 'Error',
          animated: false,
        };
      default:
        return {
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

  const formatLastActivity = (lastActivity: Date): string => {
    const now = new Date();
    const diff = now.getTime() - lastActivity.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

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

      {/* Status Text */}
      {showText && (
        <div className="flex flex-col">
          <span className={`${sizeClasses.text} font-medium ${config.textColor}`}>
            {config.text}
          </span>
          {size === 'large' && (
            <span className="text-xs text-gray-500">
              {formatLastActivity(session.lastActivity)}
            </span>
          )}
        </div>
      )}

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