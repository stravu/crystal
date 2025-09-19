# Comprehensive Documentation: Wrapping OpenAI Codex CLI with Protocol-Based Communication

---
**Documentation Version**: 1.0.0  
**Date**: September 17, 2025  
**OpenAI Codex Repository**: [github.com/openai/codex](https://github.com/openai/codex)  
**Repository Revision**: Latest as of September 2025  
**Crystal Framework**: Internal implementation based on production codebase  

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Protocol Implementation](#protocol-implementation)
4. [Message Format Specification](#message-format-specification)
5. [Session Resume and Continuation](#session-resume-and-continuation)
6. [Approval Request Handling](#approval-request-handling)
7. [Codex Manager Implementation](#codex-manager-implementation)
8. [Frontend Panel Integration](#frontend-panel-integration)
9. [State Management](#state-management)
10. [Error Handling and Recovery](#error-handling-and-recovery)
11. [Testing Strategy](#testing-strategy)
12. [Best Practices](#best-practices)

## Overview

This document provides a comprehensive guide for wrapping the OpenAI Codex CLI tool using a protocol-based communication pattern within the Crystal application framework. The OpenAI Codex CLI is a Rust-based lightweight coding agent that runs in the terminal, designed to help developers with AI-assisted coding tasks.

### Key Features of Codex CLI
- **Language**: Written in [Rust](https://github.com/openai/codex) (97.4% of codebase)
- **Installation**: Available via npm (`@openai/codex`) or Homebrew ([Installation Guide](https://github.com/openai/codex#installation))
- **Authentication**: ChatGPT account or API key
- **Model Support**: GPT-5 (default, released August 7, 2025), GPT-4, and other OpenAI models
- **Platform Support**: macOS, Linux (x86_64, arm64)
- **Configuration**: `~/.codex/config.toml` ([Configuration Docs](https://github.com/openai/codex#configuration))
- **Special Features**: Zero data retention (ZDR), MCP support, CI mode

## Architecture Design

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Crystal Application                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐     ┌──────────────────────┐     │
│  │   Frontend (React)    │     │    Main Process      │     │
│  │                       │     │    (Electron)        │     │
│  │  ┌────────────────┐  │     │                      │     │
│  │  │  CodexPanel    │  │ IPC │  ┌────────────────┐  │     │
│  │  │  Component     │◄─┼─────┼─►│  CodexManager  │  │     │
│  │  └────────────────┘  │     │  └────────────────┘  │     │
│  │  ┌────────────────┐  │     │          │           │     │
│  │  │  Message       │  │     │          │           │     │
│  │  │  Transformer   │  │     │          ▼           │     │
│  │  └────────────────┘  │     │  ┌────────────────┐  │     │
│  │                       │     │  │  Protocol      │  │     │
│  │  ┌────────────────┐  │     │  │  Handler       │  │     │
│  │  │  State Store   │  │     │  └────────────────┘  │     │
│  │  └────────────────┘  │     │          │           │     │
│  └──────────────────────┘     │          ▼           │     │
│                                │  ┌────────────────┐  │     │
│                                │  │   node-pty     │  │     │
│                                │  │   Process      │  │     │
│                                │  └────────────────┘  │     │
│                                │          │           │     │
│                                └──────────┼───────────┘     │
│                                           │                  │
└───────────────────────────────────────────┼──────────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │  Codex CLI   │
                                    │  (Rust)      │
                                    └──────────────┘
```

### Component Responsibilities

1. **CodexManager**: Main orchestrator for Codex CLI processes
2. **Protocol Handler**: Manages JSON-RPC protocol communication
3. **Message Transformer**: Converts between Codex and Crystal message formats
4. **State Store**: Maintains session state and conversation history
5. **CodexPanel**: React component for user interface

## Protocol Implementation

### JSON-RPC Protocol Specification

The Codex CLI uses a JSON-RPC-like protocol for communication. Each message follows a specific format:

#### Request Format
```typescript
interface CodexRequest {
  id: string;           // Unique message identifier
  op: {
    type: string;       // Operation type
    items?: Array<{     // For user input
      type: string;
      text?: string;
      path?: string;    // For file references
    }>;
    // Additional operation-specific fields
  };
}
```

#### Response Format
```typescript
interface CodexResponse {
  id: string;           // Correlates with request ID
  msg?: {
    type: string;       // Response type
    // Response-specific fields
  };
  error?: {
    code: number;
    message: string;
  };
}
```

### Message Types

#### 1. Session Configuration
```json
// Request
{
  "id": "config-1",
  "op": {
    "type": "configure_session",
    "model": "gpt-5",
    "provider": "openai",
    "sandbox_mode": "workspace-write",
    "approval_policy": "on-request"
  }
}

// Response
{
  "id": "config-1",
  "msg": {
    "type": "session_configured",
    "model": "gpt-5",
    "session_id": "sess_abc123",
    "capabilities": ["code_generation", "file_editing", "web_search"]
  }
}
```

#### 2. User Input
```json
// Request
{
  "id": "msg-1",
  "op": {
    "type": "user_input",
    "items": [
      {
        "type": "text",
        "text": "Create a function to validate email addresses"
      }
    ]
  }
}

// Response (Agent thinking)
{
  "id": "msg-1",
  "msg": {
    "type": "agent_thinking",
    "content": "Analyzing requirements for email validation..."
  }
}

// Response (Agent message)
{
  "id": "msg-1",
  "msg": {
    "type": "agent_message",
    "message": "I'll create an email validation function...",
    "tool_calls": [
      {
        "type": "file_write",
        "path": "email_validator.js",
        "content": "function validateEmail(email) { ... }"
      }
    ]
  }
}
```

#### 3. Tool Execution
```json
// Tool call notification
{
  "id": "",
  "msg": {
    "type": "tool_execution",
    "tool": "file_write",
    "status": "started",
    "details": {
      "path": "email_validator.js"
    }
  }
}

// Tool result
{
  "id": "",
  "msg": {
    "type": "tool_result",
    "tool": "file_write",
    "success": true,
    "output": "File written successfully"
  }
}
```

## Session Resume and Continuation

### Overview

Codex CLI supports session resumption through the `--resume` flag, allowing users to continue previous conversations with full context. This is critical for maintaining conversation flow across application restarts or session switches.

### Resume Implementation

#### 1. Starting a Resume Session

When starting Codex with resume capability:

```typescript
// CodexManager implementation for resume
// Reference: https://github.com/openai/codex#resume-sessions
export class CodexManager extends AbstractCliManager {
  private resumeSessionMap: Map<string, string> = new Map(); // Maps panelId to Codex sessionId
  
  async resumeSession(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    codexSessionId?: string
  ): Promise<void> {
    // Build command with resume flag
    // See: https://github.com/openai/codex/blob/main/codex-cli/src/main.rs (resume handling)
    const command = await this.getCliExecutablePath();
    const args = ['--resume'];
    
    if (codexSessionId) {
      args.push('--session-id', codexSessionId);
      this.resumeSessionMap.set(panelId, codexSessionId);
    }
    
    // Add other configuration
    args.push('--model', 'gpt-5');
    args.push('-c', 'sandbox_mode="workspace-write"');
    
    const spawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      isResume: true,
      resumeSessionId: codexSessionId
    };
    
    return this.spawnCliProcess(spawnOptions);
  }
  
  protected buildCommandArgs(options: CodexSpawnOptions): string[] {
    const args: string[] = [];
    
    // Handle resume mode
    if (options.isResume) {
      args.push('--resume');
      if (options.resumeSessionId) {
        args.push('--session-id', options.resumeSessionId);
      }
    }
    
    // Model configuration
    if (options.model) {
      args.push('--model', options.model);
    }
    
    // Sandbox settings
    args.push('-c', `sandbox_mode="${options.sandboxMode || 'workspace-write'}"`);
    
    // Initial prompt for new sessions
    if (!options.isResume && options.prompt) {
      args.push('--message', options.prompt);
    }
    
    return args;
  }
}
```

#### 2. Session ID Management

```typescript
// Protocol messages for session management
interface SessionResumeMessage {
  id: string;
  msg: {
    type: 'session_resumed';
    session_id: string;
    message_count: number;
    last_activity: string;
  };
}

// Handle session resume confirmation
private handleSessionResumed(
  message: SessionResumeMessage,
  panelId: string
): void {
  const codexSessionId = message.msg.session_id;
  
  // Store mapping for future use
  this.resumeSessionMap.set(panelId, codexSessionId);
  
  // Persist to database for recovery
  this.saveSessionMapping(panelId, codexSessionId);
  
  // Emit event to frontend
  this.emitEvent(panelId, {
    type: 'session_resumed',
    sessionId: codexSessionId,
    messageCount: message.msg.message_count,
    lastActivity: message.msg.last_activity
  });
}
```

#### 3. Database Persistence for Resume

```sql
-- Add column to tool_panels table for Codex session tracking
ALTER TABLE tool_panels ADD COLUMN codex_session_id TEXT;

-- Store resume information
UPDATE tool_panels 
SET codex_session_id = ?, 
    state = json_patch(state, '$.resumeEnabled', true)
WHERE id = ?;
```

```typescript
// Persist and retrieve Codex session IDs
class CodexSessionPersistence {
  saveCodexSessionId(panelId: string, codexSessionId: string): void {
    const db = this.getDatabase();
    db.prepare(`
      UPDATE tool_panels 
      SET codex_session_id = ? 
      WHERE id = ?
    `).run(codexSessionId, panelId);
  }
  
  getCodexSessionId(panelId: string): string | null {
    const db = this.getDatabase();
    const result = db.prepare(`
      SELECT codex_session_id 
      FROM tool_panels 
      WHERE id = ?
    `).get(panelId);
    
    return result?.codex_session_id || null;
  }
  
  async recoverSession(panelId: string): Promise<boolean> {
    const codexSessionId = this.getCodexSessionId(panelId);
    if (!codexSessionId) return false;
    
    try {
      await this.resumeSession(panelId, this.sessionId, this.worktreePath, codexSessionId);
      return true;
    } catch (error) {
      this.logger?.error('Failed to recover Codex session:', error);
      return false;
    }
  }
}
```

#### 4. Frontend Resume UI

```typescript
// CodexPanel component with resume functionality
export const CodexPanel: React.FC<CodexPanelProps> = ({ panelId, sessionId }) => {
  const [canResume, setCanResume] = useState(false);
  const [codexSessionId, setCodexSessionId] = useState<string | null>(null);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  
  useEffect(() => {
    // Check if session can be resumed
    window.electron.invoke('codex:check-resume', panelId).then(info => {
      if (info) {
        setCanResume(true);
        setCodexSessionId(info.sessionId);
        setResumeInfo(info);
      }
    });
  }, [panelId]);
  
  const handleResume = async () => {
    if (!codexSessionId) return;
    
    await window.electron.invoke('codex:resume', panelId, codexSessionId);
    setCanResume(false);
  };
  
  return (
    <div className="flex flex-col h-full">
      {canResume && resumeInfo && (
        <div className="bg-surface-secondary p-3 border-b border-border-primary">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Resume Previous Session?</p>
              <p className="text-xs text-text-secondary">
                {resumeInfo.messageCount} messages • Last active {resumeInfo.lastActivity}
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleResume}
                className="px-3 py-1 bg-primary text-white rounded text-sm"
              >
                Resume
              </button>
              <button 
                onClick={() => setCanResume(false)}
                className="px-3 py-1 border border-border-primary rounded text-sm"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rest of panel content */}
    </div>
  );
};
```

## Approval Request Handling

### Overview

Codex CLI implements an approval mechanism for potentially dangerous operations. When `approval_policy` is set to `on-request` or `manual`, certain actions require user confirmation before execution.

### Approval Protocol Messages

#### 1. Approval Request Message

```json
{
  "id": "",
  "msg": {
    "type": "approval_request",
    "request_id": "req_xyz789",
    "action": "file_write",
    "details": {
      "path": "/src/config.json",
      "operation": "overwrite",
      "size": 1024,
      "preview": "{\n  \"apiKey\": \"...\"\n}"
    },
    "risk_level": "medium",
    "explanation": "This will overwrite your existing configuration file."
  }
}
```

#### 2. Approval Response

```json
{
  "id": "approval-1",
  "op": {
    "type": "approval_response",
    "request_id": "req_xyz789",
    "approved": true,
    "remember": false,
    "comment": "Proceed with file update"
  }
}
```

### Approval Manager Implementation

```typescript
// Approval request handling in CodexManager
// Reference: https://github.com/openai/codex#approval-system
export class CodexManager extends AbstractCliManager {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalCallbacks: Map<string, (approved: boolean) => void> = new Map();
  
  // Handle incoming approval requests
  private handleApprovalRequest(
    message: ApprovalRequestMessage,
    panelId: string
  ): void {
    const request: ApprovalRequest = {
      id: message.msg.request_id,
      panelId,
      action: message.msg.action,
      details: message.msg.details,
      riskLevel: message.msg.risk_level,
      explanation: message.msg.explanation,
      timestamp: new Date()
    };
    
    this.pendingApprovals.set(request.id, request);
    
    // Emit to frontend for user decision
    this.emitEvent(panelId, {
      type: 'approval_required',
      request
    });
    
    // Set timeout for auto-rejection if configured
    if (this.configManager?.getConfig()?.codexApprovalTimeout) {
      setTimeout(() => {
        if (this.pendingApprovals.has(request.id)) {
          this.respondToApproval(request.id, false, 'Timeout - automatically rejected');
        }
      }, this.configManager.getConfig().codexApprovalTimeout * 1000);
    }
  }
  
  // Send approval response
  async respondToApproval(
    requestId: string,
    approved: boolean,
    comment?: string,
    remember?: boolean
  ): Promise<void> {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      throw new Error(`No pending approval found for ${requestId}`);
    }
    
    const response = {
      type: 'approval_response',
      request_id: requestId,
      approved,
      remember: remember || false,
      comment: comment || ''
    };
    
    this.sendProtocolMessage(request.panelId, response);
    this.pendingApprovals.delete(requestId);
    
    // Store decision for audit
    this.auditApprovalDecision(request, approved, comment);
    
    // Execute callback if registered
    const callback = this.approvalCallbacks.get(requestId);
    if (callback) {
      callback(approved);
      this.approvalCallbacks.delete(requestId);
    }
  }
  
  // Audit trail for approvals
  private auditApprovalDecision(
    request: ApprovalRequest,
    approved: boolean,
    comment?: string
  ): void {
    const db = this.getDatabase();
    db.prepare(`
      INSERT INTO approval_audit (
        panel_id,
        request_id,
        action,
        risk_level,
        approved,
        comment,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      request.panelId,
      request.id,
      request.action,
      request.riskLevel,
      approved ? 1 : 0,
      comment || null
    );
  }
}
```

### Frontend Approval UI

```typescript
// Approval dialog component
interface ApprovalDialogProps {
  request: ApprovalRequest;
  onApprove: (comment?: string, remember?: boolean) => void;
  onReject: (comment?: string) => void;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  request,
  onApprove,
  onReject
}) => {
  const [comment, setComment] = useState('');
  const [remember, setRemember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-primary rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Approval Required</h3>
            <p className={`text-sm mt-1 ${getRiskColor(request.riskLevel)}`}>
              Risk Level: {request.riskLevel.toUpperCase()}
            </p>
          </div>
          <span className="text-sm text-text-secondary">
            {new Date(request.timestamp).toLocaleTimeString()}
          </span>
        </div>
        
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Action: {request.action}</p>
          <p className="text-sm text-text-secondary">{request.explanation}</p>
        </div>
        
        {request.details && (
          <div className="mb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-primary hover:underline"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            
            {showDetails && (
              <div className="mt-2 p-3 bg-surface-secondary rounded text-xs font-mono">
                {request.details.path && (
                  <p>Path: {request.details.path}</p>
                )}
                {request.details.operation && (
                  <p>Operation: {request.details.operation}</p>
                )}
                {request.details.preview && (
                  <pre className="mt-2 overflow-auto max-h-40">
                    {request.details.preview}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="mb-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment (optional)"
            className="w-full p-2 bg-surface-secondary rounded text-sm"
            rows={2}
          />
        </div>
        
        {request.riskLevel !== 'high' && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this decision for similar requests
            </label>
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={() => onApprove(comment, remember)}
            className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Approve
          </button>
          <button
            onClick={() => onReject(comment)}
            className="flex-1 px-4 py-2 border border-border-primary rounded hover:bg-surface-secondary"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
};
```

### Approval Queue Management

```typescript
// Manage multiple approval requests
export const useApprovalQueue = (panelId: string) => {
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [current, setCurrent] = useState<ApprovalRequest | null>(null);
  
  useEffect(() => {
    const handleApprovalRequired = (event: any, data: any) => {
      if (data.panelId === panelId) {
        setQueue(prev => [...prev, data.request]);
        if (!current) {
          setCurrent(data.request);
        }
      }
    };
    
    window.electron.on('codex:approval-required', handleApprovalRequired);
    return () => window.electron.off('codex:approval-required', handleApprovalRequired);
  }, [panelId, current]);
  
  const handleApprove = async (comment?: string, remember?: boolean) => {
    if (!current) return;
    
    await window.electron.invoke(
      'codex:respond-approval',
      current.id,
      true,
      comment,
      remember
    );
    
    moveToNext();
  };
  
  const handleReject = async (comment?: string) => {
    if (!current) return;
    
    await window.electron.invoke(
      'codex:respond-approval',
      current.id,
      false,
      comment
    );
    
    moveToNext();
  };
  
  const moveToNext = () => {
    setQueue(prev => prev.slice(1));
    setCurrent(queue[1] || null);
  };
  
  return {
    currentApproval: current,
    queueLength: queue.length,
    handleApprove,
    handleReject
  };
};
```

### Approval Policies Configuration

```typescript
// Configuration options for approval handling
interface CodexApprovalConfig {
  defaultPolicy: 'auto' | 'on-request' | 'manual';
  timeout?: number; // seconds before auto-rejection
  rememberDuration?: number; // hours to remember approvals
  riskThresholds: {
    fileWrite: 'low' | 'medium' | 'high';
    fileDelete: 'high';
    systemCommand: 'high';
    networkRequest: 'medium';
  };
  autoApprove: {
    lowRisk: boolean;
    trustedPaths: string[];
    maxFileSize: number; // bytes
  };
}

// Apply approval policy
class ApprovalPolicyManager {
  private config: CodexApprovalConfig;
  private rememberedDecisions: Map<string, ApprovalDecision> = new Map();
  
  shouldAutoApprove(request: ApprovalRequest): boolean {
    // Check remembered decisions
    const remembered = this.findRememberedDecision(request);
    if (remembered) {
      return remembered.approved;
    }
    
    // Check auto-approval rules
    if (this.config.autoApprove.lowRisk && request.riskLevel === 'low') {
      return true;
    }
    
    // Check trusted paths
    if (request.details?.path) {
      const isTrusted = this.config.autoApprove.trustedPaths.some(
        pattern => minimatch(request.details.path, pattern)
      );
      if (isTrusted) return true;
    }
    
    // Check file size limits
    if (request.details?.size && 
        request.details.size <= this.config.autoApprove.maxFileSize) {
      return true;
    }
    
    return false;
  }
  
  rememberDecision(
    request: ApprovalRequest,
    approved: boolean,
    duration?: number
  ): void {
    const key = this.generateDecisionKey(request);
    const expiry = Date.now() + (duration || this.config.rememberDuration) * 3600000;
    
    this.rememberedDecisions.set(key, {
      approved,
      expiry,
      action: request.action,
      pattern: request.details?.path
    });
  }
  
  private findRememberedDecision(request: ApprovalRequest): ApprovalDecision | null {
    const key = this.generateDecisionKey(request);
    const decision = this.rememberedDecisions.get(key);
    
    if (decision && decision.expiry > Date.now()) {
      return decision;
    }
    
    // Clean up expired decisions
    if (decision) {
      this.rememberedDecisions.delete(key);
    }
    
    return null;
  }
  
  private generateDecisionKey(request: ApprovalRequest): string {
    return `${request.action}:${request.details?.path || 'unknown'}`;
  }
}
```

## Codex Manager Implementation

### Core Implementation

> **Source References**:
> - Crystal Codex Manager: `main/src/services/panels/codex/codexManager.ts`
> - Crystal Abstract CLI: `main/src/services/panels/cli/AbstractCliManager.ts`
> - Codex CLI Source: [github.com/openai/codex/codex-cli](https://github.com/openai/codex/tree/main/codex-cli)

```typescript
// main/src/services/panels/codex/codexManager.ts
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AbstractCliManager } from '../cli/AbstractCliManager';

export class CodexManager extends AbstractCliManager {
  private messageBuffers: Map<string, string> = new Map();
  private messageIdCounters: Map<string, number> = new Map();
  private protocolHandshakeComplete: Map<string, boolean> = new Map();
  private sessionConfigs: Map<string, CodexSessionConfig> = new Map();

  // Protocol message handling
  // Based on Codex protocol: https://github.com/openai/codex/blob/main/codex-rs/src/protocol.rs
  private processProtocolMessage(
    rawData: string,
    panelId: string
  ): CodexResponse | null {
    try {
      // Handle line-delimited JSON
      const lines = rawData.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          if (this.isValidProtocolMessage(message)) {
            return message;
          }
        } catch (e) {
          // Not JSON, might be raw output
          this.handleRawOutput(line, panelId);
        }
      }
    } catch (error) {
      this.logger?.error(`Protocol parsing error: ${error}`);
    }
    return null;
  }

  // Send protocol message
  private sendProtocolMessage(
    panelId: string,
    operation: any
  ): string {
    const messageId = this.generateMessageId(panelId);
    const message: CodexRequest = {
      id: messageId,
      op: operation
    };

    const process = this.processes.get(panelId);
    if (process) {
      const jsonMessage = JSON.stringify(message);
      process.write(jsonMessage + '\n');
      this.logger?.debug(`Sent protocol message: ${jsonMessage}`);
    }

    return messageId;
  }

  // Initialize session with configuration
  async initializeCodexSession(
    panelId: string,
    config: CodexSessionConfig
  ): Promise<void> {
    // Send session configuration
    const configOp = {
      type: 'configure_session',
      model: config.model || 'gpt-5',
      provider: config.provider || 'openai',
      sandbox_mode: config.sandboxMode || 'workspace-write',
      approval_policy: config.approvalPolicy || 'on-request',
      show_agent_reasoning: config.showRawAgentReasoning ?? true,
      web_search: config.webSearch ?? false
    };

    const messageId = this.sendProtocolMessage(panelId, configOp);
    
    // Wait for configuration acknowledgment
    await this.waitForResponse(panelId, messageId, 'session_configured');
    
    this.sessionConfigs.set(panelId, config);
    this.protocolHandshakeComplete.set(panelId, true);
  }

  // Send user prompt
  async sendUserPrompt(
    panelId: string,
    prompt: string,
    files?: string[]
  ): Promise<void> {
    const items: any[] = [
      { type: 'text', text: prompt }
    ];

    // Add file references if provided
    if (files && files.length > 0) {
      files.forEach(file => {
        items.push({ type: 'file', path: file });
      });
    }

    const operation = {
      type: 'user_input',
      items
    };

    this.sendProtocolMessage(panelId, operation);
  }

  // Handle conversation continuation
  async continueConversation(
    panelId: string,
    sessionId: string,
    prompt: string,
    conversationHistory: any[]
  ): Promise<void> {
    // Reconstruct conversation context
    const contextOp = {
      type: 'restore_context',
      messages: conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }))
    };

    await this.sendProtocolMessage(panelId, contextOp);
    
    // Send new prompt
    await this.sendUserPrompt(panelId, prompt);
  }

  // Parse and emit protocol events
  protected parseCliOutput(
    data: string,
    panelId: string,
    sessionId: string
  ): OutputEvent[] {
    const events: OutputEvent[] = [];
    const message = this.processProtocolMessage(data, panelId);

    if (message?.msg) {
      switch (message.msg.type) {
        case 'session_configured':
          events.push({
            panelId,
            sessionId,
            type: 'json',
            data: {
              type: 'session_configured',
              model: message.msg.model,
              sessionId: message.msg.session_id,
              capabilities: message.msg.capabilities
            },
            timestamp: new Date()
          });
          break;

        case 'agent_thinking':
          events.push({
            panelId,
            sessionId,
            type: 'json',
            data: {
              type: 'thinking',
              content: message.msg.content
            },
            timestamp: new Date()
          });
          break;

        case 'agent_message':
          events.push({
            panelId,
            sessionId,
            type: 'json',
            data: {
              type: 'assistant_message',
              content: message.msg.message,
              tool_calls: message.msg.tool_calls
            },
            timestamp: new Date()
          });
          break;

        case 'tool_execution':
          events.push({
            panelId,
            sessionId,
            type: 'json',
            data: {
              type: 'tool_use',
              tool: message.msg.tool,
              status: message.msg.status,
              details: message.msg.details
            },
            timestamp: new Date()
          });
          break;

        case 'tool_result':
          events.push({
            panelId,
            sessionId,
            type: 'json',
            data: {
              type: 'tool_result',
              tool: message.msg.tool,
              success: message.msg.success,
              output: message.msg.output
            },
            timestamp: new Date()
          });
          break;

        default:
          // Unknown message type, emit as raw
          events.push({
            panelId,
            sessionId,
            type: 'stdout',
            data: JSON.stringify(message),
            timestamp: new Date()
          });
      }
    }

    return events;
  }
}
```

## Frontend Panel Integration

### CodexPanel Component

> **Source References**:
> - Crystal Codex Panel: `frontend/src/components/panels/codex/CodexPanel.tsx`
> - Crystal Base CLI Panel: `frontend/src/components/panels/cli/BaseCliPanel.tsx`
> - Panel Factory: `frontend/src/components/panels/cli/CliPanelFactory.tsx`

```typescript
// frontend/src/components/panels/codex/CodexPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useCodexPanel } from '../../../hooks/useCodexPanel';
import { MessageTransformer } from './CodexMessageTransformer';
import { RichOutputView } from '../ai/RichOutputView';
import { CodexInputPanel } from './CodexInputPanel';

interface CodexPanelProps {
  panelId: string;
  sessionId: string;
}

export const CodexPanel: React.FC<CodexPanelProps> = ({
  panelId,
  sessionId
}) => {
  const {
    messages,
    isThinking,
    isWaiting,
    sendMessage,
    clearMessages,
    sessionConfig
  } = useCodexPanel(panelId, sessionId);

  const [input, setInput] = useState('');
  const transformer = useRef(new MessageTransformer());

  const handleSubmit = async (text: string, files?: File[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;

    // Transform files to paths if needed
    const filePaths = files?.map(f => f.path || f.name);
    
    await sendMessage(text, filePaths);
    setInput('');
  };

  const transformedMessages = transformer.current.transform(messages);

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Header with session info */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Codex</span>
          {sessionConfig?.model && (
            <span className="text-xs text-text-secondary">
              {sessionConfig.model}
            </span>
          )}
        </div>
        {isThinking && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs text-text-secondary">Thinking...</span>
          </div>
        )}
      </div>

      {/* Messages view */}
      <div className="flex-1 overflow-hidden">
        <RichOutputView
          messages={transformedMessages}
          isThinking={isThinking}
          onClearMessages={clearMessages}
        />
      </div>

      {/* Input panel */}
      <CodexInputPanel
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isDisabled={!sessionConfig || isThinking}
        isWaiting={isWaiting}
        allowFileAttachments={true}
      />
    </div>
  );
};
```

### Message Transformer

> **Source Reference**: `frontend/src/components/panels/ai/transformers/CodexMessageTransformer.ts`

```typescript
// frontend/src/components/panels/ai/transformers/CodexMessageTransformer.ts
export class CodexMessageTransformer {
  transform(messages: CodexMessage[]): TransformedMessage[] {
    return messages.map(msg => {
      switch (msg.type) {
        case 'session_configured':
          return {
            type: 'system',
            content: `Session initialized with ${msg.model} (ID: ${msg.sessionId})`,
            timestamp: msg.timestamp
          };

        case 'thinking':
          return {
            type: 'thinking',
            content: msg.content,
            timestamp: msg.timestamp
          };

        case 'assistant_message':
          return {
            type: 'assistant',
            content: msg.content,
            tool_calls: this.transformToolCalls(msg.tool_calls),
            timestamp: msg.timestamp
          };

        case 'user_message':
          return {
            type: 'user',
            content: msg.content,
            files: msg.files,
            timestamp: msg.timestamp
          };

        case 'tool_use':
          return {
            type: 'tool_use',
            tool: msg.tool,
            status: msg.status,
            details: msg.details,
            timestamp: msg.timestamp
          };

        case 'tool_result':
          return {
            type: 'tool_result',
            tool: msg.tool,
            success: msg.success,
            output: this.formatToolOutput(msg.output),
            timestamp: msg.timestamp
          };

        default:
          return {
            type: 'unknown',
            content: JSON.stringify(msg),
            timestamp: msg.timestamp
          };
      }
    });
  }

  private transformToolCalls(toolCalls?: any[]): ToolCall[] {
    if (!toolCalls) return [];
    
    return toolCalls.map(call => ({
      type: call.type,
      name: this.getToolDisplayName(call.type),
      parameters: call,
      status: 'pending'
    }));
  }

  private getToolDisplayName(toolType: string): string {
    const names: Record<string, string> = {
      'file_write': 'Write File',
      'file_read': 'Read File',
      'bash_run': 'Run Command',
      'web_search': 'Search Web',
      'file_edit': 'Edit File'
    };
    return names[toolType] || toolType;
  }

  private formatToolOutput(output: any): string {
    if (typeof output === 'string') return output;
    return JSON.stringify(output, null, 2);
  }
}
```

## State Management

### Session State Store

> **Source References**:
> - Crystal Panel Store: `frontend/src/stores/panelStore.ts`
> - Crystal Session Store: `frontend/src/stores/sessionStore.ts`

```typescript
// frontend/src/stores/codexStore.ts
import { create } from 'zustand';

interface CodexSessionState {
  sessionId: string;
  panelId: string;
  messages: CodexMessage[];
  config: CodexSessionConfig;
  isThinking: boolean;
  isWaiting: boolean;
  lastActivity: Date;
}

interface CodexStore {
  sessions: Map<string, CodexSessionState>;
  
  // Actions
  initializeSession: (panelId: string, sessionId: string, config: CodexSessionConfig) => void;
  addMessage: (panelId: string, message: CodexMessage) => void;
  setThinking: (panelId: string, thinking: boolean) => void;
  setWaiting: (panelId: string, waiting: boolean) => void;
  clearSession: (panelId: string) => void;
  
  // Selectors
  getSession: (panelId: string) => CodexSessionState | undefined;
  getMessages: (panelId: string) => CodexMessage[];
}

export const useCodexStore = create<CodexStore>((set, get) => ({
  sessions: new Map(),

  initializeSession: (panelId, sessionId, config) => {
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.set(panelId, {
        sessionId,
        panelId,
        messages: [],
        config,
        isThinking: false,
        isWaiting: false,
        lastActivity: new Date()
      });
      return { sessions };
    });
  },

  addMessage: (panelId, message) => {
    set(state => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(panelId);
      if (session) {
        sessions.set(panelId, {
          ...session,
          messages: [...session.messages, message],
          lastActivity: new Date()
        });
      }
      return { sessions };
    });
  },

  setThinking: (panelId, thinking) => {
    set(state => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(panelId);
      if (session) {
        sessions.set(panelId, {
          ...session,
          isThinking: thinking
        });
      }
      return { sessions };
    });
  },

  setWaiting: (panelId, waiting) => {
    set(state => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(panelId);
      if (session) {
        sessions.set(panelId, {
          ...session,
          isWaiting: waiting
        });
      }
      return { sessions };
    });
  },

  clearSession: (panelId) => {
    set(state => {
      const sessions = new Map(state.sessions);
      sessions.delete(panelId);
      return { sessions };
    });
  },

  getSession: (panelId) => {
    return get().sessions.get(panelId);
  },

  getMessages: (panelId) => {
    const session = get().sessions.get(panelId);
    return session?.messages || [];
  }
}));
```

## Error Handling and Recovery

### Protocol Error Handling

> **Related Codex Error Handling**: [github.com/openai/codex/codex-rs/src/error.rs](https://github.com/openai/codex/blob/main/codex-rs/src/error.rs)

```typescript
// Error types and handlers
enum CodexErrorCode {
  PROTOCOL_ERROR = 1001,
  SESSION_ERROR = 1002,
  MODEL_ERROR = 1003,
  AUTH_ERROR = 1004,
  TOOL_ERROR = 1005
}

class CodexProtocolError extends Error {
  constructor(
    public code: CodexErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CodexProtocolError';
  }
}

// In CodexManager
private handleProtocolError(
  error: CodexProtocolError,
  panelId: string
): void {
  this.logger?.error(`Protocol error for panel ${panelId}:`, error);

  switch (error.code) {
    case CodexErrorCode.AUTH_ERROR:
      this.emitEvent(panelId, {
        type: 'error',
        error: 'Authentication failed. Please check your API key.',
        recoverable: true,
        action: 'configure_auth'
      });
      break;

    case CodexErrorCode.MODEL_ERROR:
      this.emitEvent(panelId, {
        type: 'error',
        error: `Model not available: ${error.details?.model}`,
        recoverable: true,
        action: 'select_model',
        suggestions: ['gpt-4', 'gpt-3.5-turbo']
      });
      break;

    case CodexErrorCode.SESSION_ERROR:
      // Attempt session recovery
      this.attemptSessionRecovery(panelId);
      break;

    case CodexErrorCode.TOOL_ERROR:
      this.emitEvent(panelId, {
        type: 'error',
        error: `Tool execution failed: ${error.details?.tool}`,
        recoverable: true,
        details: error.details
      });
      break;

    default:
      this.emitEvent(panelId, {
        type: 'error',
        error: error.message,
        recoverable: false
      });
  }
}

// Session recovery mechanism
private async attemptSessionRecovery(
  panelId: string
): Promise<boolean> {
  try {
    const session = this.sessionConfigs.get(panelId);
    if (!session) return false;

    // Kill existing process
    await this.killProcess(panelId);

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restart session
    const sessionId = this.getSessionId(panelId);
    await this.startPanel(
      panelId,
      sessionId,
      session.worktreePath,
      '', // Empty prompt for recovery
      session.model
    );

    // Restore conversation if available
    const history = await this.loadConversationHistory(sessionId);
    if (history && history.length > 0) {
      await this.restoreConversationContext(panelId, history);
    }

    return true;
  } catch (error) {
    this.logger?.error('Session recovery failed:', error);
    return false;
  }
}
```

## Testing Strategy

### Unit Tests

> **Test References**:
> - Crystal Test Setup: `main/src/test/setup.ts`
> - Codex Tests: [github.com/openai/codex/tests](https://github.com/openai/codex/tree/main/tests)

```typescript
// main/src/services/panels/codex/codexManager.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CodexManager } from './codexManager';

describe('CodexManager', () => {
  let manager: CodexManager;

  beforeEach(() => {
    manager = new CodexManager(
      mockSessionManager,
      mockLogger,
      mockConfigManager
    );
  });

  describe('Protocol Message Handling', () => {
    it('should parse valid protocol messages', () => {
      const rawMessage = '{"id":"test-1","msg":{"type":"session_configured","model":"gpt-5"}}';
      const result = manager['processProtocolMessage'](rawMessage, 'panel-1');
      
      expect(result).toBeDefined();
      expect(result?.msg?.type).toBe('session_configured');
      expect(result?.msg?.model).toBe('gpt-5');
    });

    it('should handle multi-line JSON messages', () => {
      const rawMessage = [
        '{"id":"1","msg":{"type":"agent_thinking","content":"Thinking..."}}',
        '{"id":"2","msg":{"type":"agent_message","message":"Done"}}'
      ].join('\n');

      const results = manager['parseCliOutput'](rawMessage, 'panel-1', 'session-1');
      
      expect(results).toHaveLength(2);
      expect(results[0].data.type).toBe('thinking');
      expect(results[1].data.type).toBe('assistant_message');
    });

    it('should handle protocol errors gracefully', () => {
      const errorMessage = '{"id":"test","error":{"code":1003,"message":"Model not found"}}';
      
      expect(() => {
        manager['processProtocolMessage'](errorMessage, 'panel-1');
      }).not.toThrow();
    });
  });

  describe('Session Management', () => {
    it('should initialize session with configuration', async () => {
      const config = {
        model: 'gpt-5',
        provider: 'openai',
        sandboxMode: 'workspace-write'
      };

      const sendSpy = jest.spyOn(manager as any, 'sendProtocolMessage');
      await manager['initializeCodexSession']('panel-1', config);

      expect(sendSpy).toHaveBeenCalledWith('panel-1', expect.objectContaining({
        type: 'configure_session',
        model: 'gpt-5'
      }));
    });

    it('should handle conversation continuation', async () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      await manager['continueConversation']('panel-1', 'session-1', 'New prompt', history);
      
      // Verify context restoration and new prompt
      expect(manager['sessionConfigs'].get('panel-1')).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should attempt session recovery on session error', async () => {
      const recoverySpy = jest.spyOn(manager as any, 'attemptSessionRecovery');
      
      const error = new CodexProtocolError(
        CodexErrorCode.SESSION_ERROR,
        'Session lost'
      );

      manager['handleProtocolError'](error, 'panel-1');
      
      expect(recoverySpy).toHaveBeenCalledWith('panel-1');
    });

    it('should emit appropriate error events', () => {
      const emitSpy = jest.spyOn(manager as any, 'emitEvent');
      
      const error = new CodexProtocolError(
        CodexErrorCode.AUTH_ERROR,
        'Invalid API key'
      );

      manager['handleProtocolError'](error, 'panel-1');
      
      expect(emitSpy).toHaveBeenCalledWith('panel-1', expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('Authentication'),
        recoverable: true
      }));
    });
  });
});
```

### Integration Tests

```typescript
// Integration test for full protocol flow
describe('Codex Protocol Integration', () => {
  it('should complete a full conversation flow', async () => {
    const manager = new CodexManager(sessionManager, logger, configManager);
    const panelId = 'test-panel';
    const sessionId = 'test-session';

    // Start session
    await manager.startPanel(
      panelId,
      sessionId,
      '/test/path',
      'Write a hello world function',
      'gpt-5'
    );

    // Wait for initialization
    await waitFor(() => manager['protocolHandshakeComplete'].get(panelId));

    // Verify session configured
    const config = manager['sessionConfigs'].get(panelId);
    expect(config).toBeDefined();
    expect(config?.model).toBe('gpt-5');

    // Send message and verify response
    await manager.sendInput(panelId, 'Add documentation to the function');
    
    // Wait for response
    const messages = await waitForMessages(panelId, 2);
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'assistant_message' })
    );
  });
});
```

## Best Practices

> **Implementation Examples**:
> - Crystal CLI Integration Guide: `docs/ADDING_NEW_CLI_TOOLS.md`
> - Codex Best Practices: [github.com/openai/codex#best-practices](https://github.com/openai/codex#best-practices)

### 1. Protocol Message Validation

Always validate incoming protocol messages:

```typescript
private isValidProtocolMessage(message: any): boolean {
  // Check required fields
  if (!message.id && !message.msg && !message.error) {
    return false;
  }

  // Validate message types
  if (message.msg && !this.knownMessageTypes.has(message.msg.type)) {
    this.logger?.warn(`Unknown message type: ${message.msg.type}`);
  }

  return true;
}
```

### 2. Message Buffering

Handle partial messages and buffering:

```typescript
private handlePartialMessage(
  data: string,
  panelId: string
): string[] {
  let buffer = this.messageBuffers.get(panelId) || '';
  buffer += data;

  const messages: string[] = [];
  const lines = buffer.split('\n');

  // Process complete lines
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim()) {
      messages.push(lines[i]);
    }
  }

  // Keep last incomplete line in buffer
  this.messageBuffers.set(panelId, lines[lines.length - 1]);

  return messages;
}
```

### 3. State Synchronization

Keep frontend and backend state synchronized:

```typescript
// Backend emits state changes
this.emitStateChange(panelId, {
  thinking: true,
  waiting: false,
  lastMessage: message
});

// Frontend listens and updates
useEffect(() => {
  const handleStateChange = (event: any, data: any) => {
    if (data.panelId === panelId) {
      updateSessionState(data);
    }
  };

  window.electron.on('codex:state-change', handleStateChange);
  return () => window.electron.off('codex:state-change', handleStateChange);
}, [panelId]);
```

### 4. Graceful Degradation

Provide fallbacks for missing features:

```typescript
private async checkFeatureAvailability(): Promise<FeatureSet> {
  try {
    // Check Codex version and capabilities
    const version = await this.getCodexVersion();
    return {
      webSearch: version >= '2.0.0',
      fileEditing: true,
      multiModal: version >= '2.5.0'
    };
  } catch {
    // Return minimal feature set on error
    return {
      webSearch: false,
      fileEditing: true,
      multiModal: false
    };
  }
}
```

### 5. Performance Optimization

Implement efficient message handling:

```typescript
// Debounce rapid message updates
private debouncedMessageUpdate = debounce((panelId: string, messages: any[]) => {
  this.emitEvent(panelId, {
    type: 'messages_batch',
    messages
  });
}, 100);

// Batch process messages
private processBatch(messages: string[], panelId: string): void {
  const events: OutputEvent[] = [];
  
  for (const msg of messages) {
    events.push(...this.parseCliOutput(msg, panelId, this.getSessionId(panelId)));
  }

  if (events.length > 0) {
    this.debouncedMessageUpdate(panelId, events);
  }
}
```

## Conclusion

This documentation provides a comprehensive guide for implementing a protocol-based wrapper for the OpenAI Codex CLI within the Crystal application framework.

## Additional Resources

### OpenAI Codex Repository
- **Main Repository**: [github.com/openai/codex](https://github.com/openai/codex)
- **CLI Source**: [github.com/openai/codex/tree/main/codex-cli](https://github.com/openai/codex/tree/main/codex-cli)
- **Rust Core**: [github.com/openai/codex/tree/main/codex-rs](https://github.com/openai/codex/tree/main/codex-rs)
- **Protocol Docs**: [github.com/openai/codex/blob/main/docs/protocol.md](https://github.com/openai/codex/blob/main/docs/protocol.md)
- **API Reference**: [github.com/openai/codex/blob/main/docs/api.md](https://github.com/openai/codex/blob/main/docs/api.md)

### Crystal Framework References
- **Adding CLI Tools Guide**: `docs/ADDING_NEW_CLI_TOOLS.md`
- **Codex Manager Implementation**: `main/src/services/panels/codex/codexManager.ts`
- **Codex Panel Component**: `frontend/src/components/panels/codex/CodexPanel.tsx`
- **Abstract CLI Manager**: `main/src/services/panels/cli/AbstractCliManager.ts`
- **Panel Manager**: `main/src/services/panelManager.ts`
- **IPC Handlers**: `main/src/ipc/codexPanel.ts`

### Related Documentation
- **Codex Installation Guide**: [github.com/openai/codex#installation](https://github.com/openai/codex#installation)
- **Codex Configuration**: [github.com/openai/codex#configuration](https://github.com/openai/codex#configuration)
- **Codex CLI Usage**: [github.com/openai/codex#usage](https://github.com/openai/codex#usage)
- **Model Context Protocol (MCP)**: [github.com/openai/codex#mcp-support](https://github.com/openai/codex#mcp-support) The key aspects covered include:

1. **Protocol Design**: JSON-RPC-based communication with well-defined message types
2. **Architecture**: Modular design with clear separation of concerns
3. **Implementation**: Detailed code examples for both backend and frontend
4. **Error Handling**: Robust error recovery and graceful degradation
5. **Testing**: Comprehensive testing strategy with unit and integration tests
6. **Best Practices**: Performance optimization and state management

The implementation leverages Crystal's existing infrastructure while providing Codex-specific functionality through the protocol wrapper pattern, ensuring maintainability and extensibility for future enhancements.