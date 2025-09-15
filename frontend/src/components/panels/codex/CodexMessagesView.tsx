import React, { useEffect, useState } from 'react';

interface CodexMessagesViewProps {
  panelId: string;
}

export const CodexMessagesView: React.FC<CodexMessagesViewProps> = ({ panelId }) => {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    // Load messages for this panel
    loadMessages();

    // Listen for new messages
    const handleOutput = (data: any) => {
      if (data.panelId === panelId && data.type === 'json') {
        setMessages(prev => [...prev, data.data]);
      }
    };

    window.electron.on('codexPanel:output', handleOutput);

    return () => {
      window.electron.off('codexPanel:output', handleOutput);
    };
  }, [panelId]);

  const loadMessages = async () => {
    try {
      // TODO: Load existing messages from backend
      console.log('[CodexMessagesView] Loading messages for panel:', panelId);
    } catch (error) {
      console.error('[CodexMessagesView] Failed to load messages:', error);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-text-tertiary text-sm">
            No messages yet.
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className="bg-surface-secondary rounded-lg p-3">
              <div className="text-xs text-text-secondary mb-2">
                Message {index + 1} - {new Date().toLocaleTimeString()}
              </div>
              <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                {JSON.stringify(message, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};