import { useState, useEffect } from 'react';
import { API } from '../utils/api';

interface StravuConnectionProps {
  className?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';

interface StravuConnectionState {
  status: ConnectionStatus;
  memberInfo?: {
    memberId: string;
    orgSlug: string;
    scopes: string[];
  };
  error?: string;
}

export function StravuConnection({ className = '' }: StravuConnectionProps) {
  const [connectionState, setConnectionState] = useState<StravuConnectionState>({
    status: 'disconnected'
  });

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await API.stravu.getConnectionStatus();
      if (response.success) {
        setConnectionState(response.data);
      } else {
        setConnectionState({ status: 'disconnected', error: response.error });
      }
    } catch (error) {
      setConnectionState({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Failed to check connection status' 
      });
    }
  };

  const handleConnect = async () => {
    setConnectionState(prev => ({ ...prev, status: 'connecting', error: undefined }));

    try {
      const response = await API.stravu.initiateAuth();
      if (!response.success) {
        throw new Error(response.error || 'Failed to initiate authentication');
      }

      const { authUrl, sessionId } = response.data;
      
      // Open browser for authentication
      window.electron.openExternal(authUrl);

      // Poll for completion
      const pollForCompletion = async () => {
        try {
          const statusResponse = await API.stravu.checkAuthStatus(sessionId);
          if (!statusResponse.success) {
            throw new Error(statusResponse.error || 'Failed to check auth status');
          }

          const { status, memberInfo, error } = statusResponse.data;

          if (status === 'completed') {
            setConnectionState({
              status: 'connected',
              memberInfo
            });
            return;
          } else if (status === 'denied' || status === 'expired') {
            throw new Error(error || 'Authentication failed or denied');
          } else if (status === 'pending') {
            // Continue polling
            setTimeout(pollForCompletion, 2000);
          }
        } catch (error) {
          // Retry on network errors
          setTimeout(pollForCompletion, 2000);
        }
      };

      pollForCompletion();

      // Timeout after 10 minutes
      setTimeout(() => {
        if (connectionState.status === 'connecting') {
          setConnectionState({
            status: 'error',
            error: 'Authentication timeout - please try again'
          });
        }
      }, 600000);

    } catch (error) {
      setConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Authentication failed'
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      const response = await API.stravu.disconnect();
      if (response.success) {
        setConnectionState({ status: 'disconnected' });
      } else {
        setConnectionState(prev => ({ 
          ...prev, 
          error: response.error || 'Failed to disconnect' 
        }));
      }
    } catch (error) {
      setConnectionState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to disconnect'
      }));
    }
  };

  const getStatusIndicator = () => {
    switch (connectionState.status) {
      case 'connected':
        return <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />;
      case 'connecting':
        return <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />;
      case 'expired':
        return <div className="w-3 h-3 bg-orange-500 rounded-full" />;
      case 'error':
        return <div className="w-3 h-3 bg-red-500 rounded-full" />;
      default:
        return <div className="w-3 h-3 bg-gray-400 rounded-full" />;
    }
  };

  const getStatusText = () => {
    switch (connectionState.status) {
      case 'connected':
        return `Connected to ${connectionState.memberInfo?.orgSlug || 'Stravu'}`;
      case 'connecting':
        return 'Connecting...';
      case 'expired':
        return 'Session expired';
      case 'error':
        return 'Connection error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className={`stravu-connection ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIndicator()}
          <div>
            <div className="text-sm font-medium text-gray-900">
              Stravu Integration
            </div>
            <div className="text-xs text-gray-500">
              {getStatusText()}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {connectionState.status === 'disconnected' || connectionState.status === 'expired' || connectionState.status === 'error' ? (
            <button
              onClick={handleConnect}
              disabled={connectionState.status === 'connecting'}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionState.status === 'connecting' ? 'Connecting...' : 
               connectionState.status === 'expired' ? 'Reconnect' : 'Connect'}
            </button>
          ) : connectionState.status === 'connected' ? (
            <>
              <button
                onClick={checkConnectionStatus}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                title="Refresh connection status"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Disconnect
              </button>
            </>
          ) : null}
        </div>
      </div>

      {connectionState.error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {connectionState.error}
        </div>
      )}

      {connectionState.status === 'connecting' && (
        <div className="mt-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-2">
          Please complete authentication in your browser. This may take a few moments...
        </div>
      )}
    </div>
  );
}