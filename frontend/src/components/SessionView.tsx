import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { JsonMessageView } from './JsonMessageView';
import { StatusIndicator } from './StatusIndicator';
import { PromptNavigation } from './PromptNavigation';
import CombinedDiffView from './CombinedDiffView';
import '@xterm/xterm/css/xterm.css';

export function SessionView() {
  const activeSession = useSessionStore((state) => state.getActiveSession());
  const setSessionOutput = useSessionStore((state) => state.setSessionOutput);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [input, setInput] = useState('');
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [viewMode, setViewMode] = useState<'output' | 'messages' | 'changes'>('output');
  const [showPromptNav, setShowPromptNav] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastProcessedOutputLength = useRef(0);
  
  const loadOutputContent = async (retryCount = 0) => {
    if (!activeSession || !terminalInstance.current) return;
    
    setIsLoadingOutput(true);
    setLoadError(null);
    
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/output`);
      if (!response.ok) {
        throw new Error(`Failed to load output: ${response.statusText}`);
      }
      
      const outputs = await response.json();
      
      // Handle output entries
      const outputEntries = outputs.filter((o: any) => o.type !== 'json');
      const outputData = outputEntries.map((o: any) => o.data).join('');
      if (outputData && terminalInstance.current) {
        setSessionOutput(activeSession.id, outputData);
        
        // Small delay to ensure terminal is ready
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Double-check terminal still exists before writing
        if (terminalInstance.current) {
          terminalInstance.current.write(outputData);
          lastProcessedOutputLength.current = outputData.length;
        }
      }
      
      // Handle JSON messages
      const jsonOutputs = outputs.filter((o: any) => o.type === 'json');
      jsonOutputs.forEach((jsonOutput: any) => {
        useSessionStore.getState().addSessionOutput(jsonOutput);
      });
      
      setLoadError(null);
    } catch (error) {
      console.error('Error fetching session output:', error);
      
      if (retryCount < 2) {
        // Retry after a short delay
        setTimeout(() => loadOutputContent(retryCount + 1), 1000);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Failed to load output content');
      }
    } finally {
      setIsLoadingOutput(false);
    }
  };
  
  useEffect(() => {
    if (!terminalRef.current || !activeSession) return;

    // Initialize terminal if not already created
    if (!terminalInstance.current) {
      terminalInstance.current = new Terminal({
        cursorBlink: true,
        convertEol: true,
        rows: 30,
        cols: 80,
        theme: {
          background: '#1a1a1a',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        }
      });
      
      fitAddon.current = new FitAddon();
      terminalInstance.current.loadAddon(fitAddon.current);
      terminalInstance.current.open(terminalRef.current);
      fitAddon.current.fit();
    }

    // Clear terminal when switching sessions
    terminalInstance.current.clear();
    lastProcessedOutputLength.current = 0;

    // Load output content with retry logic
    loadOutputContent();
  }, [activeSession?.id]);

  useEffect(() => {
    if (!terminalInstance.current || !activeSession) return;

    // Write only new output
    const fullOutput = activeSession.output.join('');
    if (fullOutput.length > lastProcessedOutputLength.current) {
      const newOutput = fullOutput.substring(lastProcessedOutputLength.current);
      terminalInstance.current.write(newOutput);
      lastProcessedOutputLength.current = fullOutput.length;
    }
  }, [activeSession?.output]);


  useEffect(() => {
    // Cleanup terminal on unmount
    return () => {
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        fitAddon.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select or create a session to get started
      </div>
    );
  }
  
  const handleSendInput = async () => {
    if (!input.trim()) return;
    
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: input + '\n' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send input');
      }
      
      setInput('');
    } catch (error) {
      console.error('Error sending input:', error);
    }
  };

  const handleContinueConversation = async () => {
    if (!input.trim()) return;
    
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to continue conversation');
      }
      
      setInput('');
    } catch (error) {
      console.error('Error continuing conversation:', error);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeSession.status === 'waiting') {
        handleSendInput();
      } else {
        handleContinueConversation();
      }
    }
  };

  const handleNavigateToPrompt = (marker: any) => {
    // For now, we'll just scroll to the approximate position
    // In a real implementation, we'd calculate the actual line position
    if (terminalInstance.current && marker.output_line) {
      terminalInstance.current.scrollToLine(marker.output_line);
    }
  };

  const handleStopSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to stop session');
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  const handleMergeMainToWorktree = async () => {
    setIsMerging(true);
    setMergeError(null);
    
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/merge-main-to-worktree`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to merge main to worktree');
      }
      
      // If successful, you might want to show a success message
      // For now, we'll just clear any errors
      setMergeError(null);
    } catch (error) {
      console.error('Error merging main to worktree:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to merge main to worktree');
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeWorktreeToMain = async () => {
    setIsMerging(true);
    setMergeError(null);
    
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/merge-worktree-to-main`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to merge worktree to main');
      }
      
      // If successful, you might want to show a success message
      // For now, we'll just clear any errors
      setMergeError(null);
    } catch (error) {
      console.error('Error merging worktree to main:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to merge worktree to main');
    } finally {
      setIsMerging(false);
    }
  };
  
  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-800 truncate">{activeSession.name}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-sm text-gray-600 font-mono">{activeSession.worktreePath}</span>
            </div>
            <div className="flex items-center space-x-3 mt-2">
              <StatusIndicator session={activeSession} size="medium" showText showProgress />
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleMergeMainToWorktree}
                  disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                  className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center space-x-1 ${
                    isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                  title="Merge main branch into this worktree"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span>{isMerging ? 'Merging...' : 'Main → Worktree'}</span>
                </button>
                <button
                  onClick={handleMergeWorktreeToMain}
                  disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                  className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center space-x-1 ${
                    isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                  title="Rebase worktree on main and fast-forward merge (no merge commits)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>{isMerging ? 'Rebasing...' : 'Worktree → Main (FF)'}</span>
                </button>
              </div>
            </div>
            {mergeError && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md">
                <p className="text-sm text-red-700">{mergeError}</p>
              </div>
            )}
            <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200 max-h-32 overflow-y-auto">
              <p className="text-sm text-gray-700 font-medium mb-1">Original Prompt:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{activeSession.prompt}</p>
            </div>
          </div>
          <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('output')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'output' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Output
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'messages' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Messages ({activeSession.jsonMessages?.length || 0})
            </button>
            <button
              onClick={() => setViewMode('changes')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'changes' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Changes
            </button>
          </div>
          <button
            onClick={() => loadOutputContent()}
            disabled={isLoadingOutput}
            className="ml-2 p-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50"
            title="Reload output content"
          >
            <svg className={`w-5 h-5 ${isLoadingOutput ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowPromptNav(!showPromptNav)}
            className="ml-2 p-1 text-gray-600 hover:bg-gray-200 rounded"
            title={showPromptNav ? 'Hide prompt navigation' : 'Show prompt navigation'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {showPromptNav ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex relative overflow-hidden">
        <div className="flex-1 relative">
          {isLoadingOutput && (
            <div className="absolute top-4 left-4 text-gray-400 z-10">Loading output...</div>
          )}
          <div className={`bg-gray-900 h-full ${viewMode === 'output' ? 'block' : 'hidden'} relative`}>
            <div ref={terminalRef} className="h-full" />
            {/* Error state with reload button */}
            {loadError && viewMode === 'output' && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-300 mb-2">Failed to load output content</p>
                  <p className="text-gray-500 text-sm mb-4">{loadError}</p>
                  <button
                    onClick={() => loadOutputContent()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Reload Output
                  </button>
                </div>
              </div>
            )}
            {/* Working indicator */}
            {(activeSession.status === 'running' || activeSession.status === 'initializing') && (
              <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-2">
                <div className="flex items-center space-x-3 text-gray-300">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-sm font-medium">
                    {activeSession.status === 'initializing' ? 'Starting Claude Code...' : 'Claude is working...'}
                  </span>
                  <div className="flex-1 ml-4">
                    <div className="h-1 bg-gray-600 rounded-full overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400 to-transparent w-1/3 animate-slide-progress"></div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {activeSession.status === 'initializing' ? '⚡' : '🧠'}
                  </div>
                  <button
                    onClick={handleStopSession}
                    className="ml-2 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center space-x-1"
                    title="Stop Claude Code"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={`h-full ${viewMode === 'messages' ? 'block' : 'hidden'}`}>
            <JsonMessageView messages={activeSession.jsonMessages || []} />
          </div>
          <div className={`h-full ${viewMode === 'changes' ? 'block' : 'hidden'}`}>
            <CombinedDiffView sessionId={activeSession.id} selectedExecutions={[]} />
          </div>
        </div>
        {showPromptNav && (
          <PromptNavigation 
            sessionId={activeSession.id} 
            onNavigateToPrompt={handleNavigateToPrompt}
          />
        )}
      </div>
      
      <div className="border-t border-gray-300 p-4 bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder={
              activeSession.status === 'waiting' 
                ? "Enter your response..." 
                : "Continue conversation with a new message..."
            }
          />
          <button
            onClick={activeSession.status === 'waiting' ? handleSendInput : handleContinueConversation}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {activeSession.status === 'waiting' ? 'Send' : 'Continue'}
          </button>
        </div>
        {activeSession.status !== 'waiting' && (
          <p className="text-sm text-gray-500 mt-2">
            This will interrupt the current session if running and restart with conversation history.
          </p>
        )}
      </div>
    </div>
  );
}