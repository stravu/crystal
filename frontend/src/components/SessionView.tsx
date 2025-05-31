import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';

export function SessionView() {
  const activeSession = useSessionStore((state) => state.getActiveSession());
  const outputRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [activeSession?.output]);
  
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
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInput();
    }
  };
  
  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3">
        <h2 className="font-semibold text-gray-800">{activeSession.name}</h2>
        <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
          <span className="capitalize">{activeSession.status}</span>
          <span>•</span>
          <span>{activeSession.prompt.substring(0, 50)}...</span>
        </div>
      </div>
      
      <div 
        ref={outputRef}
        className="flex-1 bg-gray-900 text-gray-100 p-4 font-mono text-sm overflow-y-auto"
      >
        <pre className="whitespace-pre-wrap">
          {activeSession.output.join('')}
        </pre>
      </div>
      
      {activeSession.status === 'waiting' && (
        <div className="border-t border-gray-300 p-4 bg-white">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Enter your response..."
            />
            <button
              onClick={handleSendInput}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}