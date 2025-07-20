import React from 'react';
import { Check, Edit, FileText, Upload, Download, GitBranch, AlertTriangle, HelpCircle, GitMerge, Circle } from 'lucide-react';
import type { GitStatus } from '../types/session';

interface GitStatusIndicatorProps {
  gitStatus?: GitStatus;
  size?: 'small' | 'medium' | 'large';
  sessionId?: string;
  onClick?: () => void;
}

interface GitStatusConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function getGitStatusConfig(gitStatus: GitStatus): GitStatusConfig {
  const iconSize = 'w-3 h-3';
  
  // Check if truly synced with main
  const isFullySynced = (!gitStatus.ahead || gitStatus.ahead === 0) && 
                       (!gitStatus.behind || gitStatus.behind === 0) && 
                       (!gitStatus.hasUncommittedChanges) &&
                       (!gitStatus.hasUntrackedFiles);
  
  // Special case: Fully synced with main
  if (isFullySynced) {
    return {
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      icon: <Check className={iconSize} />,
      label: 'Synced',
      description: 'Fully synced with main branch'
    };
  }
  
  // Special case: Ready to merge (ahead but clean)
  if (gitStatus.isReadyToMerge) {
    return {
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      icon: <GitMerge className={iconSize} />,
      label: 'Ready to Merge',
      description: `${gitStatus.totalCommits || gitStatus.ahead || 0} commit${(gitStatus.totalCommits || gitStatus.ahead) !== 1 ? 's' : ''} ready to push to main`
    };
  }
  
  switch (gitStatus.state) {
    case 'clean':
      // This is clean but has commits - show it needs to be merged
      if (gitStatus.totalCommits && gitStatus.totalCommits > 0) {
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          icon: <Upload className={iconSize} />,
          label: 'Clean with Commits',
          description: `${gitStatus.totalCommits} commit${gitStatus.totalCommits !== 1 ? 's' : ''} to merge`
        };
      }
      // Truly clean with no commits
      return {
        color: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
        icon: <Check className={iconSize} />,
        label: 'Clean',
        description: 'No uncommitted changes'
      };
    
    case 'modified':
      return {
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        icon: <Edit className={iconSize} />,
        label: 'Active Changes',
        description: gitStatus.ahead && gitStatus.ahead > 0 
          ? `${gitStatus.ahead} commit${gitStatus.ahead !== 1 ? 's' : ''} + ${gitStatus.filesChanged || 0} uncommitted file${gitStatus.filesChanged !== 1 ? 's' : ''}`
          : `${gitStatus.filesChanged || 0} uncommitted file${gitStatus.filesChanged !== 1 ? 's' : ''}`
      };
    
    case 'untracked':
      return {
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        icon: <FileText className={iconSize} />,
        label: 'Untracked',
        description: 'Contains untracked files'
      };
    
    case 'ahead':
      return {
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        icon: <Upload className={iconSize} />,
        label: 'Ahead',
        description: `${gitStatus.ahead || 0} commit${gitStatus.ahead !== 1 ? 's' : ''} ahead of main`
      };
    
    case 'behind':
      return {
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        icon: <Download className={iconSize} />,
        label: 'Behind',
        description: `${gitStatus.behind || 0} commit${gitStatus.behind !== 1 ? 's' : ''} behind main`
      };
    
    case 'diverged':
      return {
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        icon: <GitBranch className={iconSize} />,
        label: 'Diverged',
        description: `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind main`
      };
    
    case 'conflict':
      return {
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        icon: <AlertTriangle className={iconSize} />,
        label: 'Conflict',
        description: 'Has merge conflicts - resolve before continuing'
      };
    
    case 'unknown':
    default:
      return {
        color: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
        icon: <HelpCircle className={iconSize} />,
        label: 'Unknown',
        description: 'Unable to determine git status'
      };
  }
}

const GitStatusIndicator: React.FC<GitStatusIndicatorProps> = React.memo(({ gitStatus, size = 'small', sessionId, onClick }) => {
  if (!gitStatus) {
    return null;
  }

  const config = getGitStatusConfig(gitStatus);
  
  // Size configurations
  const sizeConfig = {
    small: {
      dot: 'w-2 h-2',
      text: 'text-xs',
      padding: 'px-1.5 py-0.5',
      gap: 'gap-0.5'
    },
    medium: {
      dot: 'w-3 h-3',
      text: 'text-sm',
      padding: 'px-2 py-1',
      gap: 'gap-1'
    },
    large: {
      dot: 'w-4 h-4',
      text: 'text-base',
      padding: 'px-3 py-1.5',
      gap: 'gap-1.5'
    }
  }[size];

  // Build comprehensive tooltip content
  let tooltipContent = '';
  
  // Show total commits in branch if available
  if (gitStatus.totalCommits && gitStatus.totalCommits > 0) {
    tooltipContent = `${gitStatus.totalCommits} commit${gitStatus.totalCommits !== 1 ? 's' : ''} in branch`;
    
    // Add ahead/behind info if relevant
    if (gitStatus.ahead && gitStatus.ahead > 0) {
      tooltipContent += ` (${gitStatus.ahead} ahead of main)`;
    } else if (gitStatus.behind && gitStatus.behind > 0) {
      tooltipContent += ` (${gitStatus.behind} behind main)`;
    } else if (gitStatus.state === 'diverged') {
      tooltipContent += ` (${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind)`;
    }
    
    // Add file change statistics for commits
    if (gitStatus.commitFilesChanged) {
      tooltipContent += `\n${gitStatus.commitFilesChanged} files changed (+${gitStatus.commitAdditions || 0}/-${gitStatus.commitDeletions || 0})`;
    }
  } else if (gitStatus.ahead && gitStatus.ahead > 0) {
    // Fallback to old behavior if totalCommits not available
    tooltipContent = `${gitStatus.ahead} commit${gitStatus.ahead !== 1 ? 's' : ''} ahead of main`;
    if (gitStatus.commitFilesChanged) {
      tooltipContent += `\n${gitStatus.commitFilesChanged} files changed (+${gitStatus.commitAdditions || 0}/-${gitStatus.commitDeletions || 0})`;
    }
  } else if (gitStatus.behind && gitStatus.behind > 0) {
    tooltipContent = `${gitStatus.behind} commit${gitStatus.behind !== 1 ? 's' : ''} behind main`;
  } else if (gitStatus.state === 'diverged') {
    tooltipContent = `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind main`;
  }
  
  // Add uncommitted changes info
  if (gitStatus.hasUncommittedChanges && gitStatus.filesChanged) {
    if (tooltipContent) tooltipContent += '\n\n';
    tooltipContent += `Uncommitted changes:\n${gitStatus.filesChanged} file${gitStatus.filesChanged !== 1 ? 's' : ''} modified`;
    if (gitStatus.additions || gitStatus.deletions) {
      tooltipContent += ` (+${gitStatus.additions || 0}/-${gitStatus.deletions || 0})`;
    }
  }
  
  // If still no content (e.g., clean state with no commits ahead), be more descriptive
  if (!tooltipContent) {
    if (gitStatus.state === 'clean') {
      tooltipContent = 'Branch is up to date with main\nNo uncommitted changes';
    } else if (gitStatus.state === 'modified' && gitStatus.filesChanged) {
      tooltipContent = `${gitStatus.filesChanged} uncommitted file${gitStatus.filesChanged !== 1 ? 's' : ''}`;
      if (gitStatus.additions || gitStatus.deletions) {
        tooltipContent += ` (+${gitStatus.additions || 0}/-${gitStatus.deletions || 0})`;
      }
    } else {
      tooltipContent = config.description;
    }
  }
  
  // Add untracked files note
  if (gitStatus.hasUntrackedFiles) {
    tooltipContent += '\n+ untracked files';
  }
  
  // Add actionable information
  let actionableInfo = '';
  
  // Check sync status
  const isFullySynced = (!gitStatus.ahead || gitStatus.ahead === 0) && 
                       (!gitStatus.behind || gitStatus.behind === 0) && 
                       (!gitStatus.hasUncommittedChanges) &&
                       (!gitStatus.hasUntrackedFiles);
  
  if (isFullySynced) {
    actionableInfo = '✅ Fully synced with main - safe to remove worktree';
  } else if (gitStatus.isReadyToMerge) {
    actionableInfo = '🔀 Has commits not in main - needs merge';
  } else if (gitStatus.hasUncommittedChanges) {
    actionableInfo = '⚠️ Commit changes before merging';
  } else if (gitStatus.behind && gitStatus.behind > 0) {
    actionableInfo = '⬇️ Behind main - pull latest changes';
  } else if (gitStatus.state === 'diverged') {
    actionableInfo = '🔄 Diverged - rebase or merge with main';
  } else if (gitStatus.ahead && gitStatus.ahead > 0) {
    actionableInfo = '⬆️ Ahead of main - needs merge';
  }
  
  if (actionableInfo) {
    tooltipContent += '\n\n' + actionableInfo;
  }
  
  // Add click hint
  tooltipContent += '\n\nClick to view diff details';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else if (sessionId) {
      // Dispatch event to select session and switch to View Diff tab
      const selectEvent = new CustomEvent('select-session-and-view-diff', { 
        detail: { sessionId } 
      });
      window.dispatchEvent(selectEvent);
    }
  };

  return (
    <span 
      className={`inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding} ${sizeConfig.text} rounded-md border ${config.bgColor} ${config.color} border-gray-300 dark:border-gray-600 ${(onClick || sessionId) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      title={tooltipContent}
      onClick={handleClick}
    >
      {config.icon}
      {/* Display logic: Show numbers for branches with commits or changes */}
      <span className="flex items-center gap-1">
        {/* Always show total commits if > 0 */}
        {gitStatus.totalCommits && gitStatus.totalCommits > 0 && (
          <span className="font-medium">{gitStatus.totalCommits}</span>
        )}
        
        {/* Show file changes as secondary when there are both commits and uncommitted changes */}
        {gitStatus.totalCommits && gitStatus.totalCommits > 0 && gitStatus.hasUncommittedChanges && gitStatus.filesChanged && (
          <>
            <Circle className="w-1 h-1 fill-current opacity-50" />
            <span className="text-xs opacity-75">{gitStatus.filesChanged}</span>
          </>
        )}
        
        {/* For branches with only uncommitted changes (no commits) */}
        {(!gitStatus.totalCommits || gitStatus.totalCommits === 0) && gitStatus.filesChanged && (
          <span className="font-medium">{gitStatus.filesChanged}</span>
        )}
        
        {/* For behind state, show behind count */}
        {gitStatus.state === 'behind' && gitStatus.behind && gitStatus.behind > 0 && (
          <span className="font-medium">↓{gitStatus.behind}</span>
        )}
        
        {/* For diverged state */}
        {gitStatus.state === 'diverged' && (
          <>
            {gitStatus.totalCommits && gitStatus.totalCommits > 0 ? (
              <span className="font-medium">{gitStatus.totalCommits}</span>
            ) : (
              <>
                {gitStatus.ahead && gitStatus.ahead > 0 && (
                  <span className="font-medium">↑{gitStatus.ahead}</span>
                )}
                {gitStatus.behind && gitStatus.behind > 0 && (
                  <span className="font-medium">↓{gitStatus.behind}</span>
                )}
              </>
            )}
          </>
        )}
      </span>
    </span>
  );
});

GitStatusIndicator.displayName = 'GitStatusIndicator';

export { GitStatusIndicator };