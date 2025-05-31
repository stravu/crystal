import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { Session, SessionUpdate, SessionOutput } from '../types/session.js';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    super();
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  createSession(name: string, worktreePath: string, prompt: string): Session {
    const session: Session = {
      id: randomUUID(),
      name,
      worktreePath,
      prompt,
      status: 'initializing',
      createdAt: new Date(),
      output: []
    };

    this.sessions.set(session.id, session);
    this.emit('session-created', session);
    
    return session;
  }

  updateSession(id: string, update: SessionUpdate): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    Object.assign(session, update);
    this.emit('session-updated', session);
  }

  addSessionOutput(id: string, output: Omit<SessionOutput, 'sessionId'>): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    session.output.push(output.data);
    session.lastActivity = new Date();
    
    const fullOutput: SessionOutput = {
      sessionId: id,
      ...output
    };
    
    this.emit('session-output', fullOutput);
  }

  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    this.sessions.delete(id);
    this.emit('session-deleted', session);
  }

  stopSession(id: string): void {
    this.updateSession(id, { status: 'stopped' });
  }
}