import React from 'react';
import { Check, Edit, CircleArrowDown, AlertTriangle, HelpCircle, GitMerge, Loader2 } from 'lucide-react';
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
  
  // Add actionable information based on new simplified scheme
  let actionableInfo = '';
  
  // Check sync status
  const isFullySynced = isGitStatusFullySynced(gitStatus);
  const hasCommitsToMerge = gitStatus.ahead && gitStatus.ahead > 0 && !gitStatus.hasUncommittedChanges && !gitStatus.hasUntrackedFiles && (!gitStatus.behind || gitStatus.behind === 0);
  const hasConflictRisk = gitStatus.ahead && gitStatus.ahead > 0 && gitStatus.behind && gitStatus.behind > 0;
  
  if (hasCommitsToMerge || gitStatus.isReadyToMerge) {
    actionableInfo = '🔀 Ready to merge - no conflicts expected';
  } else if (hasConflictRisk) {
    actionableInfo = '⚠️ Rebase from main before merging to avoid conflicts';
  } else if (gitStatus.state === 'conflict') {
    actionableInfo = '🚫 Resolve merge conflicts before continuing';
  } else if (gitStatus.hasUncommittedChanges || gitStatus.hasUntrackedFiles) {
    actionableInfo = '📝 Commit changes before merging';
  } else if (gitStatus.behind && gitStatus.behind > 0 && (!gitStatus.ahead || gitStatus.ahead === 0)) {
    actionableInfo = '⬇️ Consider updating or removing - no unique changes';
  } else if (isFullySynced) {
    actionableInfo = '✅ Safe to remove - no unique changes';
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
  
  // HIGH PRIORITY: Branches with changes that matter
  
  // 1. Ready to Merge (HIGH PRIORITY) - Has commits to merge, clean working directory, not behind
  if (gitStatus.isReadyToMerge || 
      (gitStatus.ahead && gitStatus.ahead > 0 && !gitStatus.hasUncommittedChanges && !gitStatus.hasUntrackedFiles && (!gitStatus.behind || gitStatus.behind === 0))) {
    const commitCount = gitStatus.totalCommits || gitStatus.ahead || 0;
    return {
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      icon: <GitMerge {...iconProps} />,
      label: 'Ready to Merge',
      description: `${commitCount} commit${commitCount !== 1 ? 's' : ''} ready to merge`
    };
  }
  
  // 2. Conflict Risk (HIGH PRIORITY) - Has commits but also behind main
  if (gitStatus.ahead && gitStatus.ahead > 0 && gitStatus.behind && gitStatus.behind > 0) {
    return {
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      icon: <AlertTriangle {...iconProps} />,
      label: 'Conflict Risk',
      description: `${gitStatus.ahead} ahead, ${gitStatus.behind} behind - potential conflicts`
    };
  }
  
  // SPECIAL CASES: Keep these distinct
  
  // Active merge conflicts
  if (gitStatus.state === 'conflict') {
    return {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      icon: <AlertTriangle {...iconProps} />,
      label: 'Conflicts',
      description: 'Has merge conflicts - resolve before continuing'
    };
  }
  
  // Uncommitted changes (includes both modified and untracked)
  if (gitStatus.hasUncommittedChanges || gitStatus.hasUntrackedFiles || gitStatus.state === 'modified' || gitStatus.state === 'untracked') {
    const ahead = gitStatus.ahead || 0;
    const filesChanged = gitStatus.filesChanged || 0;
    const hasFiles = filesChanged > 0 || gitStatus.hasUntrackedFiles;
    
    let description = '';
    if (ahead > 0 && hasFiles) {
      description = `${ahead} commit${ahead !== 1 ? 's' : ''} + uncommitted changes`;
    } else if (hasFiles) {
      description = gitStatus.hasUntrackedFiles ? 'Untracked files' : `${filesChanged} uncommitted file${filesChanged !== 1 ? 's' : ''}`;
    } else {
      description = 'Uncommitted changes';
    }
    
    return {
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      icon: <Edit {...iconProps} />,
      label: 'Uncommitted',
      description: description
    };
  }
  
  // LOW PRIORITY: Branches you care little about
  
  // Behind only (no commits ahead)
  if (gitStatus.behind && gitStatus.behind > 0 && (!gitStatus.ahead || gitStatus.ahead === 0)) {
    return {
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800/30',
      icon: <CircleArrowDown {...iconProps} />,
      label: 'Behind Only',
      description: `${gitStatus.behind} commit${gitStatus.behind !== 1 ? 's' : ''} behind main`
    };
  }
  
  // Up to date (fully synced)
  const isFullySynced = isGitStatusFullySynced(gitStatus);
  if (isFullySynced) {
    return {
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800/30',
      icon: <Check {...iconProps} />,
      label: 'Up to Date',
      description: 'No changes - safe to remove'
    };
  }
  
  // Fallback for unknown states
  return {
    color: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/30',
    icon: <HelpCircle {...iconProps} />,
    label: 'Unknown',
    description: 'Unable to determine git status'
  };
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