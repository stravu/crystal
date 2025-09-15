import React, { useEffect, useState, useRef } from 'react';
import { RichOutputSettings } from '../ai/AbstractAIPanel';

interface CodexRichOutputViewProps {
  panelId: string;
  sessionStatus: string;
  settings: RichOutputSettings;
  onSettingsChange: (settings: RichOutputSettings) => void;
  showSettings?: boolean;
}

export const CodexRichOutputView: React.FC<CodexRichOutputViewProps> = ({
  panelId,
  sessionStatus,
  settings,
  onSettingsChange,
  showSettings = false
}) => {
  const [outputs, setOutputs] = useState<any[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    // Load existing outputs
    loadOutputs();

    // Listen for new outputs
    const handleOutput = (data: any) => {
      console.log(`[codex-debug] CodexRichOutputView received output event:`, data);
      if (data.panelId === panelId) {
        console.log(`[codex-debug] Output is for this panel, adding to outputs`);
        setOutputs(prev => [...prev, data]);
        // Auto-scroll to bottom
        if (shouldAutoScrollRef.current && scrollContainerRef.current) {
          setTimeout(() => {
            scrollContainerRef.current?.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }, 100);
        }
      }
    };

    // Listen for Electron IPC events
    window.electron.on('codexPanel:output', handleOutput);
    
    // Also listen for custom events from the frontend
    const handleCustomOutput = (event: CustomEvent) => {
      console.log(`[codex-debug] CodexRichOutputView received custom output event:`, event.detail);
      handleOutput(event.detail);
    };
    
    window.addEventListener('codexPanel:output', handleCustomOutput as any);

    return () => {
      window.electron.off('codexPanel:output', handleOutput);
      window.removeEventListener('codexPanel:output', handleCustomOutput as any);
    };
  }, [panelId]);

  const loadOutputs = async () => {
    try {
      console.log('[codex-debug] CodexRichOutputView loading outputs for panel:', panelId);
      const existingOutputs = await window.electron.invoke('codexPanel:getOutputs', panelId, 1000);
      console.log(`[codex-debug] Loaded ${existingOutputs.length} existing outputs for panel ${panelId}`);
      
      if (existingOutputs.length > 0) {
        setOutputs(existingOutputs);
        
        // Auto-scroll to bottom after loading
        if (shouldAutoScrollRef.current && scrollContainerRef.current) {
          setTimeout(() => {
            scrollContainerRef.current?.scrollTo({
              top: scrollContainerRef.current.scrollHeight,
              behavior: 'auto'
            });
          }, 100);
        }
      }
    } catch (error) {
      console.error('[codex-debug] CodexRichOutputView failed to load outputs:', error);
    }
  };

  const renderOutput = (output: any, index: number) => {
    // Parse data if it's a string (from database)
    let parsedData = output.data;
    if (output.type === 'json' && typeof output.data === 'string') {
      try {
        parsedData = JSON.parse(output.data);
      } catch (e) {
        console.error('[codex-debug] Failed to parse JSON data:', e);
      }
    }
    
    if (output.type === 'json' && parsedData) {
      return renderJsonMessage(parsedData, index);
    }
    
    if (output.type === 'stdout' || output.type === 'stderr') {
      return (
        <div key={index} className={`px-4 py-2 font-mono text-sm ${
          output.type === 'stderr' ? 'text-red-400' : 'text-text-primary'
        }`}>
          <pre className="whitespace-pre-wrap">{parsedData}</pre>
        </div>
      );
    }

    return null;
  };

  const renderJsonMessage = (message: any, index: number) => {
    // Handle Codex protocol messages
    if (message.msg) {
      // This is a Codex protocol message
      const msg = message.msg;
      
      if (msg.type === 'session_configured') {
        return (
          <div key={index} className="px-4 py-2 text-xs text-text-tertiary italic">
            Session configured with {msg.model || 'default model'}
          </div>
        );
      }
      
      if (msg.type === 'user_input') {
        return (
          <div key={index} className="px-4 py-3 bg-surface-secondary border-l-4 border-blue-500">
            <div className="text-xs text-text-secondary mb-1">User</div>
            <div className="text-text-primary">{msg.content || msg.text || JSON.stringify(msg)}</div>
          </div>
        );
      }
      
      if (msg.type === 'assistant_message' || msg.type === 'text') {
        return (
          <div key={index} className="px-4 py-3">
            <div className="text-xs text-text-secondary mb-1">Codex</div>
            <div className="text-text-primary whitespace-pre-wrap">{msg.text || msg.content || JSON.stringify(msg)}</div>
          </div>
        );
      }
      
      if (msg.type === 'tool_call' && settings.showToolCalls) {
        return (
          <div key={index} className="px-4 py-2 bg-surface-hover/50">
            <div className="text-xs text-text-secondary mb-1">Tool: {msg.tool || 'unknown'}</div>
            <pre className="text-xs text-text-tertiary font-mono overflow-x-auto">
              {JSON.stringify(msg.args || msg, null, 2)}
            </pre>
          </div>
        );
      }
      
      if (msg.type === 'tool_result' && settings.showToolCalls) {
        return (
          <div key={index} className="px-4 py-2 bg-surface-hover/30">
            <div className="text-xs text-text-secondary mb-1">Tool Result</div>
            <pre className="text-xs text-text-tertiary font-mono overflow-x-auto max-h-32 overflow-y-auto">
              {typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2)}
            </pre>
          </div>
        );
      }
    }
    
    // Render different message types (for frontend-generated messages)
    if (message.type === 'user_input') {
      return (
        <div key={index} className="px-4 py-3 bg-surface-secondary border-l-4 border-blue-500">
          <div className="text-xs text-text-secondary mb-1">User</div>
          <div className="text-text-primary">{message.content || JSON.stringify(message)}</div>
        </div>
      );
    }

    if (message.type === 'assistant_response') {
      return (
        <div key={index} className="px-4 py-3">
          <div className="text-xs text-text-secondary mb-1">Codex</div>
          <div className="text-text-primary">{message.content || JSON.stringify(message)}</div>
        </div>
      );
    }

    if (message.type === 'tool_call' && settings.showToolCalls) {
      return (
        <div key={index} className="px-4 py-2 bg-surface-hover/50">
          <div className="text-xs text-text-secondary mb-1">Tool Call</div>
          <pre className="text-xs text-text-tertiary font-mono">
            {JSON.stringify(message, null, 2)}
          </pre>
        </div>
      );
    }

    if (message.type === 'system') {
      return (
        <div key={index} className="px-4 py-2 text-xs text-text-tertiary italic">
          System: {message.message || JSON.stringify(message)}
        </div>
      );
    }

    // Default rendering for unknown types
    if (!settings.compactMode) {
      return (
        <div key={index} className="px-4 py-2">
          <pre className="text-xs text-text-tertiary font-mono">
            {JSON.stringify(message, null, 2)}
          </pre>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-border-primary bg-surface-secondary">
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showToolCalls}
                onChange={(e) => onSettingsChange({ ...settings, showToolCalls: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Show Tool Calls</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.compactMode}
                onChange={(e) => onSettingsChange({ ...settings, compactMode: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Compact Mode</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showThinking}
                onChange={(e) => onSettingsChange({ ...settings, showThinking: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Show Thinking</span>
            </label>
          </div>
        </div>
      )}

      {/* Output Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
          shouldAutoScrollRef.current = isAtBottom;
        }}
      >
        {outputs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            No output yet. Send a message to start.
          </div>
        ) : (
          <div className="py-2">
            {outputs.map((output, index) => renderOutput(output, index))}
          </div>
        )}
      </div>
    </div>
  );
};