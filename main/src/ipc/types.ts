import type { App, BrowserWindow } from 'electron';
import type { TaskQueue } from '../services/taskQueue';
import type { SessionManager } from '../services/sessionManager';
import type { ConfigManager } from '../services/configManager';
import type { WorktreeManager } from '../services/worktreeManager';
import type { WorktreeNameGenerator } from '../services/worktreeNameGenerator';
import type { GitDiffManager } from '../services/gitDiffManager';
import type { GitStatusManager } from '../services/gitStatusManager';
import type { ExecutionTracker } from '../services/executionTracker';
import type { DatabaseService } from '../database/database';
import type { RunCommandManager } from '../services/runCommandManager';
import type { VersionChecker } from '../services/versionChecker';
import type { StravuAuthManager } from '../services/stravuAuthManager';
import type { StravuNotebookService } from '../services/stravuNotebookService';
import type { ClaudeCodeManager } from '../services/panels/claude/claudeCodeManager';
import type { CliManagerFactory } from '../services/cliManagerFactory';
import type { AbstractCliManager } from '../services/panels/cli/AbstractCliManager';
import type { Logger } from '../utils/logger';
import type { ArchiveProgressManager } from '../services/archiveProgressManager';
import type { PersonaLoader } from '../services/personaLoader';

export interface AppServices {
  app: App;
  configManager: ConfigManager;
  databaseService: DatabaseService;
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  cliManagerFactory: CliManagerFactory;
  claudeCodeManager: AbstractCliManager; // Now uses abstract base class
  gitDiffManager: GitDiffManager;
  gitStatusManager: GitStatusManager;
  executionTracker: ExecutionTracker;
  worktreeNameGenerator: WorktreeNameGenerator;
  runCommandManager: RunCommandManager;
  versionChecker: VersionChecker;
  stravuAuthManager: StravuAuthManager;
  stravuNotebookService: StravuNotebookService;
  personaLoader: PersonaLoader;
  taskQueue: TaskQueue | null;
  getMainWindow: () => BrowserWindow | null;
  logger?: Logger;
  archiveProgressManager?: ArchiveProgressManager;
} 