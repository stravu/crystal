import { useState, useEffect } from 'react';
import type { IpcRendererEvent } from 'electron';
import { Loader2, Archive, CheckCircle, AlertCircle } from 'lucide-react';

interface ArchiveTask {
  sessionId: string;
  sessionName: string;
  worktreeName: string;
  projectName: string;
  status: 'pending' | 'queued' | 'removing-worktree' | 'cleaning-artifacts' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  error?: string;
}

interface ArchiveProgressData {
  tasks: ArchiveTask[];
  activeCount: number;
  totalCount: number;
}

export function ArchiveProgress() {
  const [progress, setProgress] = useState<ArchiveProgressData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Initial load
    loadProgress();

    // Listen for progress updates
    const handleProgress = (_event: IpcRendererEvent, data: ArchiveProgressData) => {
      setProgress(data);
      // Auto-expand when there are active tasks
      if (data.activeCount > 0 && !isExpanded) {
        setIsExpanded(true);
      }
    };

    window.electron?.on('archive:progress', handleProgress);

    // Poll for initial state in case we missed events
    const interval = setInterval(loadProgress, 2000);

    return () => {
      window.electron?.off('archive:progress', handleProgress);
      clearInterval(interval);
    };
  }, [isExpanded]);

  const loadProgress = async () => {
    if (!window.electron) return;
    try {
      const response = await window.electron.invoke('archive:get-progress');
      if (response.success) {
        setProgress(response.data);
      }
    } catch (error) {
      console.error('Failed to load archive progress:', error);
    }
  };

  if (!progress || progress.totalCount === 0) {
    return null;
  }

  const getStatusIcon = (status: ArchiveTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-status-success" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-status-error" />;
      case 'queued':
        return <Archive className="w-3 h-3 text-status-waiting" />;
      default:
        return <Loader2 className="w-3 h-3 text-status-info animate-spin" />;
    }
  };

  const getStatusText = (status: ArchiveTask['status']) => {
    switch (status) {
      case 'queued':
        return 'Queued (waiting for other archives to complete)...';
      case 'pending':
        return 'Preparing...';
      case 'removing-worktree':
        return 'Removing worktree (this may take a while)...';
      case 'cleaning-artifacts':
        return 'Cleaning artifacts...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const formatElapsedTime = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const elapsed = Math.floor((end - start) / 1000);
    
    if (elapsed < 60) {
      return `${elapsed}s`;
    }
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="border-t border-border-primary flex-shrink-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-xs text-text-tertiary">
            Archive Tasks
          </span>
          {progress.activeCount > 0 && (
            <span className="px-1.5 py-0.5 bg-status-info/20 text-status-info text-xs rounded-full animate-pulse">
              {progress.activeCount} active
            </span>
          )}
          {progress.tasks.filter(t => t.status === 'queued').length > 0 && (
            <span className="px-1.5 py-0.5 bg-status-waiting/20 text-status-waiting text-xs rounded-full">
              {progress.tasks.filter(t => t.status === 'queued').length} queued
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-border-primary max-h-48 overflow-y-auto bg-surface-secondary">
          {progress.tasks.length === 0 ? (
            <div className="px-4 py-2 text-xs text-text-tertiary">
              No archive tasks
            </div>
          ) : (
            <div className="divide-y divide-border-primary">
              {progress.tasks.map((task) => (
                <div key={task.sessionId} className="px-4 py-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getStatusIcon(task.status)}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text-secondary truncate" title={task.sessionName}>
                          {task.sessionName}
                        </div>
                        <div className="text-xs text-text-tertiary truncate">
                          {task.projectName} / {task.worktreeName}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {formatElapsedTime(task.startTime, task.endTime)}
                    </span>
                  </div>
                  <div className="text-xs text-text-tertiary pl-5">
                    {getStatusText(task.status)}
                  </div>
                  {task.error && (
                    <div className="text-xs text-status-error pl-5 mt-1">
                      {task.error}
                    </div>
                  )}
                  {task.status === 'removing-worktree' && (
                    <div className="text-xs text-status-warning/80 pl-5 mt-1 italic">
                      ⚠️ Worktree removal can take several minutes for large repositories
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}