import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { Session } from '../types/session';

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  diff?: string;
}

interface DiffViewProps {
  activeSession: Session;
}

export function DiffView({ activeSession }: DiffViewProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Load all sessions for comparison
  useEffect(() => {
    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        const otherSessions = data.filter((s: Session) => s.id !== activeSession.id);
        setSessions(otherSessions);
        if (otherSessions.length > 0) {
          setSelectedSession(otherSessions[0].id);
        }
      })
      .catch(error => console.error('Error fetching sessions:', error));
  }, [activeSession.id]);

  // Load file changes when session selection changes
  useEffect(() => {
    if (!selectedSession) return;

    setLoading(true);
    fetch(`/api/sessions/${activeSession.id}/diff/${selectedSession}`)
      .then(res => res.json())
      .then(data => {
        setFileChanges(data.files || []);
        if (data.files && data.files.length > 0) {
          setSelectedFile(data.files[0].path);
        }
      })
      .catch(error => {
        console.error('Error fetching diff:', error);
        setFileChanges([]);
      })
      .finally(() => setLoading(false));
  }, [selectedSession, activeSession.id]);

  // Load diff for selected file
  useEffect(() => {
    if (!selectedFile || !selectedSession) return;

    const params = new URLSearchParams({ path: selectedFile });
    fetch(`/api/sessions/${activeSession.id}/diff/${selectedSession}/file?${params}`)
      .then(res => res.text())
      .then(diffText => setDiff(diffText))
      .catch(error => {
        console.error('Error fetching file diff:', error);
        setDiff('Error loading diff');
      });
  }, [selectedFile, selectedSession, activeSession.id]);

  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-lg mb-2">No other sessions to compare</div>
          <div className="text-sm">Create another session to see file differences</div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added': return 'text-green-600 bg-green-50';
      case 'modified': return 'text-yellow-600 bg-yellow-50';
      case 'deleted': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusSymbol = (status: string) => {
    switch (status) {
      case 'added': return '+';
      case 'modified': return '~';
      case 'deleted': return '-';
      default: return '?';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            Compare with Session
          </h3>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </div>
        {selectedSession && (
          <div className="text-sm text-gray-600 mt-2">
            Comparing <span className="font-medium">{activeSession.name}</span> with{' '}
            <span className="font-medium">
              {sessions.find(s => s.id === selectedSession)?.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File List */}
        <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <h4 className="font-medium text-gray-700">
              Changed Files ({fileChanges.length})
            </h4>
          </div>
          
          {loading ? (
            <div className="p-4 text-gray-500">Loading changes...</div>
          ) : fileChanges.length === 0 ? (
            <div className="p-4 text-gray-500">No differences found</div>
          ) : (
            <div className="space-y-1 p-2">
              {fileChanges.map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                    selectedFile === file.path
                      ? 'bg-blue-100 text-blue-800'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${getStatusColor(file.status)}`}>
                      {getStatusSymbol(file.status)}
                    </span>
                    <span className="truncate">{file.path}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Diff View */}
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <h4 className="font-medium text-gray-700">{selectedFile}</h4>
              </div>
              <div className="flex-1 overflow-auto">
                <pre className="text-xs p-4 whitespace-pre-wrap font-mono leading-relaxed">
                  {diff || 'Loading diff...'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              Select a file to view the diff
            </div>
          )}
        </div>
      </div>
    </div>
  );
}