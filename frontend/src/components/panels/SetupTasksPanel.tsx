import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, ChevronRight, GitBranch, FileCode } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { panelApi } from '../../services/panelApi';
import { API } from '../../utils/api';
import type { SetupTasksPanelState } from '../../../../shared/types/panels';
import { CreateSessionDialog } from '../CreateSessionDialog';

interface SetupTask {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  check: () => Promise<boolean>;
  action?: () => void;
  actionLabel?: string;
}

interface SetupTasksPanelProps {
  panelId: string;
  sessionId: string;
  isActive: boolean;
}

const SetupTasksPanel: React.FC<SetupTasksPanelProps> = ({ panelId, isActive }) => {
  const sessionContext = useSession();
  const [tasksStatus, setTasksStatus] = useState<Record<string, boolean>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);

  // Get project info from session context
  const projectId = sessionContext?.projectId;

  // Check if .gitignore contains worktrees directory
  const checkGitignore = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    
    try {
      // Use the file API to read .gitignore from the project
      const response = await window.electronAPI.file.readProject(parseInt(projectId), '.gitignore');
      if (!response.success || !response.data) return false;
      
      const content = response.data as string;
      // Check for common worktree patterns
      return content.includes('/worktrees/') || 
             content.includes('/worktree-*/') ||
             content.includes('worktrees/') ||
             content.includes('worktree-*/');
    } catch (error) {
      // If .gitignore doesn't exist, that's ok - it's not found
      return false;
    }
  }, [projectId]);

  // Check if project has run scripts configured
  const checkRunScript = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    
    try {
      // Get project details to check run script
      const response = await API.projects.getAll();
      if (!response.success || !response.data) return false;
      
      const projects = response.data as Array<{ id: number; run_script?: string }>;      
      const project = projects.find(p => p.id === parseInt(projectId));
      return !!(project?.run_script && project.run_script.trim());
    } catch (error) {
      console.error('Error checking run script:', error);
      return false;
    }
  }, [projectId]);

  // Open project settings
  const openProjectSettings = useCallback(async () => {
    if (!projectId) return;
    
    try {
      // First, update the project's run script to "./crystal-run.sh"
      const updateResponse = await API.projects.update(projectId, {
        run_script: './crystal-run.sh'
      });
      
      if (!updateResponse.success) {
        console.error('Failed to update project run script:', updateResponse.error);
        alert(`Failed to update run script: ${updateResponse.error}`);
        return;
      }
      
      console.log('[SetupTasksPanel] Successfully set run script to ./crystal-run.sh');
      
      // Now open the session dialog with the specific prompt
      setShowSessionDialog(true);
    } catch (error) {
      console.error('Error updating project settings:', error);
      alert(`Error updating project settings: ${error}`);
    }
  }, [projectId]);

  // Add worktrees to .gitignore
  const addToGitignore = useCallback(async () => {
    if (!projectId) return;
    
    console.log('[SetupTasksPanel] Starting addToGitignore for project:', projectId);
    
    // Show confirmation dialog
    const confirmed = window.confirm(
      'Crystal will add worktree patterns to .gitignore and create a new commit.\n\n' +
      'This will:\n' +
      '• Add /worktrees/ and /worktree-*/ patterns to .gitignore\n' +
      '• Create a commit with only these changes\n' +
      '• Leave any other uncommitted changes untouched\n\n' +
      'Proceed?'
    );
    
    if (!confirmed) {
      console.log('[SetupTasksPanel] User cancelled .gitignore update');
      return;
    }
    
    try {
      // Read current .gitignore or create empty if doesn't exist
      console.log('[SetupTasksPanel] Reading .gitignore...');
      const readResponse = await window.electronAPI.file.readProject(parseInt(projectId), '.gitignore');
      console.log('[SetupTasksPanel] Read response:', readResponse);
      
      let content = '';
      
      if (readResponse.success && readResponse.data) {
        content = readResponse.data as string;
        console.log('[SetupTasksPanel] Current .gitignore length:', content.length);
      } else if (readResponse.success && readResponse.data === null) {
        console.log('[SetupTasksPanel] .gitignore does not exist, will create it');
      } else {
        console.error('[SetupTasksPanel] Failed to read .gitignore:', readResponse.error);
        alert(`Failed to read .gitignore: ${readResponse.error}`);
        return;
      }
      
      // Add worktree patterns if not already present
      const patterns = [
        '\n# Git worktrees (Crystal)',
        '/worktrees/',
        '/worktree-*/'
      ];
      
      let needsUpdate = false;
      const linesToAdd: string[] = [];
      
      for (const pattern of patterns) {
        if (!content.includes(pattern.replace('\n# ', '')) && !content.includes(pattern)) {
          linesToAdd.push(pattern);
          needsUpdate = true;
          console.log('[SetupTasksPanel] Will add pattern:', pattern);
        }
      }
      
      if (needsUpdate) {
        console.log('[SetupTasksPanel] Updating .gitignore with patterns:', linesToAdd);
        
        // Ensure file ends with newline
        if (content && !content.endsWith('\n')) {
          content += '\n';
        }
        
        // Add the patterns
        content += linesToAdd.join('\n') + '\n';
        
        console.log('[SetupTasksPanel] Writing updated content to .gitignore...');
        // Write back to file
        const writeResponse = await window.electronAPI.file.writeProject(parseInt(projectId), '.gitignore', content);
        console.log('[SetupTasksPanel] Write response:', writeResponse);
        
        if (!writeResponse.success) {
          console.error('[SetupTasksPanel] Failed to write .gitignore:', writeResponse.error);
          alert(`Failed to update .gitignore: ${writeResponse.error}`);
          return;
        }
        
        console.log('[SetupTasksPanel] Successfully updated .gitignore');
        
        // Now create a git commit with just the .gitignore file
        console.log('[SetupTasksPanel] Creating git commit...');
        
        // Stage the .gitignore file
        const gitAddResponse = await window.electronAPI.git.executeProject(
          parseInt(projectId),
          ['add', '.gitignore']
        );
        
        if (!gitAddResponse.success) {
          console.error('[SetupTasksPanel] Failed to stage .gitignore:', gitAddResponse.error);
          alert(`Failed to stage .gitignore: ${gitAddResponse.error}`);
          return;
        }
        
        console.log('[SetupTasksPanel] Staged .gitignore file');
        
        // Create the commit
        const commitMessage = 'Add Crystal worktree patterns to .gitignore\n\n' +
          'Added patterns to ignore Crystal worktree directories:\n' +
          '- /worktrees/\n' +
          '- /worktree-*/\n\n' +
          'This prevents git from tracking temporary Crystal session directories.';
        
        const gitCommitResponse = await window.electronAPI.git.executeProject(
          parseInt(projectId),
          ['commit', '-m', commitMessage]
        );
        
        if (!gitCommitResponse.success) {
          // Check if it's because there's nothing to commit (file unchanged)
          if (gitCommitResponse.error?.includes('nothing to commit') || gitCommitResponse.error?.includes('no changes added')) {
            console.log('[SetupTasksPanel] No changes to commit (file was already up to date)');
            alert('The .gitignore file was already up to date. No commit needed.');
          } else {
            console.error('[SetupTasksPanel] Failed to commit:', gitCommitResponse.error);
            alert(`Failed to create commit: ${gitCommitResponse.error}`);
          }
          // Still refresh the task status
          setTimeout(() => checkAllTasks(), 100);
          return;
        }
        
        console.log('[SetupTasksPanel] Successfully created commit');
        alert('Successfully added worktree patterns to .gitignore and created a commit!');
        
        // Refresh the task status
        setTimeout(() => checkAllTasks(), 100);
      } else {
        console.log('[SetupTasksPanel] No update needed, patterns already exist');
        alert('Worktree patterns are already in .gitignore. No changes needed.');
      }
    } catch (error) {
      console.error('[SetupTasksPanel] Error updating .gitignore:', error);
      alert(`Error updating .gitignore: ${error}`);
    }
  }, [projectId]);

  // Check all tasks
  const checkAllTasks = useCallback(async () => {
    if (!isActive || !projectId) return;
    
    setIsChecking(true);
    const newStatus: Record<string, boolean> = {};
    
    // Check gitignore
    try {
      newStatus['gitignore'] = await checkGitignore();
    } catch (error) {
      console.error('Error checking gitignore:', error);
      newStatus['gitignore'] = false;
    }
    
    // Check run script
    try {
      newStatus['runscript'] = await checkRunScript();
    } catch (error) {
      console.error('Error checking run script:', error);
      newStatus['runscript'] = false;
    }
    
    setTasksStatus(newStatus);
    setIsChecking(false);
    
    // Update panel state
    const panelState: SetupTasksPanelState = {
      lastCheck: new Date().toISOString(),
      tasksCompleted: newStatus
    };
    
    await panelApi.updatePanel(panelId, {
      state: {
        isActive: true,
        customState: panelState
      }
    });
  }, [isActive, projectId, panelId, checkGitignore, checkRunScript]);

  // Update addToGitignore to use checkAllTasks after it's defined
  const addToGitignoreWithRefresh = useCallback(async () => {
    await addToGitignore();
    await checkAllTasks();
  }, [addToGitignore, checkAllTasks]);

  // Define setup tasks
  const setupTasks: SetupTask[] = [
    {
      id: 'gitignore',
      title: 'Add worktrees to .gitignore',
      description: 'Prevents git from tracking temporary worktree directories created by Crystal sessions. This keeps your repository clean and avoids committing session-specific files.',
      icon: <GitBranch className="w-5 h-5" />,
      check: checkGitignore,
      action: addToGitignoreWithRefresh,
      actionLabel: 'Add to .gitignore'
    },
    {
      id: 'runscript',
      title: 'Configure run script',
      description: 'Set up a command to run your project (e.g., npm run dev, python app.py). This allows you to quickly test changes made by Claude Code sessions.',
      icon: <FileCode className="w-5 h-5" />,
      check: checkRunScript,
      action: openProjectSettings,
      actionLabel: 'Create Run Script'
    }
  ];


  // Check tasks when panel becomes active
  useEffect(() => {
    if (isActive) {
      checkAllTasks();
    }
  }, [isActive, checkAllTasks]);

  // Listen for file changes
  useEffect(() => {
    // File change listener could be implemented here if needed
    // For now, we'll rely on manual refresh
  }, [isActive, checkAllTasks]);

  const allTasksComplete = Object.values(tasksStatus).every(status => status);
  const completedCount = Object.values(tasksStatus).filter(status => status).length;

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <div className="text-text-secondary">No project selected</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-bg-primary text-text-primary overflow-auto">
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-text-primary mb-2">Setup Tasks</h2>
          <p className="text-text-secondary">Complete these tasks to get the best experience with Crystal</p>
        </div>

        {/* Progress indicator */}
        <div className="mb-6 p-4 bg-surface-secondary border border-border-secondary rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Progress</span>
            <span className="text-sm text-text-secondary">{completedCount} of {setupTasks.length} completed</span>
          </div>
          <div className="w-full bg-border-secondary rounded-full h-2 overflow-hidden">
            <div 
              className="bg-status-success h-full transition-all duration-300"
              style={{ width: `${(completedCount / setupTasks.length) * 100}%` }}
            />
          </div>
          {allTasksComplete && (
            <div className="mt-2 text-sm text-status-success flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              All setup tasks complete!
            </div>
          )}
        </div>

        {/* Task list */}
        <div className="space-y-3">
          {setupTasks.map(task => {
            const isComplete = tasksStatus[task.id] || false;
            const isExpanded = expandedTask === task.id;

            return (
              <div
                key={task.id}
                className={`
                  border rounded-lg transition-all
                  ${isComplete 
                    ? 'border-status-success bg-surface-secondary' 
                    : 'border-border-secondary bg-surface-primary'
                  }
                `}
              >
                <button
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors rounded-t-lg"
                >
                  {/* Status icon */}
                  <div className={`${isComplete ? 'text-status-success' : 'text-text-tertiary'}`}>
                    {isChecking ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isComplete ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>

                  {/* Task icon */}
                  <div className={`${isComplete ? 'text-status-success' : 'text-text-secondary'}`}>
                    {task.icon}
                  </div>

                  {/* Task title */}
                  <span className={`
                    flex-1 text-left font-medium
                    ${isComplete ? 'text-status-success' : 'text-text-primary'}
                  `}>
                    {task.title}
                  </span>

                  {/* Expand icon */}
                  <ChevronRight 
                    className={`
                      w-4 h-4 text-text-tertiary transition-transform
                      ${isExpanded ? 'rotate-90' : ''}
                    `}
                  />
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border-secondary">
                    <p className="mt-3 text-sm text-text-secondary">
                      {task.description}
                    </p>
                    
                    {!isComplete && task.action && (
                      <button
                        onClick={task.action}
                        className="mt-3 px-4 py-2 bg-interactive hover:bg-interactive-hover text-text-on-interactive text-sm font-medium rounded transition-colors"
                      >
                        {task.actionLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Refresh button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={checkAllTasks}
            disabled={isChecking}
            className="px-4 py-2 text-sm font-medium rounded transition-colors bg-surface-secondary hover:bg-surface-hover text-text-primary disabled:bg-surface-secondary disabled:opacity-50"
          >
            {isChecking ? 'Checking...' : 'Refresh Status'}
          </button>
        </div>
      </div>
      
      {/* Create Session Dialog for run script */}
      <CreateSessionDialog
        isOpen={showSessionDialog}
        onClose={() => {
          setShowSessionDialog(false);
          // Refresh task status after dialog closes
          setTimeout(() => checkAllTasks(), 500);
        }}
        projectId={parseInt(projectId)}
        projectName={sessionContext?.projectName}
        initialPrompt="Create a new file crystal-run.sh that launches this project. Before launching, the script should safely kill any other running instances of the project."
        initialSessionName="build-run-script"
      />
    </div>
  );
};

export default SetupTasksPanel;
