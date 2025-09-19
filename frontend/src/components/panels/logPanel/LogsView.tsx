import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Download, Trash2, ChevronUp, ChevronDown, Filter, Copy, Check } from 'lucide-react';
import { cn } from '../../../utils/cn';
import AnsiToHtml from 'ansi-to-html';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

interface LogsViewProps {
  sessionId: string;
  isVisible: boolean;
}

export const LogsView: React.FC<LogsViewProps> = ({ sessionId, isVisible }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterTerm, setFilterTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastLogCount = useRef(0);
  
  // Create ANSI to HTML converter with dark theme colors
  const ansiConverter = useMemo(() => new AnsiToHtml({
    fg: '#e5e7eb', // text-gray-200
    bg: '#0a0a0a', // bg-primary
    newline: true,
    escapeXML: true,
    colors: {
      0: '#000000', // Black
      1: '#ef4444', // Red
      2: '#10b981', // Green  
      3: '#f59e0b', // Yellow
      4: '#3b82f6', // Blue
      5: '#a855f7', // Magenta
      6: '#06b6d4', // Cyan
      7: '#e5e7eb', // White
      8: '#6b7280', // Bright Black (Gray)
      9: '#f87171', // Bright Red
      10: '#34d399', // Bright Green
      11: '#fbbf24', // Bright Yellow
      12: '#60a5fa', // Bright Blue
      13: '#c084fc', // Bright Magenta
      14: '#22d3ee', // Bright Cyan
      15: '#ffffff', // Bright White
    }
  }), []);

  // Load existing logs when component mounts or session changes
  useEffect(() => {
    if (!sessionId || !isVisible) return;
    
    const loadLogs = async () => {
      try {
        const result = await window.electronAPI.sessions.getLogs(sessionId);
        if (result.success && result.data) {
          setLogs(result.data);
          lastLogCount.current = result.data.length;
        }
      } catch (error) {
        console.error('Failed to load logs:', error);
      }
    };

    loadLogs();
  }, [sessionId, isVisible]);

  // Subscribe to new log entries and clear events
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribeLog = window.electronAPI?.events?.onSessionLog?.((data: {
      sessionId: string;
      entry: LogEntry;
    }) => {
      if (data.sessionId === sessionId) {
        setLogs(prev => [...prev, data.entry]);
      }
    });

    const unsubscribeClear = window.electronAPI?.events?.onSessionLogsCleared?.((data: {
      sessionId: string;
    }) => {
      if (data.sessionId === sessionId) {
        setLogs([]);
        lastLogCount.current = 0;
      }
    });

    return () => {
      unsubscribeLog?.();
      unsubscribeClear?.();
    };
  }, [sessionId]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current && logs.length > lastLogCount.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
    lastLogCount.current = logs.length;
  }, [logs, autoScroll]);

  // Filter logs based on filter term
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFilter = !filterTerm || 
        log.message.toLowerCase().includes(filterTerm.toLowerCase()) ||
        (log.source && log.source.toLowerCase().includes(filterTerm.toLowerCase()));
      
      return matchesFilter;
    });
  }, [logs, filterTerm]);

  // Find search matches in filtered logs
  useEffect(() => {
    if (!searchTerm || !searchVisible) {
      setSearchMatches([]);
      setCurrentSearchIndex(0);
      return;
    }

    const matches: number[] = [];
    const searchLower = searchTerm.toLowerCase();
    
    filteredLogs.forEach((log, index) => {
      if (log.message.toLowerCase().includes(searchLower)) {
        matches.push(index);
      }
    });

    setSearchMatches(matches);
    setCurrentSearchIndex(matches.length > 0 ? 0 : -1);
  }, [searchTerm, filteredLogs, searchVisible]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchMatches.length;
    setCurrentSearchIndex(nextIndex);
    scrollToMatch(searchMatches[nextIndex]);
  }, [currentSearchIndex, searchMatches]);

  const goToPreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = currentSearchIndex === 0 ? searchMatches.length - 1 : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
    scrollToMatch(searchMatches[prevIndex]);
  }, [currentSearchIndex, searchMatches]);

  const scrollToMatch = (matchIndex: number) => {
    const logElements = logContainerRef.current?.querySelectorAll('.log-line');
    if (logElements && logElements[matchIndex]) {
      logElements[matchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F or Ctrl+F for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // Escape to close search
      else if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false);
        setSearchTerm('');
      }
      // Enter to go to next match, Shift+Enter for previous
      else if (e.key === 'Enter' && searchVisible && searchMatches.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          goToPreviousMatch();
        } else {
          goToNextMatch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, searchVisible, searchMatches, goToNextMatch, goToPreviousMatch]);

  const handleClearLogs = async () => {
    try {
      await window.electronAPI.sessions.clearLogs(sessionId);
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleExportLogs = () => {
    const logText = filteredLogs.map(log => log.message).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${sessionId}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyLogs = async () => {
    try {
      const logText = filteredLogs.map(log => log.message).join('\n');
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy logs:', error);
    }
  };


  return (
    <div className="h-full flex flex-col bg-bg-primary relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-primary">
        <div className="text-sm text-text-secondary">
          Logs ({filteredLogs.length}{logs.length !== filteredLogs.length ? ` / ${logs.length}` : ''})
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "p-1.5 rounded transition-colors",
              autoScroll 
                ? "bg-interactive/20 text-interactive" 
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
            )}
            title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Export button */}
          <button
            onClick={handleExportLogs}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
            title="Export logs"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear button */}
          <button
            onClick={handleClearLogs}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2 bg-surface-secondary border-b border-border-primary">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            value={filterTerm}
            onChange={(e) => setFilterTerm(e.target.value)}
            placeholder="Filter logs..."
            className="w-full pl-10 pr-8 py-2 bg-bg-primary text-text-primary placeholder-text-tertiary rounded-lg border border-border-secondary focus:outline-none focus:border-interactive transition-colors"
          />
          {filterTerm && (
            <button
              onClick={() => setFilterTerm('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Floating Search Bar */}
      {searchVisible && (
        <div className="absolute top-16 right-4 z-50 bg-surface-secondary border border-border-primary rounded-lg shadow-lg p-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search in logs..."
                className="w-64 pl-10 pr-8 py-2 bg-bg-primary text-text-primary placeholder-text-tertiary rounded-lg border border-border-secondary focus:outline-none focus:border-interactive transition-colors"
              />
            </div>
            
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary px-2">
                  {currentSearchIndex + 1} / {searchMatches.length}
                </span>
                <button
                  onClick={goToPreviousMatch}
                  className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNextMatch}
                  className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                  title="Next match (Enter)"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
            
            <button
              onClick={() => {
                setSearchVisible(false);
                setSearchTerm('');
              }}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Close search (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Logs Container */}
      <div 
        ref={logContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-auto font-mono text-sm p-4 bg-bg-primary text-text-primary whitespace-pre-wrap break-all"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          // Consider "at bottom" only if within 50px of the bottom
          const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
          const isAtBottom = distanceFromBottom < 50;
          if (isAtBottom !== autoScroll) {
            setAutoScroll(isAtBottom);
          }
        }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-text-tertiary py-8">
            {filterTerm ? 'No logs match your filter' : 'No logs available'}
          </div>
        ) : (
          <div className="break-all">
            {filteredLogs.map((log, index) => {
              const isCurrentMatch = searchVisible && searchMatches.includes(index) && searchMatches[currentSearchIndex] === index;
              const isMatch = searchVisible && searchTerm && searchMatches.includes(index);
              
              // Convert ANSI codes to HTML
              const htmlContent = ansiConverter.toHtml(log.message);
              
              if (!searchTerm || !searchVisible) {
                return (
                  <div 
                    key={index} 
                    className="log-line"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                  />
                );
              }
              
              // For search highlighting, we need to work with the raw text
              // but still preserve the ANSI styling
              const isHighlighted = isMatch || isCurrentMatch;
              
              return (
                <div 
                  key={index} 
                  className={cn(
                    "log-line",
                    isCurrentMatch && "bg-yellow-500/30",
                    isMatch && !isCurrentMatch && "bg-yellow-500/10"
                  )}
                >
                  {isHighlighted ? (
                    // When highlighting search results, show raw text with highlight
                    // This is a trade-off: we lose ANSI colors but gain search highlighting
                    log.message.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
                      .map((part, i) => 
                        part.toLowerCase() === searchTerm.toLowerCase() ? (
                          <span key={i} className="bg-yellow-500/50 text-black px-0.5">
                            {part}
                          </span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )
                  ) : (
                    // When not highlighting, show with ANSI colors
                    <span dangerouslySetInnerHTML={{ __html: htmlContent }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};