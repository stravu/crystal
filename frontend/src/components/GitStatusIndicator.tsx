import React from 'react';
import { Check, Edit, FileText, CircleArrowUp, CircleArrowDown, GitBranch, AlertTriangle, HelpCircle, GitMerge, Loader2 } from 'lucide-react';
import type { GitStatus } from '../types/session';

interface GitStatusIndicatorProps {
  gitStatus?: GitStatus;
  size?: 'small' | 'medium' | 'large';
  sessionId?: string;
  onClick?: () => void;
  isLoading?: boolean;
}

interface GitStatusConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

/**
 * Checks if the git status indicates the branch is fully synced with main
 */
function isGitStatusFullySynced(gitStatus: GitStatus): boolean {
  return (!gitStatus.ahead || gitStatus.ahead === 0) && 
         (!gitStatus.behind || gitStatus.behind === 0) && 
         (!gitStatus.hasUncommittedChanges) &&
         (!gitStatus.hasUntrackedFiles);
}

/**
 * Builds the comprehensive tooltip content for the git status indicator
 */
function buildTooltipContent(gitStatus: GitStatus, config: GitStatusConfig): string {
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
  const isFullySynced = isGitStatusFullySynced(gitStatus);
  
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
  
  return tooltipContent;
}

function getGitStatusConfig(gitStatus: GitStatus): GitStatusConfig {
  const iconProps = { size: 14, strokeWidth: 2 };
  
  // Check if truly synced with main
  const isFullySynced = isGitStatusFullySynced(gitStatus);
  
  // Special case: Fully synced with main
  if (isFullySynced) {
    return {
      color: 'text-git-synced dark:text-git-synced-dark',
      bgColor: 'bg-git-synced/20 dark:bg-git-synced-dark/20',
      icon: <Check {...iconProps} />,
      label: 'Synced',
      description: 'Fully synced with main branch'
    };
  }
  
  // Special case: Ready to merge (ahead but clean)
  if (gitStatus.isReadyToMerge) {
    const commitCount = gitStatus.totalCommits || 0;
    return {
      color: 'text-git-merge dark:text-git-merge-dark',
      bgColor: 'bg-git-merge/20 dark:bg-git-merge-dark/20',
      icon: <GitMerge {...iconProps} />,
      label: 'Ready to Merge',
      description: `${commitCount} commit${commitCount !== 1 ? 's' : ''} ready to push to main`
    };
  }
  
  switch (gitStatus.state) {
    case 'clean':
      // This is clean but has commits - show it needs to be merged
      if (gitStatus.totalCommits && gitStatus.totalCommits > 0) {
        return {
          color: 'text-git-ahead dark:text-git-ahead-dark',
          bgColor: 'bg-git-ahead/20 dark:bg-git-ahead-dark/20',
          icon: <CircleArrowUp {...iconProps} />,
          label: 'Clean with Commits',
          description: `${gitStatus.totalCommits} commit${gitStatus.totalCommits !== 1 ? 's' : ''} to merge`
        };
      }
      // Truly clean with no commits
      return {
        color: 'text-git-unknown dark:text-git-unknown-dark',
        bgColor: 'bg-git-unknown/20 dark:bg-git-unknown-dark/20',
        icon: <Check {...iconProps} />,
        label: 'Clean',
        description: 'No uncommitted changes'
      };
    
    case 'modified':
      return {
        color: 'text-git-active dark:text-git-active-dark',
        bgColor: 'bg-git-active/20 dark:bg-git-active-dark/20',
        icon: <Edit {...iconProps} />,
        label: 'Active Changes',
        description: gitStatus.ahead && gitStatus.ahead > 0 
          ? `${gitStatus.ahead} commit${gitStatus.ahead !== 1 ? 's' : ''} + ${gitStatus.filesChanged || 0} uncommitted file${gitStatus.filesChanged !== 1 ? 's' : ''}`
          : `${gitStatus.filesChanged || 0} uncommitted file${gitStatus.filesChanged !== 1 ? 's' : ''}`
      };
    
    case 'untracked':
      return {
        color: 'text-git-untracked dark:text-git-untracked-dark',
        bgColor: 'bg-git-untracked/20 dark:bg-git-untracked-dark/20',
        icon: <FileText {...iconProps} />,
        label: 'Untracked',
        description: 'Contains untracked files'
      };
    
    case 'ahead':
      return {
        color: 'text-git-ahead dark:text-git-ahead-dark',
        bgColor: 'bg-git-ahead/20 dark:bg-git-ahead-dark/20',
        icon: <CircleArrowUp {...iconProps} />,
        label: 'Ahead',
        description: `${gitStatus.ahead || 0} commit${gitStatus.ahead !== 1 ? 's' : ''} ahead of main`
      };
    
    case 'behind':
      return {
        color: 'text-git-behind dark:text-git-behind-dark',
        bgColor: 'bg-git-behind/20 dark:bg-git-behind-dark/20',
        icon: <CircleArrowDown {...iconProps} />,
        label: 'Behind',
        description: `${gitStatus.behind || 0} commit${gitStatus.behind !== 1 ? 's' : ''} behind main`
      };
    
    case 'diverged':
      return {
        color: 'text-git-diverged dark:text-git-diverged-dark',
        bgColor: 'bg-git-diverged/20 dark:bg-git-diverged-dark/20',
        icon: <GitBranch {...iconProps} />,
        label: 'Diverged',
        description: `${gitStatus.ahead || 0} ahead, ${gitStatus.behind || 0} behind main`
      };
    
    case 'conflict':
      return {
        color: 'text-git-conflict dark:text-git-conflict-dark',
        bgColor: 'bg-git-conflict/20 dark:bg-git-conflict-dark/20',
        icon: <AlertTriangle {...iconProps} />,
        label: 'Conflict',
        description: 'Has merge conflicts - resolve before continuing'
      };
    
    case 'unknown':
    default:
      return {
        color: 'text-git-unknown dark:text-git-unknown-dark',
        bgColor: 'bg-git-unknown/20 dark:bg-git-unknown-dark/20',
        icon: <HelpCircle {...iconProps} />,
        label: 'Unknown',
        description: 'Unable to determine git status'
      };
  }
}

const GitStatusIndicator: React.FC<GitStatusIndicatorProps> = React.memo(({ gitStatus, size = 'small', sessionId, onClick, isLoading }) => {
  // Size configurations
  const sizeConfig = {
    small: {
      dot: 'w-2 h-2',
      text: 'text-xs',
      padding: 'px-1.5 py-0.5',
      gap: 'gap-0.5',
      loader: 'w-3 h-3'
    },
    medium: {
      dot: 'w-3 h-3',
      text: 'text-sm',
      padding: 'px-2 py-1',
      gap: 'gap-1',
      loader: 'w-4 h-4'
    },
    large: {
      dot: 'w-4 h-4',
      text: 'text-base',
      padding: 'px-3 py-1.5',
      gap: 'gap-1.5',
      loader: 'w-5 h-5'
    }
  }[size];

  // Show loading state
  if (isLoading === true) {
    return (
      <span 
        className={`inline-flex items-center justify-center w-[5.5ch] ${sizeConfig.padding} ${sizeConfig.text} rounded-md border bg-gray-100 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600`}
        title="Checking git status..."
        data-testid={sessionId ? `session-${sessionId}-git-status` : 'git-status'}
        data-git-loading="true"
      >
        <Loader2 className={`${sizeConfig.loader} animate-spin`} />
      </span>
    );
  }

  // No git status and not loading
  if (!gitStatus) {
    return null;
  }

  const config = getGitStatusConfig(gitStatus);

  // Build comprehensive tooltip content using helper function
  const tooltipContent = buildTooltipContent(gitStatus, config);

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

  // Determine the primary count to display
  let primaryCount = 0;
  let ariaLabel = config.label;
  
  if (gitStatus.totalCommits && gitStatus.totalCommits > 0) {
    primaryCount = gitStatus.totalCommits;
    ariaLabel = `${primaryCount} commit${primaryCount !== 1 ? 's' : ''} in branch`;
  } else if (gitStatus.filesChanged && gitStatus.filesChanged > 0) {
    primaryCount = gitStatus.filesChanged;
    ariaLabel = `${primaryCount} file${primaryCount !== 1 ? 's' : ''} changed`;
  } else if (gitStatus.ahead && gitStatus.ahead > 0) {
    primaryCount = gitStatus.ahead;
    ariaLabel = `Ahead by ${primaryCount} commit${primaryCount !== 1 ? 's' : ''}`;
  } else if (gitStatus.behind && gitStatus.behind > 0) {
    primaryCount = gitStatus.behind;
    ariaLabel = `Behind by ${primaryCount} commit${primaryCount !== 1 ? 's' : ''}`;
  }

  return (
    <span 
      className={`inline-flex items-center ${primaryCount > 0 ? 'justify-center gap-0.5' : 'justify-center'} w-[5.5ch] ${sizeConfig.padding} ${sizeConfig.text} rounded-md border ${config.bgColor} ${config.color} border-gray-300 dark:border-gray-600 ${(onClick || sessionId) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      title={tooltipContent}
      onClick={handleClick}
      aria-label={ariaLabel}
      data-testid={sessionId ? `session-${sessionId}-git-status` : 'git-status'}
      data-git-state={gitStatus.state}
      data-git-ahead={gitStatus.ahead}
      data-git-behind={gitStatus.behind}
    >
      <span className="flex-shrink-0">
        {config.icon}
      </span>
      {primaryCount > 0 && (
        <span className="font-bold">
          {primaryCount > 9 ? '★' : primaryCount}
        </span>
      )}
    </span>
  );
});

GitStatusIndicator.displayName = 'GitStatusIndicator';

export { GitStatusIndicator };