import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { Session, SessionUpdate, SessionOutput } from '../types/session.js';
import type { DatabaseService } from '../database/database.js';
import type { Session as DbSession, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker } from '../database/models.js';

export class SessionManager extends EventEmitter {
  private activeSessions: Map<string, Session> = new Map();

  constructor(private db: DatabaseService) {
    super();
  }

  async initializeFromDatabase(): Promise<void> {
    // Mark any previously running sessions as stopped
    const activeSessions = await this.db.getActiveSessions();
    const activeIds = activeSessions.map(s => s.id);
    if (activeIds.length > 0) {
      await this.db.markSessionsAsStopped(activeIds);
    }
    
    // Load all sessions from database
    const dbSessions = await this.db.getAllSessions();
    this.emit('sessions-loaded', dbSessions.map(this.convertDbSessionToSession.bind(this)));
  }

  private convertDbSessionToSession(dbSession: DbSession): Session {
    return {
      id: dbSession.id,
      name: dbSession.name,
      worktreePath: dbSession.worktree_path,
      prompt: dbSession.initial_prompt,
      status: this.mapDbStatusToSessionStatus(dbSession.status),
      pid: dbSession.pid,
      createdAt: new Date(dbSession.created_at),
      lastActivity: new Date(dbSession.updated_at),
      output: [], // Will be loaded separately by frontend when needed
      jsonMessages: [], // Will be loaded separately by frontend when needed
      error: dbSession.exit_code && dbSession.exit_code !== 0 ? `Exit code: ${dbSession.exit_code}` : undefined
    };
  }

  private mapDbStatusToSessionStatus(dbStatus: string): Session['status'] {
    switch (dbStatus) {
      case 'pending': return 'initializing';
      case 'running': return 'running';
      case 'stopped': return 'stopped';
      case 'completed': return 'stopped';
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
      case 'error': return 'failed';
      default: return 'stopped';
    }
  }

  async getAllSessions(): Promise<Session[]> {
    const dbSessions = await this.db.getAllSessions();
    return dbSessions.map(this.convertDbSessionToSession.bind(this));
  }

  async getSession(id: string): Promise<Session | undefined> {
    const dbSession = await this.db.getSession(id);
    return dbSession ? this.convertDbSessionToSession(dbSession) : undefined;
  }

  async createSession(name: string, worktreePath: string, prompt: string, worktreeName: string): Promise<Session> {
    const sessionData: CreateSessionData = {
      id: randomUUID(),
      name,
      initial_prompt: prompt,
      worktree_name: worktreeName,
      worktree_path: worktreePath
    };

    const dbSession = await this.db.createSession(sessionData);
    const session = this.convertDbSessionToSession(dbSession);
    
    this.activeSessions.set(session.id, session);
    this.emit('session-created', session);
    
    return session;
  }

  async updateSession(id: string, update: SessionUpdate): Promise<void> {
    const dbUpdate: UpdateSessionData = {};
    
    if (update.status !== undefined) {
      dbUpdate.status = this.mapSessionStatusToDbStatus(update.status);
    }
    
    const updatedDbSession = await this.db.updateSession(id, dbUpdate);
    if (!updatedDbSession) {
      throw new Error(`Session ${id} not found`);
    }

    const session = this.convertDbSessionToSession(updatedDbSession);
    Object.assign(session, update); // Apply any additional updates not stored in DB
    
    this.activeSessions.set(id, session);
    this.emit('session-updated', session);
  }

  async addSessionOutput(id: string, output: Omit<SessionOutput, 'sessionId'>): Promise<void> {
    // Store in database (stringify JSON objects)
    const dataToStore = output.type === 'json' ? JSON.stringify(output.data) : output.data;
    const outputId = await this.db.addSessionOutput(id, output.type, dataToStore);
    
    // Check if this is a user input prompt to track it
    if (output.type === 'stdout' && dataToStore.includes('> ')) {
      // Extract the prompt text after "> "
      const promptMatch = dataToStore.match(/> (.+)/);
      if (promptMatch) {
        const promptText = promptMatch[1].trim();
        // Get current output count to use as index
        const outputs = await this.db.getSessionOutputs(id);
        await this.db.addPromptMarker(id, promptText, outputs.length - 1);
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

  async getSessionOutputs(id: string, limit?: number): Promise<SessionOutput[]> {
    const dbOutputs = await this.db.getSessionOutputs(id, limit);
    return dbOutputs.map(dbOutput => ({
      sessionId: dbOutput.session_id,
      type: dbOutput.type as 'stdout' | 'stderr' | 'json',
      data: dbOutput.type === 'json' ? JSON.parse(dbOutput.data) : dbOutput.data,
      timestamp: new Date(dbOutput.timestamp)
    }));
  }

  async archiveSession(id: string): Promise<void> {
    const success = await this.db.archiveSession(id);
    if (!success) {
      throw new Error(`Session ${id} not found`);
    }

    this.activeSessions.delete(id);
    this.emit('session-deleted', { id }); // Keep the same event name for frontend compatibility
  }

  async stopSession(id: string): Promise<void> {
    await this.updateSession(id, { status: 'stopped' });
  }

  async setSessionPid(id: string, pid: number): Promise<void> {
    await this.db.updateSession(id, { pid });
    const session = this.activeSessions.get(id);
    if (session) {
      session.pid = pid;
    }
  }

  async setSessionExitCode(id: string, exitCode: number): Promise<void> {
    await this.db.updateSession(id, { exit_code: exitCode });
  }

  async addConversationMessage(id: string, messageType: 'user' | 'assistant', content: string): Promise<void> {
    await this.db.addConversationMessage(id, messageType, content);
  }

  async getConversationMessages(id: string): Promise<ConversationMessage[]> {
    return await this.db.getConversationMessages(id);
  }

  async continueConversation(id: string, userMessage: string): Promise<void> {
    // Store the user's message
    await this.addConversationMessage(id, 'user', userMessage);
    
    // Emit event for the Claude Code manager to handle
    this.emit('conversation-continue', { sessionId: id, message: userMessage });
  }

  async clearConversation(id: string): Promise<void> {
    await this.db.clearConversationMessages(id);
    await this.db.clearSessionOutputs(id);
  }

  async getPromptHistory(): Promise<Array<{
    id: string;
    prompt: string;
    sessionName: string;
    sessionId: string;
    createdAt: string;
    status: string;
  }>> {
    const sessions = await this.db.getAllSessionsIncludingArchived();
    
    return sessions.map(session => ({
      id: session.id,
      prompt: session.initial_prompt,
      sessionName: session.name,
      sessionId: session.id,
      createdAt: session.created_at,
      status: session.status
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPromptMarkers(sessionId: string): Promise<PromptMarker[]> {
    return await this.db.getPromptMarkers(sessionId);
  }
}