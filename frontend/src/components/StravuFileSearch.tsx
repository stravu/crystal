import { useState, useEffect } from 'react';
import { API } from '../utils/api';

interface StravuNotebook {
  id: string;
  title: string;
  excerpt?: string;
  lastModified: string;
  tags: string[];
  wordCount?: number;
  similarity?: number;
}

interface StravuFileSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (notebook: StravuNotebook, content: string) => void;
}

export function StravuFileSearch({ isOpen, onClose, onFileSelect }: StravuFileSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StravuNotebook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<StravuNotebook | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Check connection status when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkConnectionStatus();
    }
  }, [isOpen]);

  const checkConnectionStatus = async () => {
    try {
      const response = await API.stravu.getConnectionStatus();
      if (response.success) {
        setIsConnected(response.data.status === 'connected');
        if (response.data.status !== 'connected') {
          // Don't auto-connect, let user click button
          setIsConnected(false);
        }
      }
    } catch (err) {
      console.error('Failed to check Stravu connection status:', err);
      setError('Failed to check connection status');
    }
  };

  const connectToStravu = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const response = await API.stravu.initiateAuth();
      if (response.success) {
        // OAuth flow initiated, browser opened
        // Poll for completion
        if (response.data.sessionId) {
          await pollForAuth(response.data.sessionId);
        }
      } else {
        setError('Failed to initiate Stravu authentication: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to connect to Stravu: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsConnecting(false);
    }
  };

  const pollForAuth = async (sessionId: string) => {
    const maxAttempts = 30; // 1 minute timeout
    let attempts = 0;
    
    const poll = async () => {
      attempts++;
      try {
        const response = await API.stravu.checkAuthStatus(sessionId);
        if (response.success) {
          if (response.data.status === 'completed') {
            setIsConnected(true);
            setError(null);
            return;
          } else if (response.data.status === 'error') {
            setError('Authentication failed: ' + (response.data.error || 'Unknown error'));
            return;
          }
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000); // Poll every 2 seconds
        } else {
          setError('Authentication timeout. Please try again.');
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setError('Authentication failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    };
    
    poll();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await API.stravu.searchNotebooks(searchQuery, 20);
      if (response.success) {
        setSearchResults(response.data || []);
      } else {
        setError('Search failed: ' + (response.error || 'Unknown error'));
        setSearchResults([]);
      }
    } catch (err) {
      setError('Search failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNotebookClick = async (notebook: StravuNotebook) => {
    setSelectedNotebook(notebook);
    setIsLoadingContent(true);
    setError(null);

    try {
      const response = await API.stravu.getNotebook(notebook.id);
      if (response.success) {
        onFileSelect(notebook, response.data.content);
        onClose();
      } else {
        setError('Failed to load notebook content: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to load notebook content: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoadingContent(false);
      setSelectedNotebook(null);
    }
  };

  const formatWordCount = (wordCount?: number): string => {
    if (!wordCount) return '0 words';
    return `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  // Search on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Search Stravu Notebooks</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!isConnected ? (
            <div className="text-center py-8">
              {isConnecting ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <svg className="w-8 h-8 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <p className="text-gray-600">Connecting to Stravu...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                  <p className="text-gray-600">Not connected to Stravu</p>
                  <p className="text-sm text-gray-500">Please authenticate with Stravu to access your notebooks.</p>
                  <button
                    onClick={connectToStravu}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Connect to Stravu
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search for notebooks (AI-powered semantic search)..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isSearching ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>Search</span>
                    </>
                  )}
                </button>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">
                    Search Results ({searchResults.length})
                  </h3>
                  <div className="grid gap-2">
                    {searchResults.map((notebook) => (
                      <div
                        key={notebook.id}
                        onClick={() => handleNotebookClick(notebook)}
                        className={`p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedNotebook?.id === notebook.id && isLoadingContent ? 'bg-blue-50 border-blue-200' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                              </svg>
                              <h4 className="text-sm font-medium text-gray-900 truncate">{notebook.title}</h4>
                              {selectedNotebook?.id === notebook.id && isLoadingContent && (
                                <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                              {notebook.similarity && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  {Math.round(notebook.similarity * 100)}% match
                                </span>
                              )}
                            </div>
                            {notebook.excerpt && (
                              <p className="text-xs text-gray-600 mt-1">{notebook.excerpt}</p>
                            )}
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                              <span>{formatWordCount(notebook.wordCount)}</span>
                              <span>{formatDate(notebook.lastModified)}</span>
                              {notebook.tags.length > 0 && (
                                <div className="flex items-center space-x-1">
                                  <span>Tags:</span>
                                  {notebook.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="bg-gray-100 text-gray-600 px-1 rounded text-xs">
                                      {tag}
                                    </span>
                                  ))}
                                  {notebook.tags.length > 3 && (
                                    <span className="text-gray-400">+{notebook.tags.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery && !isSearching && searchResults.length === 0 && !error && (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-gray-600">No notebooks found for "{searchQuery}"</p>
                  <p className="text-sm text-gray-500 mt-1">Try a different search term or concept</p>
                </div>
              )}

              {!searchQuery && (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-600">Search for Stravu notebooks</p>
                  <p className="text-sm text-gray-500 mt-1">Use AI-powered semantic search to find notebooks by concept</p>
                  <p className="text-xs text-gray-400 mt-2">💡 Try searching for "machine learning examples" or "API documentation"</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}