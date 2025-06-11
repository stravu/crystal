import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec } from 'child_process';
import type { Session, SessionUpdate, SessionOutput } from '../types/session';
import type { DatabaseService } from '../database/database';
import type { Session as DbSession, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData, Project } from '../database/models';
import { getShellPath } from '../utils/shellPath';

export class SessionManager extends EventEmitter {
  private activeSessions: Map<string, Session> = new Map();
  private runningScriptProcess: ChildProcess | null = null;
  private currentRunningSessionId: string | null = null;
  private activeProject: Project | null = null;

  constructor(private db: DatabaseService) {
    super();
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
      runStartedAt: dbSession.run_started_at
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
    const activeProject = this.getActiveProject();
    const dbSessions = this.db.getAllSessions(activeProject?.id);
    return dbSessions.map(this.convertDbSessionToSession.bind(this));
  }

  getSession(id: string): Session | undefined {
    const dbSession = this.db.getSession(id);
    return dbSession ? this.convertDbSessionToSession(dbSession) : undefined;
  }

  createSession(name: string, worktreePath: string, prompt: string, worktreeName: string, permissionMode?: 'approve' | 'ignore'): Session {
    return this.createSessionWithId(randomUUID(), name, worktreePath, prompt, worktreeName, permissionMode);
  }

  createSessionWithId(id: string, name: string, worktreePath: string, prompt: string, worktreeName: string, permissionMode?: 'approve' | 'ignore'): Session {
    console.log(`[SessionManager] Creating session with ID ${id}: ${name}`);
    
    const activeProject = this.getActiveProject();
    console.log(`[SessionManager] Active project:`, activeProject);
    
    if (!activeProject) {
      throw new Error('No active project selected');
    }

    const sessionData: CreateSessionData = {
      id,
      name,
      initial_prompt: prompt,
      worktree_name: worktreeName,
      worktree_path: worktreePath,
      project_id: activeProject.id,
      permission_mode: permissionMode
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

  emitSessionCreated(session: Session): void {
    console.log(`[SessionManager] Emitting session-created event for session ${session.id}`);
    this.emit('session-created', session);
  }

  updateSession(id: string, update: SessionUpdate): void {
    const dbUpdate: UpdateSessionData = {};
    
    if (update.status !== undefined) {
      dbUpdate.status = this.mapSessionStatusToDbStatus(update.status);
    }
    
    const updatedDbSession = this.db.updateSession(id, dbUpdate);
    if (!updatedDbSession) {
      throw new Error(`Session ${id} not found`);
    }

    const session = this.convertDbSessionToSession(updatedDbSession);
    Object.assign(session, update); // Apply any additional updates not stored in DB
    
    this.activeSessions.set(id, session);
    this.emit('session-updated', session);
  }

  addSessionOutput(id: string, output: Omit<SessionOutput, 'sessionId'>): void {
    // Store in database (stringify JSON objects)
    const dataToStore = output.type === 'json' ? JSON.stringify(output.data) : output.data;
    this.db.addSessionOutput(id, output.type, dataToStore);
    
    // Emit the output so it shows immediately in the UI
    const outputToEmit: SessionOutput = {
      sessionId: id,
      ...output
    };
    this.emit('session-output', outputToEmit);
    
    // Check if this is the initial system message with Claude's session ID
    if (output.type === 'json' && output.data.type === 'system' && output.data.subtype === 'init' && output.data.session_id) {
      // Store Claude's actual session ID
      this.db.updateSession(id, { claude_session_id: output.data.session_id });
      console.log(`[SessionManager] Captured Claude session ID: ${output.data.session_id} for Crystal session ${id}`);
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

  archiveSession(id: string): void {
    const success = this.db.archiveSession(id);
    if (!success) {
      throw new Error(`Session ${id} not found`);
    }

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
    const timestamp = new Date().toLocaleTimeString();
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

  runScript(sessionId: string, commands: string[], workingDirectory: string): void {
    // Stop any currently running script
    this.stopRunningScript();
    
    // Mark session as running
    this.setSessionRunning(sessionId, true);
    this.currentRunningSessionId = sessionId;
    
    // Join commands with && to run them sequentially
    const command = commands.join(' && ');
    
    // Get enhanced shell PATH
    const shellPath = getShellPath();
    
    // Spawn the process with its own process group for easier termination
    this.runningScriptProcess = spawn('sh', ['-c', command], {
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

  addScriptOutput(sessionId: string, data: string): void {
    // Emit script output event that will be handled by the frontend
    this.emit('script-output', { 
      sessionId, 
      type: 'stdout', 
      data 
    });
  }

  stopRunningScript(): void {
    if (this.runningScriptProcess && this.currentRunningSessionId) {
      const sessionId = this.currentRunningSessionId;
      const process = this.runningScriptProcess;
      
      // Immediately clear references to prevent new output
      this.currentRunningSessionId = null;
      this.runningScriptProcess = null;
      
      // Kill the entire process group to ensure all child processes are terminated
      try {
        if (process.pid) {
          console.log(`Terminating script process ${process.pid} and its children...`);
          
          // Since we used detached: true, we need to kill the process group
          // Use negative PID to kill the entire process group
          try {
            process.kill('SIGKILL');
            // Kill the process group using the system kill command
            exec(`kill -9 -${process.pid}`, (error) => {
              if (error) {
                console.warn(`Error killing process group: ${error.message}`);
              } else {
                console.log(`Successfully killed process group ${process.pid}`);
              }
            });
          } catch (error) {
            console.warn('Process already terminated:', error);
          }
          
          // Also kill any remaining child processes
          exec(`pkill -P ${process.pid}`, () => {
            // Ignore errors - child processes might not exist
          });
        }
      } catch (error) {
        console.warn('Error killing script process:', error);
      }
      
      // Update session state
      this.setSessionRunning(sessionId, false);
      
      // Emit a final message to indicate the script was stopped
      this.emit('script-output', { 
        sessionId, 
        type: 'stdout', 
        data: '\n[Script stopped by user]\n' 
      });
    }
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

  cleanup(): void {
    this.stopRunningScript();
  }
}