import React, { createContext, useContext, ReactNode } from 'react';
import { Session } from '../types/session';

interface SessionContextValue {
  sessionId: string;
  workingDirectory: string;
  projectId: string;
  session: Session;
  gitBranchActions?: Array<{
    id: string;
    label: string;
    icon: any;
    onClick: () => void;
    disabled: boolean;
    variant: 'default' | 'success' | 'danger';
    description: string;
  }>;
  isMerging?: boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider: React.FC<{
  children: ReactNode;
  session: Session | null;
  gitBranchActions?: Array<{
    id: string;
    label: string;
    icon: any;
    onClick: () => void;
    disabled: boolean;
    variant: 'default' | 'success' | 'danger';
    description: string;
  }>;
  isMerging?: boolean;
}> = ({ children, session, gitBranchActions, isMerging }) => {
  // FIX: Don't render children without a valid session
  // This prevents components that require session from rendering
  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No session selected
      </div>
    );
  }

  const value: SessionContextValue = {
    sessionId: session.id,
    workingDirectory: session.worktreePath,
    projectId: session.projectId?.toString() || '',
    session,
    gitBranchActions,
    isMerging
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

// Safe hook that doesn't throw
export const useSession = (): SessionContextValue | null => {
  return useContext(SessionContext) || null;
};

// Hook for components that absolutely require a session
export const useRequiredSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useRequiredSession must be used within a SessionProvider with a valid session');
  }
  return context;
};