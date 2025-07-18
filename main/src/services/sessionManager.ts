import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec, execSync } from 'child_process';
import { ShellDetector } from '../utils/shellDetector';
import type { Session, SessionUpdate, SessionOutput } from '../types/session';
import type { DatabaseService } from '../database/database';
import type { Session as DbSession, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData, Project } from '../database/models';
import { getShellPath } from '../utils/shellPath';
import { TerminalSessionManager } from './terminalSessionManager';
import { formatForDisplay } from '../utils/timestampUtils';
import * as os from 'os';

export class SessionManager extends EventEmitter {
  private activeSessions: Map<string, Session> = new Map();
  private runningScriptProcess: ChildProcess | null = null;
  private currentRunningSessionId: string | null = null;
  private activeProject: Project | null = null;
  private terminalSessionManager: TerminalSessionManager;

  constructor(private db: DatabaseService) {
    super();
    // Increase max listeners to prevent warnings when many components listen to events
    this.setMaxListeners(50);
    this.terminalSessionManager = new TerminalSessionManager();
    
    // Forward terminal output events
    this.terminalSessionManager.on('terminal-output', ({ sessionId, data, type }) => {
      this.addScriptOutput(sessionId, data, type);
    });
    
    // Forward zombie process detection events
    this.terminalSessionManager.on('zombie-processes-detected', (data) => {
      this.emit('zombie-processes-detected', data);
    });
  }

  setActiveProject(project: Project): void {
    this.activeProject = project;
    this.emit('active-project-changed', project);
  }

  getActiveProject(): Project | null {
    if (!this.activeProject) {
      this.activeProject = this.db.getActiveProject() || null;
      if (this.activeProject) {
        console.log(`[SessionManager] Active project loaded from DB:`, {
          id: this.activeProject.id,
          name: this.activeProject.name,
          build_script: this.activeProject.build_script,
          run_script: this.activeProject.run_script
        });
      }
    }
    return this.activeProject;
  }

  getDbSession(id: string): DbSession | undefined {
    return this.db.getSession(id);
  }
  
  getClaudeSessionId(id: string): string | undefined {
    const dbSession = this.db.getSession(id);
    const claudeSessionId = dbSession?.claude_session_id;
    console.log(`[SessionManager] Getting Claude session ID for Crystal session ${id}: ${claudeSessionId || 'not found'}`);
    return claudeSessionId;
  }

  getProjectById(id: number): Project | undefined {
    return this.db.getProject(id);
  }

  getProjectForSession(sessionId: string): Project | undefined {
    const dbSession = this.getDbSession(sessionId);
    if (dbSession?.project_id) {
      return this.getProjectById(dbSession.project_id);
    }
    return undefined;
  }

  initializeFromDatabase(): void {
    // Mark any previously running sessions as stopped
    const activeSessions = this.db.getActiveSessions();
    const activeIds = activeSessions.map(s => s.id);
    if (activeIds.length > 0) {
      this.db.markSessionsAsStopped(activeIds);
    }
    
    // Load all sessions from database
    const dbSessions = this.db.getAllSessions();
    this.emit('sessions-loaded', dbSessions.map(this.convertDbSessionToSession.bind(this)));
  }

  private convertDbSessionToSession(dbSession: DbSession): Session {
    return {
      id: dbSession.id,
      name: dbSession.name,
      worktreePath: dbSession.worktree_path,
      prompt: dbSession.initial_prompt,
      status: this.mapDbStatusToSessionStatus(dbSession.status, dbSession.last_viewed_at, dbSession.updated_at),
      pid: dbSession.pid,
      createdAt: new Date(dbSession.created_at),
      lastActivity: new Date(dbSession.updated_at),
      output: [], // Will be loaded separately by frontend when needed
      jsonMessages: [], // Will be loaded separately by frontend when needed
      error: dbSession.exit_code && dbSession.exit_code !== 0 ? `Exit code: ${dbSession.exit_code}` : undefined,
      isRunning: false,
      lastViewedAt: dbSession.last_viewed_at,
      permissionMode: dbSession.permission_mode,
      runStartedAt: dbSession.run_started_at,
      isMainRepo: dbSession.is_main_repo,
      projectId: dbSession.project_id, // Add the missing projectId field
      folderId: dbSession.folder_id,
      isFavorite: dbSession.is_favorite,
      autoCommit: dbSession.auto_commit,
      model: dbSession.model,
      archived: dbSession.archived || false
    };
  }

  private mapDbStatusToSessionStatus(dbStatus: string, lastViewedAt?: string, updatedAt?: string): Session['status'] {
    switch (dbStatus) {
      case 'pending': return 'initializing';
      case 'running': return 'running';
      case 'stopped': 
      case 'completed': {
        // If session is completed but hasn't been viewed since last update, show as unviewed
        if (!lastViewedAt || (updatedAt && new Date(lastViewedAt) < new Date(updatedAt))) {
          return 'completed_unviewed';
        }
        return 'stopped';
      }
      case 'failed': return 'error';
      default: return 'stopped';
    }
  }

  private mapSessionStatusToDbStatus(status: Session['status']): DbSession['status'] {
    switch (status) {
      case 'initializing': return 'pending';
      case 'ready': return 'running';
      case 'running': return 'running';
      case 'waiting': return 'running';
      case 'stopped': return 'stopped';
      case 'completed_unviewed': return 'stopped';
      case 'error': return 'failed';
      default: return 'stopped';
    }
  }

  getAllSessions(): Session[] {
    // Return all sessions regardless of active project
    const dbSessions = this.db.getAllSessions();
    return dbSessions.map(this.convertDbSessionToSession.bind(this));
  }

  getSessionsForProject(projectId: number): Session[] {
    const dbSessions = this.db.getAllSessions(projectId);
    return dbSessions.map(this.convertDbSessionToSession.bind(this));
  }

  getSession(id: string): Session | undefined {
    const dbSession = this.db.getSession(id);
    return dbSession ? this.convertDbSessionToSession(dbSession) : undefined;
  }

  createSession(name: string, worktreePath: string, prompt: string, worktreeName: string, permissionMode?: 'approve' | 'ignore', projectId?: number, isMainRepo?: boolean, autoCommit?: boolean, folderId?: string, model?: string): Session {
    return this.createSessionWithId(randomUUID(), name, worktreePath, prompt, worktreeName, permissionMode, projectId, isMainRepo, autoCommit, folderId, model);
  }

  createSessionWithId(id: string, name: string, worktreePath: string, prompt: string, worktreeName: string, permissionMode?: 'approve' | 'ignore', projectId?: number, isMainRepo?: boolean, autoCommit?: boolean, folderId?: string, model?: string): Session {
    console.log(`[SessionManager] Creating session with ID ${id}: ${name}`);
    
    let targetProject;
    
    if (projectId) {
      targetProject = this.getProjectById(projectId);
      if (!targetProject) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
    } else {
      // Fall back to active project for backward compatibility
      targetProject = this.getActiveProject();
      if (!targetProject) {
        throw new Error('No project specified and no active project selected');
      }
    }
    
    console.log(`[SessionManager] Target project:`, targetProject);

    const sessionData: CreateSessionData = {
      id,
      name,
      initial_prompt: prompt,
      worktree_name: worktreeName,
      worktree_path: worktreePath,
      project_id: targetProject.id,
      folder_id: folderId,
      permission_mode: permissionMode,
      is_main_repo: isMainRepo,
      auto_commit: autoCommit,
      model: model
    };
    console.log(`[SessionManager] Session data:`, sessionData);

    const dbSession = this.db.createSession(sessionData);
    console.log(`[SessionManager] Database session created:`, dbSession);
    
    const session = this.convertDbSessionToSession(dbSession);
    console.log(`[SessionManager] Converted session:`, session);
    
    this.activeSessions.set(session.id, session);
    // Don't emit the event here - let the caller decide when to emit it
    // this.emit('session-created', session);
    console.log(`[SessionManager] Session created (event not emitted yet)`);
    
    return session;
  }

  getOrCreateMainRepoSession(projectId: number): Session {
    console.log(`[SessionManager] Getting or creating main repo session for project ${projectId}`);
    
    // First check if a main repo session already exists
    const existingSession = this.db.getMainRepoSession(projectId);
    if (existingSession) {
      console.log(`[SessionManager] Found existing main repo session: ${existingSession.id}`);
      return this.convertDbSessionToSession(existingSession);
    }
    
    // Get the project
    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }
    
    console.log(`[SessionManager] Creating new main repo session for project: ${project.name}`);
    
    // Create a new main repo session
    const sessionId = randomUUID();
    const sessionName = `${project.name} (Main)`;
    const worktreePath = project.path; // Use the project path directly
    const worktreeName = 'main'; // Use 'main' as the worktree name
    const prompt = ''; // Empty prompt - user hasn't sent anything yet
    
    const session = this.createSessionWithId(
      sessionId,
      sessionName,
      worktreePath,
      prompt,
      worktreeName,
      project.default_permission_mode || 'ignore', // Default to 'ignore' if not set
      projectId,
      true, // isMainRepo = true
      true, // autoCommit = true (default for main repo sessions)
      undefined, // folderId
      'claude-sonnet-4-20250514' // default model for main repo sessions
    );
    
    console.log(`[SessionManager] Created main repo session: ${session.id}`);
    return session;
  }

  emitSessionCreated(session: Session): void {
    console.log(`[SessionManager] Emitting session-created event for session ${session.id}`);
    this.emit('session-created', session);
  }

  updateSession(id: string, update: SessionUpdate): void {
    console.log(`[SessionManager] updateSession called for ${id} with update:`, update);
    
    const dbUpdate: UpdateSessionData = {};
    
    if (update.status !== undefined) {
      dbUpdate.status = this.mapSessionStatusToDbStatus(update.status);
      console.log(`[SessionManager] Mapping status ${update.status} to DB status ${dbUpdate.status}`);
    }
    
    if (update.model !== undefined) {
      dbUpdate.model = update.model;
      console.log(`[SessionManager] Updating model to ${update.model}`);
    }
    
    const updatedDbSession = this.db.updateSession(id, dbUpdate);
    if (!updatedDbSession) {
      console.error(`[SessionManager] Session ${id} not found in database`);
      throw new Error(`Session ${id} not found`);
    }

    const session = this.convertDbSessionToSession(updatedDbSession);
    
    // Don't override the status if convertDbSessionToSession determined it should be completed_unviewed
    // This allows the blue dot indicator to work properly when a session completes
    if (update.status !== undefined && session.status === 'completed_unviewed') {
      console.log(`[SessionManager] Preserving completed_unviewed status for session ${id}`);
      delete update.status; // Remove status from update to preserve completed_unviewed
    }
    
    // Apply any additional updates not stored in DB
    Object.assign(session, update);
    
    this.activeSessions.set(id, session);
    console.log(`[SessionManager] Emitting session-updated event for session ${id} with status ${session.status}, full session:`, JSON.stringify(session));
    this.emit('session-updated', session);
  }

  addSessionOutput(id: string, output: Omit<SessionOutput, 'sessionId'>): void {
    // Check if this is the first output for this session
    const existingOutputs = this.db.getSessionOutputs(id, 1);
    const isFirstOutput = existingOutputs.length === 0;
    
    // Store in database (stringify JSON objects)
    const dataToStore = output.type === 'json' ? JSON.stringify(output.data) : output.data;
    this.db.addSessionOutput(id, output.type, dataToStore);
    
    // Emit the output so it shows immediately in the UI
    const outputToEmit: SessionOutput = {
      sessionId: id,
      ...output
    };
    this.emit('session-output', outputToEmit);
    
    // Emit output-available event to notify frontend that new output is available
    // This is used to trigger output panel refresh when new content is added (e.g., after git operations)
    console.log(`[SessionManager] Output added for session ${id}, emitting output-available event`);
    this.emit('session-output-available', { sessionId: id });
    
    // Check if this is the initial system message with Claude's session ID
    if (output.type === 'json' && output.data.type === 'system' && output.data.subtype === 'init' && output.data.session_id) {
      // Store Claude's actual session ID
      this.db.updateSession(id, { claude_session_id: output.data.session_id });
      console.log(`[SessionManager] Captured Claude session ID: ${output.data.session_id} for Crystal session ${id}`);
    }
    
    // Check if this is a system result message indicating Claude has completed
    if (output.type === 'json' && output.data.type === 'system' && output.data.subtype === 'result') {
      // Update the completion timestamp for the most recent prompt
      const completionTimestamp = output.timestamp instanceof Date ? output.timestamp.toISOString() : output.timestamp;
      this.db.updatePromptMarkerCompletion(id, completionTimestamp);
      console.log(`[SessionManager] Marked prompt as complete for session ${id} at ${completionTimestamp}`);
      
      // Mark the session as completed (this will trigger the completed_unviewed logic if not viewed)
      const dbSession = this.db.getSession(id);
      if (dbSession && dbSession.status === 'running') {
        console.log(`[SessionManager] Claude completed task, marking session ${id} as completed`);
        this.db.updateSession(id, { status: 'completed' });
        
        // Re-convert to get the proper status (completed_unviewed if not viewed)
        const updatedDbSession = this.db.getSession(id);
        if (updatedDbSession) {
          const session = this.convertDbSessionToSession(updatedDbSession);
          this.activeSessions.set(id, session);
          console.log(`[SessionManager] Session ${id} status after completion: ${session.status}`);
          this.emit('session-updated', session);
        }
      }
    }
    
    // Check if this is a user message in JSON format to track prompts
    if (output.type === 'json' && output.data.type === 'user' && output.data.message?.content) {
      // Extract text content from user messages
      const content = output.data.message.content;
      let promptText = '';
      
      if (Array.isArray(content)) {
        // Look for text content in the array
        const textContent = content.find((item: any) => item.type === 'text');
        if (textContent?.text) {
          promptText = textContent.text;
        }
      } else if (typeof content === 'string') {
        promptText = content;
      }
      
      if (promptText) {
        // Get current output count to use as index
        const outputs = this.db.getSessionOutputs(id);
        this.db.addPromptMarker(id, promptText, outputs.length - 1);
        // Also add to conversation messages for continuation support
        this.db.addConversationMessage(id, 'user', promptText);
      }
    }
    
    // Check if this is an assistant message to track for conversation history
    if (output.type === 'json' && output.data.type === 'assistant' && output.data.message?.content) {
      // Extract text content from assistant messages
      const content = output.data.message.content;
      let assistantText = '';
      
      if (Array.isArray(content)) {
        // Concatenate all text content from the array
        assistantText = content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('\n');
      } else if (typeof content === 'string') {
        assistantText = content;
      }
      
      if (assistantText) {
        // Add to conversation messages for continuation support
        this.db.addConversationMessage(id, 'assistant', assistantText);
      }
    }
    
    // Update in-memory session
    const session = this.activeSessions.get(id);
    if (session) {
      if (output.type === 'json') {
        session.jsonMessages.push(output.data);
      } else {
        session.output.push(output.data);
      }
      session.lastActivity = new Date();
    }
    
    const fullOutput: SessionOutput = {
      sessionId: id,
      ...output
    };
    
    this.emit('session-output', fullOutput);
  }

  getSessionOutput(id: string, limit?: number): SessionOutput[] {
    return this.getSessionOutputs(id, limit);
  }

  getSessionOutputs(id: string, limit?: number): SessionOutput[] {
    const dbOutputs = this.db.getSessionOutputs(id, limit);
    return dbOutputs.map(dbOutput => ({
      sessionId: dbOutput.session_id,
      type: dbOutput.type as 'stdout' | 'stderr' | 'json',
      data: dbOutput.type === 'json' ? JSON.parse(dbOutput.data) : dbOutput.data,
      timestamp: new Date(dbOutput.timestamp)
    }));
  }

  async archiveSession(id: string): Promise<void> {
    const success = this.db.archiveSession(id);
    if (!success) {
      throw new Error(`Session ${id} not found`);
    }

    // Close terminal session if it exists
    await this.terminalSessionManager.closeTerminalSession(id);
    
    this.activeSessions.delete(id);
    this.emit('session-deleted', { id }); // Keep the same event name for frontend compatibility
  }

  stopSession(id: string): void {
    this.updateSession(id, { status: 'stopped' });
  }

  setSessionPid(id: string, pid: number): void {
    this.db.updateSession(id, { pid });
    const session = this.activeSessions.get(id);
    if (session) {
      session.pid = pid;
    }
  }

  setSessionExitCode(id: string, exitCode: number): void {
    this.db.updateSession(id, { exit_code: exitCode });
  }

  addConversationMessage(id: string, messageType: 'user' | 'assistant', content: string): void {
    this.db.addConversationMessage(id, messageType, content);
  }

  getConversationMessages(id: string): ConversationMessage[] {
    return this.db.getConversationMessages(id);
  }

  continueConversation(id: string, userMessage: string): void {
    // Store the user's message
    this.addConversationMessage(id, 'user', userMessage);
    
    // Add the continuation prompt to output so it's visible
    const timestamp = formatForDisplay(new Date());
    const userPromptDisplay = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
                             `\x1b[1m\x1b[92m${userMessage}\x1b[0m\r\n\r\n`;
    this.addSessionOutput(id, {
      type: 'stdout',
      data: userPromptDisplay,
      timestamp: new Date()
    });
    console.log('[SessionManager] Added continuation prompt to session output');
    
    // Add a prompt marker for this continued conversation
    // Get current output count to use as index
    const outputs = this.db.getSessionOutputs(id);
    this.db.addPromptMarker(id, userMessage, outputs.length);
    console.log('[SessionManager] Added prompt marker for continued conversation');
    
    // Emit event for the Claude Code manager to handle
    this.emit('conversation-continue', { sessionId: id, message: userMessage });
  }

  clearConversation(id: string): void {
    this.db.clearConversationMessages(id);
    this.db.clearSessionOutputs(id);
  }

  markSessionAsViewed(id: string): void {
    const updatedDbSession = this.db.markSessionAsViewed(id);
    if (updatedDbSession) {
      const session = this.convertDbSessionToSession(updatedDbSession);
      this.activeSessions.set(id, session);
      this.emit('session-updated', session);
    }
  }

  getPromptHistory(): Array<{
    id: string;
    prompt: string;
    sessionName: string;
    sessionId: string;
    createdAt: string;
    status: string;
  }> {
    const sessions = this.db.getAllSessionsIncludingArchived();
    
    return sessions.map(session => ({
      id: session.id,
      prompt: session.initial_prompt,
      sessionName: session.name,
      sessionId: session.id,
      createdAt: session.created_at,
      status: session.status
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getPromptById(promptId: string): PromptMarker | null {
    // For prompt history, the promptId is the sessionId
    // We need to get the initial prompt marker for that session
    const markers = this.db.getPromptMarkers(promptId);
    
    // The initial prompt is always the first marker (output_index 0)
    const initialMarker = markers.find(m => m.output_index === 0);
    
    return initialMarker || null;
  }

  getPromptMarkers(sessionId: string): PromptMarker[] {
    return this.db.getPromptMarkers(sessionId);
  }

  getSessionPrompts(sessionId: string): PromptMarker[] {
    return this.getPromptMarkers(sessionId);
  }

  addInitialPromptMarker(sessionId: string, prompt: string): void {
    console.log('[SessionManager] Adding initial prompt marker for session:', sessionId);
    console.log('[SessionManager] Prompt text:', prompt);
    
    try {
      // Add the initial prompt as the first prompt marker (index 0)
      this.db.addPromptMarker(sessionId, prompt, 0, 0);
      console.log('[SessionManager] Initial prompt marker added successfully');
    } catch (error) {
      console.error('[SessionManager] Failed to add initial prompt marker:', error);
      throw error;
    }
  }

  // Execution diff operations
  createExecutionDiff(data: CreateExecutionDiffData): ExecutionDiff {
    return this.db.createExecutionDiff(data);
  }

  getExecutionDiffs(sessionId: string): ExecutionDiff[] {
    return this.db.getExecutionDiffs(sessionId);
  }

  getExecutionDiff(id: number): ExecutionDiff | undefined {
    return this.db.getExecutionDiff(id);
  }

  getNextExecutionSequence(sessionId: string): number {
    return this.db.getNextExecutionSequence(sessionId);
  }

  getProjectRunScript(sessionId: string): string[] | null {
    const dbSession = this.getDbSession(sessionId);
    if (dbSession?.project_id) {
      const project = this.getProjectById(dbSession.project_id);
      if (project?.run_script) {
        // Split by newlines to get array of commands
        return project.run_script.split('\n').filter(cmd => cmd.trim());
      }
    }
    return null;
  }

  getProjectBuildScript(sessionId: string): string[] | null {
    const dbSession = this.getDbSession(sessionId);
    if (dbSession?.project_id) {
      const project = this.getProjectById(dbSession.project_id);
      if (project?.build_script) {
        // Split by newlines to get array of commands
        return project.build_script.split('\n').filter(cmd => cmd.trim());
      }
    }
    return null;
  }

  async runScript(sessionId: string, commands: string[], workingDirectory: string): Promise<void> {
    // Stop any currently running script and wait for it to fully terminate
    await this.stopRunningScript();
    
    // Mark session as running
    this.setSessionRunning(sessionId, true);
    this.currentRunningSessionId = sessionId;
    
    // Join commands with && to run them sequentially
    const command = commands.join(' && ');
    
    // Get enhanced shell PATH
    const shellPath = getShellPath();
    
    // Get the user's default shell and command arguments
    const { shell, args } = ShellDetector.getShellCommandArgs(command);
    
    // Spawn the process with its own process group for easier termination
    this.runningScriptProcess = spawn(shell, args, {
      cwd: workingDirectory,
      stdio: 'pipe',
      detached: true, // Create a new process group
      env: {
        ...process.env,
        PATH: shellPath
      }
    });

    // Handle output
    this.runningScriptProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('script-output', { sessionId, type: 'stdout', data: output });
    });

    this.runningScriptProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('script-output', { sessionId, type: 'stderr', data: output });
    });

    // Handle process exit
    this.runningScriptProcess.on('exit', (code) => {
      this.emit('script-output', { 
        sessionId, 
        type: 'stdout', 
        data: `\nProcess exited with code: ${code}\n` 
      });
      
      this.setSessionRunning(sessionId, false);
      this.currentRunningSessionId = null;
      this.runningScriptProcess = null;
    });

    this.runningScriptProcess.on('error', (error) => {
      this.emit('script-output', { 
        sessionId, 
        type: 'stderr', 
        data: `Error: ${error.message}\n` 
      });
      
      this.setSessionRunning(sessionId, false);
      this.currentRunningSessionId = null;
      this.runningScriptProcess = null;
    });
  }

  async runBuildScript(sessionId: string, commands: string[], workingDirectory: string): Promise<{ success: boolean; output: string }> {
    // Get enhanced shell PATH
    const shellPath = getShellPath();
    
    // Add build start message to script output (terminal tab)
    const timestamp = new Date().toLocaleTimeString();
    const buildStartMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔨 BUILD SCRIPT RUNNING \x1b[0m\r\n`;
    this.emit('script-output', { sessionId, type: 'stdout', data: buildStartMessage });
    
    // Show PATH information for debugging in terminal
    this.emit('script-output', { 
      sessionId, 
      type: 'stdout', 
      data: `\x1b[1m\x1b[33mUsing PATH:\x1b[0m ${shellPath.split(':').slice(0, 5).join(':')}\x1b[2m...\x1b[0m\n` 
    });
    
    // Check if yarn is available
    try {
      const { stdout: yarnPath } = await this.execWithShellPath('which yarn', { cwd: workingDirectory });
      if (yarnPath.trim()) {
        this.emit('script-output', { 
          sessionId, 
          type: 'stdout', 
          data: `\x1b[1m\x1b[32myarn found at:\x1b[0m ${yarnPath.trim()}\n` 
        });
      }
    } catch {
      this.emit('script-output', { 
        sessionId, 
        type: 'stdout', 
        data: `\x1b[1m\x1b[31myarn not found in PATH\x1b[0m\n` 
      });
    }
    
    let allOutput = '';
    let overallSuccess = true;
    
    // Run commands sequentially
    for (const command of commands) {
      if (command.trim()) {
        console.log(`[SessionManager] Executing build command: ${command}`);
        
        // Add command to script output (terminal tab)
        this.emit('script-output', { 
          sessionId, 
          type: 'stdout', 
          data: `\x1b[1m\x1b[34m$ ${command}\x1b[0m\n` 
        });
        
        try {
          const { stdout, stderr } = await this.execWithShellPath(command, { cwd: workingDirectory });
          
          if (stdout) {
            allOutput += stdout;
            this.emit('script-output', { sessionId, type: 'stdout', data: stdout });
          }
          if (stderr) {
            allOutput += stderr;
            this.emit('script-output', { sessionId, type: 'stderr', data: stderr });
          }
        } catch (cmdError: any) {
          console.error(`[SessionManager] Build command failed: ${command}`, cmdError);
          const errorMessage = cmdError.stderr || cmdError.stdout || cmdError.message || String(cmdError);
          allOutput += errorMessage;
          
          this.emit('script-output', { 
            sessionId, 
            type: 'stderr', 
            data: `\x1b[1m\x1b[31mCommand failed:\x1b[0m ${command}\n${errorMessage}\n` 
          });
          
          overallSuccess = false;
          // Continue with next command instead of stopping entirely
        }
      }
    }
    
    // Add completion message to script output (terminal tab)
    const buildEndTimestamp = new Date().toLocaleTimeString();
    const buildEndMessage = overallSuccess
      ? `\r\n\x1b[36m[${buildEndTimestamp}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m ✅ BUILD COMPLETED \x1b[0m\r\n\r\n`
      : `\r\n\x1b[36m[${buildEndTimestamp}]\x1b[0m \x1b[1m\x1b[41m\x1b[37m ❌ BUILD FAILED \x1b[0m\r\n\r\n`;
    
    this.emit('script-output', { sessionId, type: 'stdout', data: buildEndMessage });
    
    return { success: overallSuccess, output: allOutput };
  }
  
  private async execWithShellPath(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const shellPath = getShellPath();
    return execAsync(command, {
      ...options,
      env: {
        ...process.env,
        PATH: shellPath
      }
    });
  }

  addScriptOutput(sessionId: string, data: string, type: 'stdout' | 'stderr' = 'stdout'): void {
    // Emit script output event that will be handled by the frontend
    this.emit('script-output', { 
      sessionId, 
      type, 
      data 
    });
  }

  /**
   * Recursively gets all descendant PIDs of a parent process.
   * This handles deeply nested process trees where processes spawn children
   * that spawn their own children, etc.
   * 
   * @param parentPid The parent process ID
   * @returns Array of all descendant PIDs
   */
  private getAllDescendantPids(parentPid: number): number[] {
    const descendants: number[] = [];
    const platform = os.platform();
    
    try {
      if (platform === 'win32') {
        // On Windows, use wmic to get process tree
        const output = execSync(`wmic process where (ParentProcessId=${parentPid}) get ProcessId`, { encoding: 'utf8' });
        const lines = output.split('\n').filter(line => line.trim());
        for (let i = 1; i < lines.length; i++) { // Skip header
          const pid = parseInt(lines[i].trim());
          if (!isNaN(pid)) {
            descendants.push(pid);
            // Recursively get children of this process
            descendants.push(...this.getAllDescendantPids(pid));
          }
        }
      } else {
        // On Unix-like systems, use ps to get children
        const output = execSync(`ps -o pid= --ppid ${parentPid}`, { encoding: 'utf8' });
        const pids = output.split('\n')
          .map(line => parseInt(line.trim()))
          .filter(pid => !isNaN(pid));
        
        for (const pid of pids) {
          descendants.push(pid);
          // Recursively get children of this process
          descendants.push(...this.getAllDescendantPids(pid));
        }
      }
    } catch (error) {
      // Command might fail if no children exist, which is fine
      console.log(`No child processes found for PID ${parentPid}`);
    }
    
    return descendants;
  }

  /**
   * Stops the currently running script and ensures all child processes are terminated.
   * This method uses multiple approaches to ensure complete cleanup:
   * 1. Gets all descendant PIDs recursively before killing
   * 2. Uses platform-specific commands (taskkill on Windows, kill on Unix)
   * 3. Kills the process group (Unix) or process tree (Windows)
   * 4. Kills individual descendant processes as a fallback
   * 5. Uses graceful SIGTERM first, then forceful SIGKILL
   * @returns Promise that resolves when the script has been stopped
   */
  stopRunningScript(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.runningScriptProcess || !this.currentRunningSessionId) {
        resolve();
        return;
      }

      const sessionId = this.currentRunningSessionId;
      const process = this.runningScriptProcess;
      
      // Immediately clear references to prevent new output
      this.currentRunningSessionId = null;
      this.runningScriptProcess = null;
      
      // Kill the entire process group to ensure all child processes are terminated
      try {
        if (process.pid) {
          console.log(`Terminating script process ${process.pid} and its children...`);
          
          // First, get all descendant PIDs before we start killing
          const descendantPids = this.getAllDescendantPids(process.pid);
          console.log(`Found ${descendantPids.length} descendant processes: ${descendantPids.join(', ')}`);
          
          // Emit detailed termination info to terminal
          this.emit('script-output', { 
            sessionId, 
            type: 'stdout', 
            data: `\n[Terminating process ${process.pid}]\n` 
          });
          
          if (descendantPids.length > 0) {
            this.emit('script-output', { 
              sessionId, 
              type: 'stdout', 
              data: `[Found ${descendantPids.length} child process${descendantPids.length > 1 ? 'es' : ''}: ${descendantPids.join(', ')}]\n` 
            });
          }
          
          const platform = os.platform();
          
          if (platform === 'win32') {
            // On Windows, use taskkill to terminate the process tree
            this.emit('script-output', { 
              sessionId, 
              type: 'stdout', 
              data: `[Using taskkill to terminate process tree ${process.pid}]\n` 
            });
            
            exec(`taskkill /F /T /PID ${process.pid}`, (error) => {
              if (error) {
                console.warn(`Error killing Windows process tree: ${error.message}`);
                this.emit('script-output', { 
                  sessionId, 
                  type: 'stderr', 
                  data: `[Error terminating process tree: ${error.message}]\n` 
                });
                
                // Fallback: kill individual processes
                try {
                  process.kill('SIGKILL');
                } catch (killError) {
                  console.warn('Fallback kill failed:', killError);
                }
                
                // Kill descendants individually
                let killedCount = 0;
                let processedCount = 0;
                
                if (descendantPids.length === 0) {
                  // No descendants, we're done
                  this.finishStopScript(sessionId);
                  resolve();
                  return;
                }
                
                descendantPids.forEach(pid => {
                  exec(`taskkill /F /PID ${pid}`, (err) => {
                    if (!err) killedCount++;
                    processedCount++;
                    
                    // Report after all attempts
                    if (processedCount === descendantPids.length) {
                      this.emit('script-output', { 
                        sessionId, 
                        type: 'stdout', 
                        data: `[Terminated ${killedCount} processes using fallback method]\n` 
                      });
                      this.finishStopScript(sessionId);
                      resolve();
                    }
                  });
                });
              } else {
                console.log(`Successfully killed Windows process tree ${process.pid}`);
                this.emit('script-output', { 
                  sessionId, 
                  type: 'stdout', 
                  data: `[Successfully terminated process tree]\n` 
                });
                this.finishStopScript(sessionId);
                resolve();
              }
            });
          } else {
            // On Unix-like systems (macOS, Linux)
            // First, try SIGTERM for graceful shutdown
            this.emit('script-output', { 
              sessionId, 
              type: 'stdout', 
              data: `[Sending SIGTERM to process ${process.pid} and its group]\n` 
            });
            
            try {
              process.kill('SIGTERM');
            } catch (error) {
              console.warn('SIGTERM failed:', error);
            }
            
            // Kill the entire process group using negative PID
            exec(`kill -TERM -${process.pid}`, (error) => {
              if (error) {
                console.warn(`Error sending SIGTERM to process group: ${error.message}`);
              }
            });
            
            // Give processes a chance to clean up gracefully
            this.emit('script-output', { 
              sessionId, 
              type: 'stdout', 
              data: '[Waiting 10 seconds for graceful shutdown...]\n' 
            });
            
            // Use a shorter timeout for faster cleanup
            setTimeout(() => {
              this.emit('script-output', { 
                sessionId, 
                type: 'stdout', 
                data: '\n[Grace period expired, using forceful termination]\n' 
              });
              
              // Now forcefully kill the main process
              try {
                process.kill('SIGKILL');
                this.emit('script-output', { 
                  sessionId, 
                  type: 'stdout', 
                  data: `[Sent SIGKILL to process ${process.pid}]\n` 
                });
              } catch (error) {
                // Process might already be dead
                this.emit('script-output', { 
                  sessionId, 
                  type: 'stdout', 
                  data: `[Process ${process.pid} already terminated]\n` 
                });
              }
              
              // Kill the process group with SIGKILL
              exec(`kill -9 -${process.pid}`, (error) => {
                if (error) {
                  console.warn(`Error sending SIGKILL to process group: ${error.message}`);
                  this.emit('script-output', { 
                    sessionId, 
                    type: 'stderr', 
                    data: `[Warning: Could not kill process group: ${error.message}]\n` 
                  });
                } else {
                  this.emit('script-output', { 
                    sessionId, 
                    type: 'stdout', 
                    data: `[Sent SIGKILL to process group ${process.pid}]\n` 
                  });
                }
              });
              
              // Kill all known descendants individually to be sure
              let killedCount = 0;
              let alreadyDeadCount = 0;
              
              descendantPids.forEach(pid => {
                exec(`kill -9 ${pid}`, (error) => {
                  if (error) {
                    console.log(`Process ${pid} already terminated`);
                    alreadyDeadCount++;
                  } else {
                    console.log(`Killed descendant process ${pid}`);
                    killedCount++;
                  }
                  
                  // Report results after processing all descendants
                  if (killedCount + alreadyDeadCount === descendantPids.length) {
                    if (killedCount > 0) {
                      this.emit('script-output', { 
                        sessionId, 
                        type: 'stdout', 
                        data: `[Forcefully terminated ${killedCount} child process${killedCount > 1 ? 'es' : ''}]\n` 
                      });
                    }
                    if (alreadyDeadCount > 0) {
                      this.emit('script-output', { 
                        sessionId, 
                        type: 'stdout', 
                        data: `[${alreadyDeadCount} process${alreadyDeadCount > 1 ? 'es' : ''} had already terminated gracefully]\n` 
                      });
                    }
                  }
                });
              });
              
              // Final cleanup attempt using pkill
              exec(`pkill -9 -P ${process.pid}`, () => {
                // Ignore errors - processes might already be dead
              });
              
              // Check for zombie processes after a short delay
              setTimeout(() => {
                if (process.pid) {
                  const remainingPids = this.getAllDescendantPids(process.pid);
                  if (remainingPids.length > 0) {
                    this.emit('script-output', { 
                      sessionId, 
                      type: 'stderr', 
                      data: `\n[WARNING: ${remainingPids.length} zombie process${remainingPids.length > 1 ? 'es' : ''} could not be terminated: ${remainingPids.join(', ')}]\n` 
                    });
                    this.emit('script-output', { 
                      sessionId, 
                      type: 'stderr', 
                      data: `[Please manually kill these processes using: kill -9 ${remainingPids.join(' ')}]\n` 
                    });
                  } else {
                    this.emit('script-output', { 
                      sessionId, 
                      type: 'stdout', 
                      data: '\n[All processes terminated successfully]\n' 
                    });
                  }
                }
                this.finishStopScript(sessionId);
                resolve();
              }, 500);
            }, 2000); // Reduced from 10 seconds to 2 seconds for faster cleanup
          }
        } else {
          // No process PID
          this.finishStopScript(sessionId);
          resolve();
        }
      } catch (error) {
        console.warn('Error killing script process:', error);
        this.finishStopScript(sessionId);
        resolve();
      }
    });
  }

  private finishStopScript(sessionId: string): void {
    // Update session state
    this.setSessionRunning(sessionId, false);
    
    // Emit a final message to indicate the script was stopped
    this.emit('script-output', { 
      sessionId, 
      type: 'stdout', 
      data: '\n[Script stopped by user]\n' 
    });
  }

  private setSessionRunning(sessionId: string, isRunning: boolean): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isRunning = isRunning;
      this.emit('session-updated', session);
    }
  }

  getCurrentRunningSessionId(): string | null {
    return this.currentRunningSessionId;
  }

  async cleanup(): Promise<void> {
    this.stopRunningScript();
    await this.terminalSessionManager.cleanup();
  }

  async runTerminalCommand(sessionId: string, command: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      // Check if session exists in database and is archived
      const dbSession = this.db.getSession(sessionId);
      if (!dbSession) {
        throw new Error('Session not found');
      }
      if (dbSession.archived) {
        throw new Error('Cannot access terminal for archived session');
      }
      throw new Error('Session not found');
    }

    // Don't allow running commands while a script is active
    if (this.currentRunningSessionId === sessionId && this.runningScriptProcess) {
      throw new Error('Cannot run terminal commands while a script is running');
    }

    const worktreePath = session.worktreePath;

    try {
      // Create terminal session if it doesn't exist
      if (!this.terminalSessionManager.hasSession(sessionId)) {
        await this.terminalSessionManager.createTerminalSession(sessionId, worktreePath);
        // Give the terminal a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send the command to the persistent terminal session
      this.terminalSessionManager.sendCommand(sessionId, command);
    } catch (error) {
      // Don't write error to terminal for archived sessions
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('archived session')) {
        this.addScriptOutput(sessionId, `\nError: ${error}\n`, 'stderr');
      }
      throw error;
    }
  }

  async sendTerminalInput(sessionId: string, data: string): Promise<void> {
    let session = this.activeSessions.get(sessionId);
    let worktreePath: string;
    
    if (!session) {
      // Try to get session from database for terminal-only sessions
      const dbSession = this.db.getSession(sessionId);
      if (!dbSession || !dbSession.worktree_path) {
        throw new Error('Session not found');
      }
      
      // Check if session is archived
      if (dbSession.archived) {
        throw new Error('Cannot access terminal for archived session');
      }
      
      worktreePath = dbSession.worktree_path;
    } else {
      worktreePath = session.worktreePath;
    }

    try {
      // Create terminal session if it doesn't exist
      if (!this.terminalSessionManager.hasSession(sessionId)) {
        await this.terminalSessionManager.createTerminalSession(sessionId, worktreePath);
        // Give the terminal a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send the raw input to the persistent terminal session
      this.terminalSessionManager.sendInput(sessionId, data);
    } catch (error) {
      // Don't write error to terminal for archived sessions
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('archived session')) {
        this.addScriptOutput(sessionId, `\nError: ${error}\n`, 'stderr');
      }
      throw error;
    }
  }

  async closeTerminalSession(sessionId: string): Promise<void> {
    await this.terminalSessionManager.closeTerminalSession(sessionId);
  }

  hasTerminalSession(sessionId: string): boolean {
    return this.terminalSessionManager.hasSession(sessionId);
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    this.terminalSessionManager.resizeTerminal(sessionId, cols, rows);
  }

  async preCreateTerminalSession(sessionId: string): Promise<void> {
    let session = this.activeSessions.get(sessionId);
    let worktreePath: string;
    
    if (!session) {
      // Try to get session from database for terminal-only sessions
      const dbSession = this.db.getSession(sessionId);
      if (!dbSession || !dbSession.worktree_path) {
        throw new Error('Session not found');
      }
      
      // Check if session is archived
      if (dbSession.archived) {
        throw new Error('Cannot create terminal for archived session');
      }
      
      worktreePath = dbSession.worktree_path;
    } else {
      worktreePath = session.worktreePath;
    }

    try {
      // Create terminal session if it doesn't exist
      if (!this.terminalSessionManager.hasSession(sessionId)) {
        console.log(`[SessionManager] Pre-creating terminal session for ${sessionId}`);
        await this.terminalSessionManager.createTerminalSession(sessionId, worktreePath);
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to pre-create terminal session: ${error}`);
      // Don't throw - this is a best-effort optimization
    }
  }
}