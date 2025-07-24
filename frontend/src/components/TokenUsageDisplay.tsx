import { useEffect, useState, useRef } from 'react';
import { Info, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';
import { API } from '../utils/api';

interface TokenUsageData {
  summary: {
    session_id: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    last_updated: string;
  } | null;
  contextWindow: number;
  warning: {
    level: 'info' | 'warning' | 'critical';
    percentage: number;
    message: string;
    tokensUsed: number;
    contextWindow: number;
  } | null;
  currentContextUsage?: number | null;
}

interface TokenUsageDisplayProps {
  sessionId: string;
  className?: string;
  compact?: boolean;
}

export function TokenUsageDisplay({ sessionId, className = '', compact = false }: TokenUsageDisplayProps) {
  const [tokenData, setTokenData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const fetchTokenUsage = async () => {
      try {
        const response = await API.sessions.getTokenUsage(sessionId);
        if (response.success && mounted) {
          setTokenData(response.data);
          setError(null);
        } else if (!response.success && mounted) {
          setError(response.error || 'Failed to load token usage');
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load token usage');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchTokenUsage();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTokenUsage, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Handle clicks outside popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  if (loading || error || !tokenData || !tokenData.summary) {
    // Show a placeholder during loading or when no data
    if (!loading && !error && !tokenData?.summary) {
      return (
        <div className={`flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600 px-2 py-1 ${className}`}>
          <Info className="w-3 h-3" />
          <span>No token data</span>
        </div>
      );
    }
    return null;
  }

  const { summary } = tokenData;
  
  // Just show the raw token totals - no percentage calculations or estimates
  const totalTokens = summary.total_input_tokens + summary.total_output_tokens;
  
  // Simple warning thresholds based on empirical data from sessions that hit limits
  // NEW lowest observed failure: 96,800 tokens! (was 119,248)
  const getWarningLevel = (tokens: number): 'safe' | 'caution' | 'danger' => {
    if (tokens > 95000) return 'danger';    // Lowered from 120K
    if (tokens > 80000) return 'caution';   // Lowered from 100K
    return 'safe';
  };
  
  const warningLevel = getWarningLevel(totalTokens);

  // Format numbers for display
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  if (compact) {
    // Compact view for session list - show total tokens with warning color
    const getCompactClasses = () => {
      switch (warningLevel) {
        case 'danger':
          return 'text-red-600 bg-red-100 dark:bg-red-900/20';
        case 'caution':
          return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
        default:
          return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
      }
    };
    
    const getIcon = () => {
      switch (warningLevel) {
        case 'danger':
          return <AlertCircle className="w-3 h-3" />;
        case 'caution':
          return <AlertTriangle className="w-3 h-3" />;
        default:
          return <Info className="w-3 h-3" />;
      }
    };
    
    return (
      <div className="relative inline-block">
        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${getCompactClasses()} ${className}`}>
          {getIcon()}
          <span className="font-medium">{formatNumber(totalTokens)}</span>
          <span className="opacity-75">tokens</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(!showPopover);
            }}
            className="ml-1 hover:opacity-80 transition-opacity"
            aria-label="Token usage details"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </div>
        
        {showPopover && (
          <div
            ref={popoverRef}
            className="absolute z-50 mt-2 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[280px]"
          >
            <div className="text-xs space-y-2">
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Token Usage Breakdown
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                <div>Input tokens:</div>
                <div className="text-right font-medium">{formatNumber(summary.total_input_tokens)}</div>
                
                <div>Output tokens:</div>
                <div className="text-right font-medium">{formatNumber(summary.total_output_tokens)}</div>
                
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 font-semibold">Total:</div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 text-right font-semibold">
                  {formatNumber(totalTokens)}
                </div>
              </div>
              
              {warningLevel !== 'safe' && (
                <div className={`mt-3 p-2 rounded-md text-xs ${
                  warningLevel === 'danger' 
                    ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' 
                    : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                }`}>
                  {warningLevel === 'danger' 
                    ? '🚨 Danger: May hit "Prompt is too long" error soon!' 
                    : '⚠️ Caution: Approaching token limits.'}
                  <div className="mt-1 opacity-75">
                    Based on analysis of failed sessions. Lowest failure: 96,800 tokens.
                  </div>
                </div>
              )}
              
              <div className="text-gray-500 dark:text-gray-400 text-xs pt-2">
                Input tokens include all context sent to Claude (system prompts, tools, conversation history).
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full view for session detail - show raw input/output breakdown with warnings
  const getFullViewClasses = () => {
    switch (warningLevel) {
      case 'danger':
        return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300';
      case 'caution':
        return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
    }
  };
  
  const getFullIcon = () => {
    switch (warningLevel) {
      case 'danger':
        return <AlertCircle className="w-4 h-4" />;
      case 'caution':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };
  
  const getWarningMessage = () => {
    switch (warningLevel) {
      case 'danger':
        return 'Danger: You may hit the "Prompt is too long" error soon. Consider starting a new session.';
      case 'caution':
        return 'Caution: Approaching token limits. Sessions have failed as low as 96,800 tokens.';
      default:
        return 'This shows the cumulative tokens reported by Claude for this conversation. Input tokens include all context sent to Claude (system prompts, tools, conversation history).';
    }
  };
  
  return (
    <div className={`p-4 rounded-lg ${getFullViewClasses()} ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getFullIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">Token Usage (Running Total)</h3>
            <span className="text-xs opacity-75">
              {formatNumber(totalTokens)} total tokens
            </span>
          </div>
          
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Input tokens (processed by Claude):</span>
              <span className="font-medium">{formatNumber(summary.total_input_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span>Output tokens (generated by Claude):</span>
              <span className="font-medium">{formatNumber(summary.total_output_tokens)}</span>
            </div>
            <div className="border-t border-current/20 pt-2 flex justify-between font-semibold">
              <span>Total conversation:</span>
              <span>{formatNumber(totalTokens)}</span>
            </div>
          </div>
          
          <p className="mt-3 text-xs opacity-90 leading-relaxed">
            {getWarningMessage()}
          </p>
          
          {warningLevel !== 'safe' && (
            <p className="mt-2 text-xs opacity-75">
              Based on analysis of failed sessions, the lowest failure occurred at 96,800 tokens.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}