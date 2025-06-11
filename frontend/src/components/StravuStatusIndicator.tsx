import { useState, useEffect } from 'react';
import { API } from '../utils/api';

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';
  memberInfo?: {
    memberId: string;
    orgSlug: string;
    scopes: string[];
  };
  error?: string;
}

export function StravuStatusIndicator() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected'
  });
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    checkConnectionStatus();
    
    // Check connection status every 30 seconds
    const interval = setInterval(checkConnectionStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await API.stravu.getConnectionStatus();
      if (response.success) {
        setConnectionState(response.data);
      }
    } catch (error) {
      console.error('Failed to check Stravu connection status:', error);
      setConnectionState({
        status: 'error',
        error: 'Failed to check connection'
      });
    }
  };

  const handleConnect = async () => {
    if (connectionState.status === 'connected') {
      // Show disconnect option or status details
      return;
    }

    setConnectionState(prev => ({ ...prev, status: 'connecting' }));
    
    try {
      const response = await API.stravu.initiateAuth();
      if (response.success && response.data.sessionId) {
        // Poll for completion
        pollForAuth(response.data.sessionId);
      } else {
        setConnectionState({
          status: 'error',
          error: 'Failed to initiate authentication'
        });
      }
    } catch (error) {
      setConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  };

  const pollForAuth = async (sessionId: string) => {
    const maxAttempts = 30; // 1 minute timeout
    let attempts = 0;
    
    const poll = async () => {
      attempts++;
      try {
        const response = await API.stravu.checkAuthStatus(sessionId);
        if (response.success) {
          if (response.data.status === 'completed') {
            setConnectionState({
              status: 'connected',
              memberInfo: response.data.memberInfo
            });
            return;
          } else if (response.data.status === 'error') {
            setConnectionState({
              status: 'error',
              error: response.data.error || 'Authentication failed'
            });
            return;
          }
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setConnectionState({
            status: 'error',
            error: 'Authentication timeout'
          });
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setConnectionState({
            status: 'error',
            error: 'Authentication failed'
          });
        }
      }
    };
    
    poll();
  };

  const getStatusColor = () => {
    switch (connectionState.status) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-blue-600';
      case 'expired':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch (connectionState.status) {
      case 'connected':
        return `Connected to ${connectionState.memberInfo?.orgSlug || 'Stravu'}`;
      case 'connecting':
        return 'Connecting to Stravu...';
      case 'expired':
        return 'Stravu session expired';
      case 'error':
        return connectionState.error || 'Connection error';
      default:
        return 'Not connected to Stravu';
    }
  };

  const renderIcon = () => {
    if (connectionState.status === 'connecting') {
      return (
        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    }

    return (
      <div className="relative">
        {/* Stravu logo - simplified version */}
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
        </svg>
        
        {/* Slash overlay for disconnected state */}
        {(connectionState.status === 'disconnected' || connectionState.status === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-0.5 bg-current transform rotate-45"></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={handleConnect}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${getStatusColor()}`}
        disabled={connectionState.status === 'connecting'}
      >
        {renderIcon()}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 text-white text-sm rounded-lg p-3 z-50">
          <div className="font-medium mb-1">Stravu Integration</div>
          <div className="text-gray-300">{getStatusText()}</div>
          
          {connectionState.status === 'connected' && connectionState.memberInfo && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400">
                Member: {connectionState.memberInfo.memberId}
              </div>
              <div className="text-xs text-gray-400">
                Scopes: {connectionState.memberInfo.scopes.join(', ')}
              </div>
            </div>
          )}
          
          {(connectionState.status === 'disconnected' || connectionState.status === 'error') && (
            <div className="mt-2 text-xs text-gray-400">
              Click to connect to Stravu
            </div>
          )}

          {/* Arrow pointing up */}
          <div className="absolute top-0 right-4 transform -translate-y-1">
            <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}