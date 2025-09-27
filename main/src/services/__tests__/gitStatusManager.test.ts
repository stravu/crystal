import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { GitStatusManager } from '../gitStatusManager';
import { execSync } from '../../utils/commandExecutor';
import { existsSync } from 'fs';
import type { SessionManager } from '../sessionManager';
import type { WorktreeManager } from '../worktreeManager';
import type { GitDiffManager } from '../gitDiffManager';
import type { Logger } from '../../utils/logger';

// Type for accessing private methods in tests
interface GitStatusManagerWithPrivates {
  executeGitCommand(command: string, cwd: string): { success: boolean; output?: unknown; error?: unknown };
  getUntrackedFiles(cwd: string): { success: boolean; output?: unknown; error?: unknown };
  getRevListCount(cwd: string, mainBranch: string): { success: boolean; output?: unknown; error?: unknown };
  getDiffStats(cwd: string, mainBranch: string): { success: boolean; output?: unknown; error?: unknown };
  checkMergeConflicts(cwd: string): { success: boolean; output?: unknown; error?: unknown };
  fetchGitStatus(sessionId: string): Promise<{ state: string; lastChecked: string; [key: string]: unknown } | null>;
  pollAllSessions(): void;
  cache: Record<string, { status: { state: string; lastChecked: string; [key: string]: unknown }; lastChecked: number }>;
}

// Mock the modules
vi.mock('../../utils/commandExecutor');
vi.mock('fs');

describe('GitStatusManager', () => {
  let gitStatusManager: GitStatusManager;
  let mockSessionManager: SessionManager;
  let mockWorktreeManager: WorktreeManager;
  let mockGitDiffManager: GitDiffManager;
  let mockLogger: Logger;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockSessionManager = {
      getSession: vi.fn(),
      getProjectForSession: vi.fn(),
    } as Partial<SessionManager> as SessionManager;

    mockWorktreeManager = {
      getProjectMainBranch: vi.fn().mockResolvedValue('main'),
    } as Partial<WorktreeManager> as WorktreeManager;

    mockGitDiffManager = {
      captureWorkingDirectoryDiff: vi.fn().mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      }),
    } as Partial<GitDiffManager> as GitDiffManager;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    } as Partial<Logger> as Logger;

    // Create GitStatusManager instance
    gitStatusManager = new GitStatusManager(
      mockSessionManager,
      mockWorktreeManager,
      mockGitDiffManager,
      mockLogger
    );
  });

  describe('executeGitCommand', () => {
    it('should execute git command successfully', () => {
      const mockOutput = 'command output';
      (execSync as Mock).mockReturnValue(Buffer.from(mockOutput));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).executeGitCommand('git status', '/test/path');

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockOutput);
      expect(execSync).toHaveBeenCalledWith('git status', { cwd: '/test/path' });
    });

    it('should handle git command failure', () => {
      const error = new Error('Command failed');
      (execSync as Mock).mockImplementation(() => { throw error; });

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).executeGitCommand('git status', '/test/path');

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('getUntrackedFiles', () => {
    it('should detect untracked files', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('file1.txt\nfile2.js\n'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getUntrackedFiles('/test/path');

      expect(result.success).toBe(true);
      expect(result.output).toBe(true); // Has untracked files
    });

    it('should return false when no untracked files', () => {
      (execSync as Mock).mockReturnValue(Buffer.from(''));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getUntrackedFiles('/test/path');

      expect(result.success).toBe(true);
      expect(result.output).toBe(false); // No untracked files
    });
  });

  describe('getRevListCount', () => {
    it('should parse ahead/behind counts correctly', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('3\t5'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getRevListCount('/test/path', 'main');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ ahead: 5, behind: 3 });
    });

    it('should handle zero counts', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('0\t0'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getRevListCount('/test/path', 'main');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ ahead: 0, behind: 0 });
    });
  });

  describe('getDiffStats', () => {
    it('should parse diff stats correctly', () => {
      (execSync as Mock).mockReturnValue(Buffer.from(' 3 files changed, 10 insertions(+), 5 deletions(-)'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getDiffStats('/test/path', 'main');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        filesChanged: 3,
        additions: 10,
        deletions: 5
      });
    });

    it('should handle single file change', () => {
      (execSync as Mock).mockReturnValue(Buffer.from(' 1 file changed, 2 insertions(+)'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).getDiffStats('/test/path', 'main');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        filesChanged: 1,
        additions: 2,
        deletions: 0
      });
    });
  });

  describe('checkMergeConflicts', () => {
    it('should detect merge conflicts', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('UU file1.txt\nAA file2.txt'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).checkMergeConflicts('/test/path');

      expect(result.success).toBe(true);
      expect(result.output).toBe(true); // Has conflicts
    });

    it('should return false when no conflicts', () => {
      (execSync as Mock).mockReturnValue(Buffer.from('M  file1.txt\nA  file2.txt'));

      const result = (gitStatusManager as unknown as GitStatusManagerWithPrivates).checkMergeConflicts('/test/path');

      expect(result.success).toBe(true);
      expect(result.output).toBe(false); // No conflicts
    });
  });

  describe('fetchGitStatus', () => {
    const mockSession = {
      id: 'test-session',
      worktreePath: '/test/worktree',
      archived: false,
    };

    const mockProject = {
      id: 1,
      path: '/test/project',
    };

    beforeEach(() => {
      (mockSessionManager.getSession as Mock).mockResolvedValue(mockSession);
      (mockSessionManager.getProjectForSession as Mock).mockReturnValue(mockProject);
      (existsSync as Mock).mockReturnValue(false); // No rebase in progress
    });

    it('should return clean status when no changes', async () => {
      // Mock clean repository state
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('0\t0')) // No commits ahead/behind
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status).toBeTruthy();
      expect(status!.state).toBe('clean');
      expect(status!.ahead).toBeUndefined();
      expect(status!.behind).toBeUndefined();
      expect(status!.additions).toBeUndefined();
      expect(status!.deletions).toBeUndefined();
    });

    it('should return modified status with uncommitted changes', async () => {
      // Mock modified files
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 3, additions: 15, deletions: 5 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('0\t0')) // No commits ahead/behind
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('modified');
      expect(status!.filesChanged).toBe(3);
      expect(status!.additions).toBe(15);
      expect(status!.deletions).toBe(5);
      expect(status!.hasUncommittedChanges).toBe(true);
    });

    it('should return ahead status when commits ahead of main', async () => {
      // Mock ahead state
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('0\t3')) // 3 commits ahead
        .mockReturnValueOnce(Buffer.from(' 5 files changed, 20 insertions(+), 10 deletions(-)')) // Diff stats
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('3')); // 3 total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('ahead');
      expect(status!.ahead).toBe(3);
      expect(status!.totalCommits).toBe(3);
      expect(status!.commitFilesChanged).toBe(5);
      expect(status!.commitAdditions).toBe(20);
      expect(status!.commitDeletions).toBe(10);
      expect(status!.isReadyToMerge).toBe(true);
    });

    it('should return behind status when commits behind main', async () => {
      // Mock behind state
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('5\t0')) // 5 commits behind
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('behind');
      expect(status!.behind).toBe(5);
      expect(status!.ahead).toBeUndefined();
    });

    it('should return diverged status when both ahead and behind', async () => {
      // Mock diverged state
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('3\t2')) // 2 ahead, 3 behind
        .mockReturnValueOnce(Buffer.from(' 4 files changed, 15 insertions(+), 8 deletions(-)')) // Diff stats
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('2')); // 2 total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('diverged');
      expect(status!.ahead).toBe(2);
      expect(status!.behind).toBe(3);
      expect(status!.totalCommits).toBe(2);
    });

    it('should return conflict status when merge conflicts exist', async () => {
      // Mock conflict state
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 2, additions: 5, deletions: 3 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('')) // No untracked files
        .mockReturnValueOnce(Buffer.from('0\t0')) // No commits ahead/behind
        .mockReturnValueOnce(Buffer.from('UU conflict.txt')) // Has conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('conflict');
      // The hasMergeConflicts property is not exposed in the result,
      // but the state being 'conflict' indicates merge conflicts exist
    });

    it('should handle untracked files', async () => {
      // Mock untracked files
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('new-file.txt')) // Has untracked files
        .mockReturnValueOnce(Buffer.from('0\t0')) // No commits ahead/behind
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status!.state).toBe('untracked');
      expect(status!.hasUntrackedFiles).toBe(true);
    });

    it('should still fetch status for archived session', async () => {
      // The actual implementation doesn't check for archived status in fetchGitStatus
      // It only checks in the public methods like refreshSessionGitStatus
      const archivedSession = { ...mockSession, archived: true };
      (mockSessionManager.getSession as Mock).mockResolvedValue(archivedSession);

      // Mock git commands to return some status
      (mockGitDiffManager.captureWorkingDirectoryDiff as Mock).mockResolvedValue({
        stats: { filesChanged: 0, additions: 0, deletions: 0 },
      });
      (execSync as Mock)
        .mockReturnValueOnce(Buffer.from('new-file.txt')) // Has untracked files
        .mockReturnValueOnce(Buffer.from('0\t0')) // No commits ahead/behind
        .mockReturnValueOnce(Buffer.from('')) // No merge conflicts
        .mockReturnValueOnce(Buffer.from('0')); // No total commits

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      // It will still return a status for archived sessions
      expect(status).toBeTruthy();
      expect(status!.state).toBe('untracked');
    });

    it('should return null when session not found', async () => {
      (mockSessionManager.getSession as Mock).mockResolvedValue(null);

      const status = await (gitStatusManager as unknown as GitStatusManagerWithPrivates).fetchGitStatus('test-session');

      expect(status).toBeNull();
    });
  });

  describe('polling', () => {
    it('should start polling when startPolling is called', () => {
      vi.useFakeTimers();
      try {
        const pollSpy = vi.spyOn(gitStatusManager as unknown as GitStatusManagerWithPrivates, 'pollAllSessions').mockImplementation(() => {});

        gitStatusManager.startPolling();

        // Should call immediately
        expect(pollSpy).toHaveBeenCalledTimes(1);

        // Should call again after interval
        vi.advanceTimersByTime(60000); // 60 seconds
        expect(pollSpy).toHaveBeenCalledTimes(2);

        gitStatusManager.stopPolling();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should stop polling when stopPolling is called', () => {
      vi.useFakeTimers();
      try {
        const pollSpy = vi.spyOn(gitStatusManager as unknown as GitStatusManagerWithPrivates, 'pollAllSessions').mockImplementation(() => {});

        gitStatusManager.startPolling();
        expect(pollSpy).toHaveBeenCalledTimes(1);

        gitStatusManager.stopPolling();

        // Should not call again after stopping
        vi.advanceTimersByTime(60000);
        expect(pollSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('caching', () => {
    it('should return cached status within TTL', async () => {
      const mockStatus = { state: 'clean' as const, lastChecked: new Date().toISOString() };
      (gitStatusManager as unknown as GitStatusManagerWithPrivates).cache['test-session'] = {
        status: mockStatus,
        lastChecked: Date.now(),
      };

      const fetchSpy = vi.spyOn(gitStatusManager as unknown as GitStatusManagerWithPrivates, 'fetchGitStatus');
      
      const status = await gitStatusManager.getGitStatus('test-session');

      expect(status).toEqual(mockStatus);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should fetch fresh status after TTL expires', async () => {
      const oldStatus = { state: 'clean' as const, lastChecked: new Date().toISOString() };
      const newStatus = { state: 'modified' as const, lastChecked: new Date().toISOString() };
      
      (gitStatusManager as unknown as GitStatusManagerWithPrivates).cache['test-session'] = {
        status: oldStatus,
        lastChecked: Date.now() - 10000, // Expired
      };

      vi.spyOn(gitStatusManager as unknown as GitStatusManagerWithPrivates, 'fetchGitStatus').mockResolvedValue(newStatus);
      
      const status = await gitStatusManager.getGitStatus('test-session');

      expect(status).toEqual(newStatus);
    });
  });
});