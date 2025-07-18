import { useRef, useEffect, useState, memo, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { JsonMessageView } from './JsonMessageView';
import { EmptyState } from './EmptyState';
import CombinedDiffView from './CombinedDiffView';
import { StravuFileSearch } from './StravuFileSearch';
import { Inbox } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useSessionView } from '../hooks/useSessionView';
import { SessionHeader } from './session/SessionHeader';
import { SessionInputWithImages } from './session/SessionInputWithImages';
import { GitErrorDialog } from './session/GitErrorDialog';
import { CommitMessageDialog } from './session/CommitMessageDialog';
import { PromptNavigation } from './PromptNavigation';
import { isDocumentVisible } from '../utils/performanceUtils';
import { FileEditor } from './FileEditor';

export const SessionView = memo(() => {
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const activeMainRepoSession = useSessionStore((state) => state.activeMainRepoSession);
  const [animationsEnabled, setAnimationsEnabled] = useState(isDocumentVisible());

  useEffect(() => {
    const handleVisibilityChange = () => {
      setAnimationsEnabled(isDocumentVisible());
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  const activeSession = activeSessionId 
    ? (activeMainRepoSession && activeMainRepoSession.id === activeSessionId 
        ? activeMainRepoSession 
        : sessions.find(s => s.id === activeSessionId))
    : undefined;

  const terminalRef = useRef<HTMLDivElement>(null);
  const scriptTerminalRef = useRef<HTMLDivElement>(null);

  const hook = useSessionView(activeSession, terminalRef, scriptTerminalRef);
  
  // Memoize props to prevent unnecessary re-renders
  const emptySelectedExecutions = useMemo(() => [], []);
  const isMainRepo = useMemo(() => activeSession?.isMainRepo || false, [activeSession?.isMainRepo]);

  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <EmptyState
          icon={Inbox}
          title="No Session Selected"
          description="Select a session from the sidebar to view its output, or create a new session to get started."
          className="flex-1"
        />
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <SessionHeader
        activeSession={activeSession}
        isEditingName={hook.isEditingName}
        editName={hook.editName}
        setEditName={hook.setEditName}
        handleNameKeyDown={hook.handleNameKeyDown}
        handleSaveEditName={hook.handleSaveEditName}
        handleStartEditName={hook.handleStartEditName}
        isPathCollapsed={hook.isPathCollapsed}
        setIsPathCollapsed={hook.setIsPathCollapsed}
        isMerging={hook.isMerging}
        handleGitPull={hook.handleGitPull}
        handleGitPush={hook.handleGitPush}
        handleRebaseMainIntoWorktree={hook.handleRebaseMainIntoWorktree}
        hasChangesToRebase={hook.hasChangesToRebase}
        gitCommands={hook.gitCommands}
        handleSquashAndRebaseToMain={hook.handleSquashAndRebaseToMain}
        handleOpenIDE={hook.handleOpenIDE}
        mergeError={hook.mergeError}
        viewMode={hook.viewMode}
        setViewMode={hook.setViewMode}
        unreadActivity={hook.unreadActivity}
        setUnreadActivity={hook.setUnreadActivity}
      />
      
      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative">
          {hook.isLoadingOutput && (
            <div className="absolute top-4 left-4 text-gray-600 dark:text-gray-400 z-10">Loading output...</div>
          )}
          <div className={`bg-gray-50 dark:bg-black h-full ${hook.viewMode === 'output' ? 'flex flex-col' : 'hidden'} relative`}>
            <div 
              ref={terminalRef} 
              className="flex-1 min-h-0"
            />
            {(activeSession.status === 'running' || activeSession.status === 'initializing') && (
              <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex-shrink-0">
                <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
                    <div className="flex items-center space-x-3">
                        <div className="flex space-x-1">
                            <div className={`w-2 h-2 bg-blue-400 rounded-full ${animationsEnabled ? 'animate-typing-dot' : ''}`}></div>
                            <div className={`w-2 h-2 bg-blue-400 rounded-full ${animationsEnabled ? 'animate-typing-dot' : ''}`} style={{ animationDelay: '0.2s' }}></div>
                            <div className={`w-2 h-2 bg-blue-400 rounded-full ${animationsEnabled ? 'animate-typing-dot' : ''}`} style={{ animationDelay: '0.4s' }}></div>
                        </div>
                        <span className="text-sm font-medium">
                            {activeSession.status === 'initializing' ? 'Starting Claude Code...' : 'Claude is working...'}
                        </span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                            {activeSession.status === 'initializing' ? '⚡' : hook.formatElapsedTime(hook.elapsedTime)}
                        </div>
                        <button onClick={hook.handleStopSession} className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md">
                            Cancel
                        </button>
                    </div>
                </div>
              </div>
            )}
            {hook.loadError && hook.viewMode === 'output' && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
                  <p className="text-gray-700 dark:text-gray-300 mb-2">Failed to load output content</p>
                  <p className="text-gray-600 dark:text-gray-500 text-sm mb-4">{hook.loadError}</p>
                  <button onClick={() => hook.loadOutputContent(activeSession.id)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Reload Output
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={`h-full ${hook.viewMode === 'messages' ? 'block' : 'hidden'}`}>
            <JsonMessageView messages={activeSession.jsonMessages || []} />
          </div>
          <div className={`h-full ${hook.viewMode === 'changes' ? 'block' : 'hidden'} overflow-hidden`}>
            <CombinedDiffView 
              sessionId={activeSession.id} 
              selectedExecutions={emptySelectedExecutions} 
              isGitOperationRunning={hook.isMerging}
              isMainRepo={isMainRepo}
              isVisible={hook.viewMode === 'changes'}
            />
          </div>
          <div className={`h-full ${hook.viewMode === 'terminal' ? 'flex flex-col' : 'hidden'} bg-gray-50 dark:bg-black`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Terminal
              </div>
              {!activeSession.archived && (
                <button
                  onClick={hook.handleClearTerminal}
                  className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Clear terminal"
                >
                  <svg 
                    className="w-4 h-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                    />
                  </svg>
                </button>
              )}
            </div>
            {activeSession.archived ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className="mb-4">
                    <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    No Terminal History Available
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This session has been archived. Terminal history is not preserved for archived sessions to save resources.
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    The session outputs and conversation history are still available in the Output and Messages views.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div ref={scriptTerminalRef} className="flex-1" />
                <div className="h-2" />
              </>
            )}
          </div>
          <div className={`h-full ${hook.viewMode === 'editor' ? 'block' : 'hidden'}`}>
            <FileEditor sessionId={activeSession.id} />
          </div>
        </div>
        {hook.viewMode === 'output' && (
          <PromptNavigation 
            sessionId={activeSession.id} 
            onNavigateToPrompt={hook.handleNavigateToPrompt}
          />
        )}
      </div>
      
      {hook.viewMode !== 'terminal' && (
        <SessionInputWithImages
          activeSession={activeSession}
          viewMode={hook.viewMode}
          input={hook.input}
          setInput={hook.setInput}
          textareaRef={hook.textareaRef}
          handleTerminalCommand={hook.handleTerminalCommand}
          handleSendInput={hook.handleSendInput}
          handleContinueConversation={hook.handleContinueConversation}
          isStravuConnected={hook.isStravuConnected}
          setShowStravuSearch={hook.setShowStravuSearch}
          ultrathink={hook.ultrathink}
          setUltrathink={hook.setUltrathink}
          handleToggleAutoCommit={hook.handleToggleAutoCommit}
        />
      )}

      <CommitMessageDialog
        isOpen={hook.showCommitMessageDialog}
        onClose={() => hook.setShowCommitMessageDialog(false)}
        dialogType={hook.dialogType}
        gitCommands={hook.gitCommands}
        commitMessage={hook.commitMessage}
        setCommitMessage={hook.setCommitMessage}
        shouldSquash={hook.shouldSquash}
        setShouldSquash={hook.setShouldSquash}
        onConfirm={hook.performSquashWithCommitMessage}
        isMerging={hook.isMerging}
      />

      <GitErrorDialog
        isOpen={hook.showGitErrorDialog}
        onClose={() => hook.setShowGitErrorDialog(false)}
        errorDetails={hook.gitErrorDetails}
        getGitErrorTips={hook.getGitErrorTips}
        onAbortAndUseClaude={hook.handleAbortRebaseAndUseClaude}
      />

      <StravuFileSearch
        isOpen={hook.showStravuSearch}
        onClose={() => hook.setShowStravuSearch(false)}
        onFileSelect={hook.handleStravuFileSelect}
      />
    </div>
  );
});

SessionView.displayName = 'SessionView';