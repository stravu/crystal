import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSessionStore } from '../stores/sessionStore';
import type { Session, SessionOutput } from '../types/session';

let socket: Socket | null = null;

export function useSocket() {
  const { setSessions, loadSessions, addSession, updateSession, deleteSession, addSessionOutput } = useSessionStore();
  
  useEffect(() => {
    if (!socket) {
      socket = io('http://localhost:3521');
      
      socket.on('connect', () => {
        console.log('Connected to server');
      });
      
      socket.on('sessions:initial', (sessions: Session[]) => {
        const sessionsWithJsonMessages = sessions.map(session => ({
          ...session,
          jsonMessages: session.jsonMessages || []
        }));
        loadSessions(sessionsWithJsonMessages); // Use loadSessions to mark as loaded
      });
      
      socket.on('sessions:loaded', (sessions: Session[]) => {
        const sessionsWithJsonMessages = sessions.map(session => ({
          ...session,
          jsonMessages: session.jsonMessages || []
        }));
        loadSessions(sessionsWithJsonMessages);
      });
      
      socket.on('session:created', (session: Session) => {
        addSession({...session, jsonMessages: session.jsonMessages || []});
      });
      
      socket.on('session:updated', (session: Session) => {
        updateSession({...session, jsonMessages: session.jsonMessages || []});
      });
      
      socket.on('session:deleted', (session: Session) => {
        deleteSession(session);
      });
      
      socket.on('session:output', (output: SessionOutput) => {
        console.log('Received session output:', output);
        addSessionOutput(output);
      });
      
      socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });
    }
    
    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [setSessions, loadSessions, addSession, updateSession, deleteSession, addSessionOutput]);
  
  return socket;
}