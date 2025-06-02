import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { JsonMessageView } from './JsonMessageView';
import { DiffView } from './DiffView';
import '@xterm/xterm/css/xterm.css';

export function SessionView() {
  const activeSession = useSessionStore((state) => state.getActiveSession());
  const setSessionOutput = useSessionStore((state) => state.setSessionOutput);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [input, setInput] = useState('');
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [viewMode, setViewMode] = useState<'terminal' | 'messages' | 'diff'>('terminal');
  const lastProcessedOutputLength = useRef(0);
  
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

    // Always fetch existing outputs when session is selected (to get both terminal and JSON data)
    setIsLoadingOutput(true);
    fetch(`/api/sessions/${activeSession.id}/output`)
      .then(res => res.json())
      .then(outputs => {
        // Handle terminal outputs
        const terminalOutputs = outputs.filter((o: any) => o.type !== 'json');
        const outputData = terminalOutputs.map((o: any) => o.data).join('');
        if (outputData) {
          setSessionOutput(activeSession.id, outputData);
          terminalInstance.current?.write(outputData);
          lastProcessedOutputLength.current = outputData.length;
        }
        
        // Handle JSON messages - add them to the store via addSessionOutput
        const jsonOutputs = outputs.filter((o: any) => o.type === 'json');
        jsonOutputs.forEach((jsonOutput: any) => {
          useSessionStore.getState().addSessionOutput(jsonOutput);
        });
      })
      .catch(error => console.error('Error fetching session output:', error))
      .finally(() => setIsLoadingOutput(false));
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
  
  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{activeSession.name}</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
              <span className="capitalize">{activeSession.status}</span>
              <span>•</span>
              <span>{activeSession.prompt.substring(0, 50)}...</span>
            </div>
          </div>
          <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('terminal')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'terminal' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Terminal
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
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'diff' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Diff
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 relative overflow-hidden">
        {isLoadingOutput && (
          <div className="absolute top-4 left-4 text-gray-400 z-10">Loading output...</div>
        )}
        <div className={`bg-gray-900 h-full ${viewMode === 'terminal' ? 'block' : 'hidden'}`}>
          <div ref={terminalRef} className="h-full" />
        </div>
        <div className={`h-full ${viewMode === 'messages' ? 'block' : 'hidden'}`}>
          <JsonMessageView messages={activeSession.jsonMessages || []} />
        </div>
        <div className={`h-full ${viewMode === 'diff' ? 'block' : 'hidden'}`}>
          <DiffView activeSession={activeSession} />
        </div>
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