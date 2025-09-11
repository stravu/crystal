# Claude Code Panel Migration Plan

## Executive Summary

This document outlines the migration strategy for transitioning Claude Code from the existing tab-based system to the new Tool Panel infrastructure. The migration prioritizes code reuse, maintains backward compatibility during transition, and includes a comprehensive database migration strategy for existing sessions.

**Key User Experience Change**: The prompt input bar will move from the session level (always visible) to be integrated within each Claude panel. Each Claude panel will have its own independent prompt bar, conversation history, and Claude process. Multiple Claude panels can run simultaneously within a single session, each with completely independent state.

## Migration Goals

1. **Maximum Code Reuse**: Move existing Claude Code components with minimal rewriting
2. **Zero Data Loss**: Preserve all existing session data, outputs, and conversation history
3. **Multiple Independent Claude Instances**: Enable multiple Claude panels per session with independent state
4. **Panel-Integrated Prompt Input**: Move prompt bar from session level into each Claude panel
5. **Clean Architecture**: Organize Claude Code as a self-contained panel module
6. **Incremental Migration**: Allow gradual transition without breaking existing functionality

## Current State Analysis

### Existing Claude Code Structure

#### Backend Components
- `main/src/services/claudeCodeManager.ts` - Core PTY process management for Claude
- `main/src/services/sessionManager.ts` - Session lifecycle management
- `main/src/ipc/session.ts` - IPC handlers for session operations
- `main/src/events.ts` - Event handling for Claude outputs

#### Frontend Components
- `frontend/src/components/session/RichOutputWithSidebar.tsx` - Main Claude output display with prompt/commit sidebar
- `frontend/src/components/session/RichOutputView.tsx` - Rich formatted Claude output renderer
- `frontend/src/components/session/MessagesView.tsx` - Raw JSON message viewer for debugging
- `frontend/src/components/session/SessionInputWithImages.tsx` - Modern prompt input with image support
- `frontend/src/hooks/useSessionView.ts` - Session view logic (includes claude handling)
- `frontend/src/components/PromptNavigation.tsx` - Prompt history navigation sidebar
- `frontend/src/components/CommitsPanel.tsx` - Git commits sidebar panel

#### Data Structure
- Sessions table includes Claude-specific fields
- Session outputs stored in `session_outputs` table
- Conversation messages in `conversation_messages` table
- Prompt markers for navigation

### ViewMode System
Current ViewModes: `'richOutput' | 'changes' | 'terminal' | 'logs' | 'editor' | 'messages'`
- `richOutput` - Main Claude output view (formatted)
- `messages` - Raw JSON message inspection view

## Migration Strategy

### Phase 1: Infrastructure Extension (Week 1)

#### 1.1 Extend Panel Types
```typescript
// shared/types/panels.ts
export type ToolPanelType = 'terminal' | 'claude'; // Add claude type

export interface ClaudePanelState {
  isInitialized?: boolean;
  claudeSessionId?: string;      // Links to existing claude_session_id
  conversationId?: string;        // For conversation continuations
  modelVersion?: string;          // claude-3-opus, etc.
  status?: 'idle' | 'running' | 'waiting' | 'error';
  lastPrompt?: string;
  outputMode?: 'rich' | 'messages';  // Toggle between formatted/raw view
  scrollPosition?: number;        // Preserve scroll state
  expandedSections?: string[];    // For collapsible outputs
  selectedPromptIndex?: number;    // For prompt navigation
}

// Update PANEL_CAPABILITIES
claude: {
  canEmit: [
    'claude:started',
    'claude:completed', 
    'claude:error',
    'claude:file_modified',
    'claude:tool_used',
    'claude:waiting_for_input'
  ],
  canConsume: ['files:changed'], // React to external file changes
  requiresProcess: true,
  singleton: false  // Multiple independent Claude panels allowed per session
}
```

#### 1.2 Database Migration
```sql
-- Migration 004_migrate_claude_to_panels.sql

-- Step 1: Add panel references to existing sessions
ALTER TABLE sessions ADD COLUMN claude_panel_id TEXT;

-- Step 2: Create Claude panels for existing active sessions
INSERT INTO tool_panels (id, session_id, type, title, state, metadata, created_at, updated_at)
SELECT 
  lower(hex(randomblob(16))), -- Generate UUID
  id as session_id,
  'claude' as type,
  'Claude' as title,
  json_object(
    'isActive', true,
    'hasBeenViewed', true,
    'customState', json_object(
      'isInitialized', CASE WHEN status IN ('running', 'waiting') THEN true ELSE false END,
      'claudeSessionId', claude_session_id,
      'status', status,
      'outputMode', 'rich'
    )
  ) as state,
  json_object(
    'createdAt', created_at,
    'lastActiveAt', updated_at,
    'position', 0
  ) as metadata,
  created_at,
  updated_at
FROM sessions 
WHERE status != 'archived';

-- Step 3: Update sessions to reference their Claude panels
UPDATE sessions 
SET claude_panel_id = (
  SELECT id FROM tool_panels 
  WHERE tool_panels.session_id = sessions.id 
  AND tool_panels.type = 'claude'
);

-- Step 4: Set active panel for sessions currently showing Claude
UPDATE sessions
SET active_panel_id = claude_panel_id
WHERE active_panel_id IS NULL;
```

### Phase 2: Session Creation Flow (Week 1)

#### 2.1 Update Session Creation Flow

The session creation flow changes to support multiple independent Claude panels:

```typescript
// main/src/ipc/session.ts - Update session creation handler

ipcMain.handle('sessions:create', async (_, sessionData) => {
  // 1. Create session as before with worktree setup
  const session = await sessionManager.createSession({
    name: sessionData.name,
    initial_prompt: sessionData.prompt,  // Initial prompt (optional)
    worktree_name: sessionData.worktreeName,
    // ... other fields
  });

  // 2. Optionally create first Claude panel if prompt provided
  if (sessionData.prompt) {
    const claudePanel = await panelManager.createPanel({
      sessionId: session.id,
      type: 'claude',
      title: 'Claude 1',  // Numbered for multiple panels
      state: {
        isActive: true,
        hasBeenViewed: false,
        customState: {
          isInitialized: false,
          lastPrompt: sessionData.prompt,
          outputMode: 'rich',
          status: 'idle',
          conversationHistory: [],  // Independent conversation per panel
          claudeProcessId: null     // Will spawn unique process
        }
      }
    });

    // 3. Set as active panel (default behavior)
    await sessionManager.setActivePanel(session.id, claudePanel.id);

    // 4. Start Claude process for THIS panel specifically
    const processId = await claudeCodeManager.spawnClaudeCodeForPanel(
      claudePanel.id,  // Use panel ID, not session ID
      session.worktree_path,
      sessionData.prompt,
      [],  // Empty conversation history for new panel
      false
    );
    
    // 5. Update panel with process ID
    await panelManager.updatePanelState(claudePanel.id, {
      claudeProcessId: processId
    });
  }

  return session;
});
```

#### 2.2 Frontend Session Creation Dialog

```typescript
// frontend/src/components/CreateSessionDialog.tsx
// Minor changes - dialog now:
// - Session name/template
// - Claude prompt (now OPTIONAL - can create session without Claude)
// - Worktree configuration
// - Model selection (if Claude prompt provided)

// Behind the scenes:
// - Old: Creates session → Opens richOutput tab with prompt bar at bottom
// - New: Creates session → Creates Claude panel (if prompt) → Opens Claude panel with integrated prompt bar
```

#### 2.3 Default Panel Behavior

```typescript
// shared/types/panels.ts
export const DEFAULT_PANELS_PER_SESSION = {
  claude: {
    autoCreate: false,     // Create on demand (when user provides prompt)
    singleton: false,      // Multiple Claude panels allowed per session
    defaultActive: true    // Set as active panel on creation
  },
  terminal: {
    autoCreate: false,     // Create on demand
    singleton: false,      // Multiple terminals allowed
    defaultActive: false
  }
};
```

### Phase 3: Claude Panel Manager (Week 1)

#### 3.1 Create ClaudePanelManager Service
```typescript
// main/src/services/claudePanelManager.ts

import { ClaudeCodeManager } from './claudeCodeManager';
import { SessionManager } from './sessionManager';
import { Database } from '../database';
import { PanelEventBus } from './panelEventBus';
import { ToolPanel, ClaudePanelState } from '../../shared/types/panels';

export class ClaudePanelManager {
  // Map panel IDs to their independent Claude processes
  private claudeProcesses = new Map<string, any>();
  
  constructor(
    private claudeCodeManager: ClaudeCodeManager,
    private sessionManager: SessionManager,
    private db: Database,
    private eventBus: PanelEventBus
  ) {
    this.setupEventListeners();
  }

  async initializePanel(panel: ToolPanel): Promise<void> {
    const state = panel.state.customState as ClaudePanelState;
    
    // Each panel gets its own Claude process
    if (state?.claudeProcessId && this.claudeProcesses.has(panel.id)) {
      // Reconnect to existing panel process
      return this.reconnectToProcess(panel);
    }

    // Get session details for Claude initialization
    const session = this.sessionManager.getDbSession(panel.sessionId);
    if (!session) throw new Error('Session not found');

    // Always create a new, independent Claude process for this panel
    await this.createNewClaudeProcessForPanel(panel, session);
  }

  private async createNewClaudeProcessForPanel(panel: ToolPanel, session: any): Promise<void> {
    // Spawn a completely independent Claude process for this panel
    const processId = `claude_${panel.id}_${Date.now()}`;
    
    // Each panel has its own conversation history
    const panelConversationHistory = panel.state.customState?.conversationHistory || [];
    
    // Create new Claude instance with panel-specific ID
    const process = await this.claudeCodeManager.spawnClaudeCodeWithId(
      processId,
      session.worktree_path,
      panel.state.customState?.lastPrompt || '',
      panelConversationHistory,
      false
    );

    // Store process mapped to panel ID
    this.claudeProcesses.set(panel.id, process);
    
    // Update panel state with process ID
    await this.db.updatePanelState(panel.id, {
      claudeProcessId: processId,
      isInitialized: true
    });
  }

  async sendInput(panelId: string, input: string): Promise<void> {
    const panel = this.db.getPanel(panelId);
    if (!panel) throw new Error('Panel not found');

    // Get the specific Claude process for this panel
    const process = this.claudeProcesses.get(panelId);
    if (!process) throw new Error('Claude process not found for panel');

    // Send input to this panel's specific Claude instance
    await this.claudeCodeManager.sendInputToProcess(process, input);
    
    // Update panel's conversation history
    await this.db.updatePanelState(panelId, {
      conversationHistory: [...(panel.state.customState?.conversationHistory || []), 
        { role: 'user', content: input }]
    });
    
    // Emit panel event
    this.eventBus.emit({
      type: 'claude:waiting_for_input',
      source: { panelId, panelType: 'claude', sessionId: panel.sessionId },
      data: { input },
      timestamp: new Date().toISOString()
    });
  }

  // Create additional Claude panel for session
  async createAdditionalClaudePanel(sessionId: string): Promise<ToolPanel> {
    const session = this.sessionManager.getDbSession(sessionId);
    if (!session) throw new Error('Session not found');

    // Count existing Claude panels to generate unique title
    const existingPanels = this.db.getPanelsForSession(sessionId);
    const claudePanelCount = existingPanels.filter(p => p.type === 'claude').length;
    
    // Create new independent Claude panel
    const panel = await this.db.createPanel({
      sessionId,
      type: 'claude',
      title: `Claude ${claudePanelCount + 1}`,
      state: {
        isActive: true,
        hasBeenViewed: false,
        customState: {
          isInitialized: false,
          outputMode: 'rich',
          status: 'idle',
          conversationHistory: [],  // Fresh conversation
          claudeProcessId: null     // Will get new process
        }
      }
    });

    return panel;
  }

  private setupEventListeners(): void {
    // Listen to existing Claude events and convert to panel events
    this.claudeCodeManager.on('output', (sessionId, output) => {
      const panel = this.getPanelForSession(sessionId);
      if (panel) {
        this.eventBus.emit({
          type: 'claude:output',
          source: { 
            panelId: panel.id, 
            panelType: 'claude', 
            sessionId 
          },
          data: { output },
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle file modification detection
    this.claudeCodeManager.on('file_modified', (sessionId, files) => {
      const panel = this.getPanelForSession(sessionId);
      if (panel) {
        this.eventBus.emit({
          type: 'claude:file_modified',
          source: { 
            panelId: panel.id, 
            panelType: 'claude', 
            sessionId 
          },
          data: { files },
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private getPanelForSession(sessionId: string): ToolPanel | null {
    const panels = this.db.getPanelsForSession(sessionId);
    return panels.find(p => p.type === 'claude') || null;
  }
}
```

### Phase 3: Frontend Components (Week 2)

#### 3.1 Claude Panel Component Structure
```
frontend/src/components/panels/claude/
├── ClaudePanel.tsx              # Main panel component
├── ClaudePanelInput.tsx         # Adapt from SessionInputWithImages
├── ClaudePanelOutput.tsx        # Output display wrapper
├── RichOutputWithSidebar.tsx    # Move existing component here
├── RichOutputDisplay.tsx        # Move from session/RichOutputView
├── MessagesDisplay.tsx          # Move from session/MessagesView
├── ClaudePanelToolbar.tsx       # Toggle output modes, settings
└── index.ts                     # Export aggregation
```

#### 3.2 ClaudePanel Component (With Integrated Prompt Bar)
```typescript
// frontend/src/components/panels/claude/ClaudePanel.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SessionInputWithImages } from '../../session/SessionInputWithImages'; // Migrate to panel
import { RichOutputWithSidebar } from './RichOutputWithSidebar'; // Reuse existing output
import { ClaudePanelToolbar } from './ClaudePanelToolbar';
import { useRequiredSession } from '../../../contexts/SessionContext';
import { ClaudePanelState } from '../../../../shared/types/panels';

export const ClaudePanel: React.FC<{ panel: ToolPanel; isActive: boolean }> = ({ 
  panel, 
  isActive 
}) => {
  const { sessionId } = useRequiredSession();
  const [outputMode, setOutputMode] = useState<'rich' | 'messages'>('rich');
  const [outputs, setOutputs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Panel-specific state for this Claude instance
  const [panelStatus, setPanelStatus] = useState(panel.state.customState?.status || 'idle');
  const [conversationHistory, setConversationHistory] = useState(
    panel.state.customState?.conversationHistory || []
  );
  
  // Load panel-specific outputs when panel becomes active
  useEffect(() => {
    if (!isActive) return;
    
    const loadOutputs = async () => {
      setIsLoading(true);
      try {
        // Load outputs for THIS specific panel
        const panelOutputs = await window.electron.invoke(
          'panels:claude:get-output', 
          panel.id  // Panel ID, not session ID
        );
        setOutputs(panelOutputs);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadOutputs();
  }, [isActive, panel.id]);

  // Listen for real-time outputs for THIS panel
  useEffect(() => {
    if (!isActive) return;
    
    const handleOutput = (event: any, data: any) => {
      if (data.panelId === panel.id) {  // Panel-specific output
        setOutputs(prev => [...prev, data.output]);
        
        // Update conversation history for this panel
        if (data.output.type === 'assistant') {
          setConversationHistory(prev => [...prev, 
            { role: 'assistant', content: data.output.content }
          ]);
        }
      }
    };
    
    const handleStatusChange = (event: any, data: any) => {
      if (data.panelId === panel.id) {
        setPanelStatus(data.status);
      }
    };
    
    window.electron.on('panel:claude:output', handleOutput);
    window.electron.on('panel:claude:status', handleStatusChange);
    
    return () => {
      window.electron.off('panel:claude:output', handleOutput);
      window.electron.off('panel:claude:status', handleStatusChange);
    };
  }, [isActive, panel.id]);

  const handleSendInput = useCallback(async (inputText: string) => {
    // Send to this panel's specific Claude instance
    await window.electron.invoke('panels:claude:input', panel.id, inputText);
    
    // Update local conversation history
    setConversationHistory(prev => [...prev, { role: 'user', content: inputText }]);
    setInput(''); // Clear input after sending
  }, [panel.id]);

  const handleContinueConversation = useCallback(async () => {
    // Continue with this panel's specific conversation history
    await window.electron.invoke('panels:claude:continue', panel.id, conversationHistory);
  }, [panel.id, conversationHistory]);

  if (!isActive) {
    return null; // Don't render when not active (saves memory)
  }

  return (
    <div className="claude-panel flex flex-col h-full">
      {/* Toolbar for output mode toggle */}
      <ClaudePanelToolbar 
        outputMode={outputMode}
        setOutputMode={setOutputMode}
        panelStatus={panelStatus}
      />
      
      {/* Main output area */}
      <div className="flex-1 overflow-hidden">
        <RichOutputWithSidebar 
          panelId={panel.id}  // Panel-specific outputs
          sessionId={sessionId}
          sessionStatus={panelStatus}
          model={panel.state.customState?.modelVersion}
          outputs={outputs}
          outputMode={outputMode}
        />
      </div>
      
      {/* INTEGRATED PROMPT BAR - Only visible when this panel is active */}
      <div className="border-t border-gray-700">
        <SessionInputWithImages 
          panelId={panel.id}  // Panel-specific input
          activeSession={/* get session object */}
          viewMode="richOutput"
          input={input}
          setInput={setInput}
          textareaRef={textareaRef}
          handleSendInput={handleSendInput}
          handleContinueConversation={handleContinueConversation}
          isWaiting={panelStatus === 'waiting'}
          conversationHistory={conversationHistory}  // Panel-specific history
          // ... other required props adapted for panel use
        />
      </div>
    </div>
  );
};
```

### Phase 4: Integration Layer (Week 2)

#### 4.1 IPC Handler Updates
```typescript
// main/src/ipc/panels.ts - Add Claude-specific handlers

export function registerClaudePanelHandlers(claudePanelManager: ClaudePanelManager) {
  // Claude panel specific operations
  ipcMain.handle('panels:claude:input', async (_, panelId, input) => {
    return claudePanelManager.sendInput(panelId, input);
  });
  
  ipcMain.handle('panels:claude:continue', async (_, panelId) => {
    return claudePanelManager.continueConversation(panelId);
  });
  
  ipcMain.handle('panels:claude:stop', async (_, panelId) => {
    return claudePanelManager.stopClaude(panelId);
  });
  
  // Migration helper
  ipcMain.handle('panels:claude:migrate', async (_, sessionId) => {
    return claudePanelManager.migrateSessionToPanel(sessionId);
  });
}
```

#### 4.2 Backward Compatibility Layer
```typescript
// main/src/compatibility/claudeCompatibility.ts

export class ClaudeCompatibilityLayer {
  constructor(
    private claudePanelManager: ClaudePanelManager,
    private panelManager: PanelManager
  ) {}

  // Redirect old IPC calls to new panel system
  setupCompatibilityHandlers(): void {
    // Intercept old session input calls
    ipcMain.handle('sessions:send-input', async (_, sessionId, input) => {
      // Find or create Claude panel for session
      const panel = await this.ensureClaudePanelExists(sessionId);
      
      // Redirect to panel system
      return this.claudePanelManager.sendInput(panel.id, input);
    });

    // Continue conversation
    ipcMain.handle('sessions:continue', async (_, sessionId) => {
      const panel = await this.ensureClaudePanelExists(sessionId);
      return this.claudePanelManager.continueConversation(panel.id);
    });
  }

  private async ensureClaudePanelExists(sessionId: string): Promise<ToolPanel> {
    const panels = this.panelManager.getPanelsForSession(sessionId);
    let claudePanel = panels.find(p => p.type === 'claude');
    
    if (!claudePanel) {
      // Auto-migrate on first use
      claudePanel = await this.claudePanelManager.migrateSessionToPanel(sessionId);
    }
    
    return claudePanel;
  }
}
```

### Phase 5: UI Migration (Week 3)

#### 5.1 Update SessionView (Remove Session-Level Prompt Bar)
```typescript
// frontend/src/components/SessionView.tsx

// MAJOR CHANGE: Remove SessionInputWithImages from SessionView
// The prompt bar is no longer at the session level
// It now lives inside each Claude panel

const SessionView: React.FC = () => {
  // ... existing state ...
  
  // Remove input-related state (moved to Claude panels)
  // const [input, setInput] = useState('');
  // const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  return (
    <div className="flex flex-col h-full">
      {/* Main content area with tabs */}
      <div className="flex-1 overflow-hidden">
        {/* View tabs for non-Claude content */}
        <ViewTabs 
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          tabs={['changes', 'terminal', 'logs', 'editor']}  // No richOutput/messages
        />
        
        {/* View content */}
        {renderViewContent()}
      </div>
      
      {/* Tool Panel Bar - Always visible */}
      <ToolPanelBar 
        panels={sessionPanels}
        activePanel={activePanel}
        onPanelSelect={handlePanelSelect}
        onPanelCreate={handlePanelCreate}
      />
      
      {/* Tool Panel Content */}
      {activePanel && (
        <div className="flex-1">
          {renderActivePanel()}
        </div>
      )}
      
      {/* NO MORE PROMPT BAR HERE - Moved to Claude panels */}
    </div>
  );
};

// Handle creating Claude panels with "Add Claude" button
const handleCreateClaudePanel = async () => {
  const newPanel = await window.electron.invoke(
    'panels:claude:create',
    sessionId
  );
  
  // Set as active to show the prompt bar
  setActivePanel(newPanel);
};

// Add helpful message when no Claude panels exist
const renderNoClaudeMessage = () => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400">
    <p>No Claude panels active</p>
    <button 
      onClick={handleCreateClaudePanel}
      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
    >
      Add Claude Panel
    </button>
  </div>
);
```

#### 5.2 Migration UI Flow
```typescript
// frontend/src/components/MigrationPrompt.tsx

export const MigrationPrompt: React.FC = () => {
  return (
    <div className="migration-prompt bg-blue-900/20 border border-blue-700 rounded p-3 mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InfoIcon className="w-4 h-4 text-blue-400" />
          <span className="text-sm">
            Claude has moved to the new panel system for better flexibility
          </span>
        </div>
        <button 
          onClick={migrateNow}
          className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
        >
          Open Claude Panel
        </button>
      </div>
    </div>
  );
};
```

## Migration Timeline

### Week 1: Infrastructure & Backend
- [ ] Extend panel types to include 'claude'
- [ ] Create database migration script
- [ ] Update session creation to auto-create Claude panel
- [ ] Implement ClaudePanelManager service
- [ ] Set up IPC handlers for Claude panels
- [ ] Test migration with existing sessions
- [ ] Test new session creation with Claude panel

### Week 2: Frontend Components & Integration
- [ ] Move and refactor Claude UI components
- [ ] Create ClaudePanel component hierarchy
- [ ] Implement panel state management
- [ ] Add backward compatibility layer
- [ ] Test input/output flow

### Week 3: UI Migration & Polish
- [ ] Update SessionView to use panel system
- [ ] Remove old tab-based Claude views
- [ ] Add migration prompts for users
- [ ] Update keyboard shortcuts
- [ ] Comprehensive testing

### Week 4: Cleanup & Documentation
- [ ] Remove deprecated code paths
- [ ] Update user documentation
- [ ] Performance optimization
- [ ] Final testing and bug fixes

## Testing Strategy

### Unit Tests
- Panel creation and lifecycle
- State persistence and restoration
- Event emission and handling
- Database migration integrity

### Integration Tests
- Claude process management through panels
- Input/output flow
- Session continuation
- File modification detection
- Cross-panel communication

### User Acceptance Tests
- Existing sessions continue working
- New sessions use panel system
- Smooth migration experience
- No data loss
- Performance parity or improvement

## Rollback Plan

### Database Migration Reversibility

The migration strategy is **non-destructive** and reversible:

1. **Preservation of Original Data**: 
   - ALL existing tables remain untouched (`sessions`, `session_outputs`, `conversation_messages`, etc.)
   - Only ADDS new columns (`claude_panel_id`) to existing tables
   - Creates NEW `tool_panels` entries without modifying existing data

2. **Reversible Migration Script**:
```sql
-- Rollback migration (if needed)
-- Step 1: Remove panel references from sessions
ALTER TABLE sessions DROP COLUMN claude_panel_id;

-- Step 2: Delete Claude panels (keep terminal panels)
DELETE FROM tool_panels WHERE type = 'claude';

-- Original session data remains intact and functional
```

3. **Why This Approach**:
   - **Safety**: Original Claude session data is never deleted or modified
   - **Gradual Transition**: Both systems can coexist during migration
   - **Easy Rollback**: Simply remove the new columns and panel entries
   - **No Data Loss**: All session outputs, conversation history remain in original tables

4. **Dual-Mode Operation**:
   - During migration, the system can operate in "dual mode"
   - Old IPC handlers redirect to panel system via compatibility layer
   - If panel system fails, can fall back to direct session access

### Feature Flag Implementation

```typescript
// config.json
{
  "useClaudePanels": true,  // Toggle to enable/disable panel system
  "migrationMode": "dual"    // "legacy" | "dual" | "panels-only"
}

// Compatibility check
if (config.migrationMode === 'dual' || config.migrationMode === 'legacy') {
  // Keep old Claude tab system available
  registerLegacyClaudeHandlers();
}

if (config.migrationMode === 'dual' || config.migrationMode === 'panels-only') {
  // Enable new panel system
  registerClaudePanelHandlers();
}
```

### Rollback Triggers

Initiate rollback if:
1. Critical bugs in panel system affecting > 10% of users
2. Performance degradation > 20% 
3. Data corruption detected
4. User revolt (significant negative feedback)

### Rollback Procedure

1. **Immediate**: Set feature flag to `"migrationMode": "legacy"`
2. **Within 24h**: Deploy hotfix reverting to legacy system
3. **Within 48h**: Run rollback migration to clean up panel data
4. **Communication**: Notify users of temporary reversion

## Success Metrics

- Zero data loss during migration
- < 5% increase in memory usage
- No degradation in response times
- 100% of existing features maintained
- Positive user feedback on new flexibility

## Code Organization

### Final Structure
```
main/src/services/panels/
├── claude/
│   ├── ClaudePanelManager.ts
│   ├── ClaudeProcessManager.ts  # Extracted from claudeCodeManager
│   ├── ClaudeEventHandler.ts
│   └── types.ts
├── terminal/
│   └── TerminalPanelManager.ts  # Existing
└── base/
    ├── PanelManager.ts           # Existing
    └── PanelEventBus.ts          # Existing

frontend/src/components/panels/
├── claude/
│   ├── ClaudePanel.tsx
│   ├── ClaudePanelInput.tsx
│   ├── ClaudePanelOutput.tsx
│   └── ...
├── terminal/
│   └── TerminalPanel.tsx        # Existing
└── shared/
    ├── PanelTabBar.tsx          # Existing
    └── PanelContainer.tsx       # Existing
```

## Risk Mitigation

### Risk 1: Process Management Complexity
**Mitigation**: Reuse existing ClaudeCodeManager, wrap with panel interface

### Risk 2: State Synchronization Issues
**Mitigation**: Single source of truth in database, careful event handling

### Risk 3: User Confusion During Migration
**Mitigation**: Clear communication, gradual transition, helpful prompts

### Risk 4: Performance Degradation
**Mitigation**: Lazy loading, efficient state management, profiling

### Risk 5: Breaking Existing Workflows
**Mitigation**: Comprehensive backward compatibility layer

## Key Architectural Changes Summary

### Before Migration (Current State)
- **Single Claude instance per session**: One Claude process shared across the entire session
- **Session-level prompt bar**: Always visible at bottom of SessionView, regardless of active tab
- **Shared conversation history**: All prompts/responses in single conversation thread
- **Tab-based Claude views**: richOutput and messages tabs in main view area

### After Migration (New Panel System)
- **Multiple Claude instances per session**: Each panel spawns its own independent Claude process
- **Panel-integrated prompt bars**: Each Claude panel has its own prompt input, only visible when that panel is active
- **Independent conversation histories**: Each panel maintains its own separate conversation thread
- **Panel-based Claude views**: Multiple Claude panels can run simultaneously with different contexts

### User Experience Impact
1. **Creating Claude panels**: Users explicitly create Claude panels when needed (no longer automatic with session)
2. **Multiple contexts**: Users can run multiple Claude instances with different prompts/approaches simultaneously
3. **Prompt visibility**: Prompt bar only visible when a Claude panel is active (not always present)
4. **Panel switching**: Switching between Claude panels switches between independent conversations
5. **Resource usage**: Each Claude panel consumes its own resources (memory/CPU)

### Technical Benefits
- **True isolation**: Each Claude panel is completely independent with its own process and state
- **Parallel workflows**: Multiple Claude instances can work on different tasks simultaneously
- **Better organization**: Each panel can focus on a specific aspect of the problem
- **Cleaner architecture**: Prompt input logically grouped with its output display
- **Scalability**: System can handle N Claude instances limited only by system resources

## Conclusion

This migration plan provides a structured approach to transitioning Claude Code to the new panel system while:
- Maximizing code reuse (90% of existing code preserved)
- Ensuring zero data loss through non-destructive migrations
- Enabling multiple independent Claude instances per session
- Moving prompt input to be panel-specific rather than session-global
- Providing a smooth, reversible migration path
- Setting foundation for future extensibility

The modular approach allows for incremental implementation and testing, with the ability to rollback at any stage without data loss.
