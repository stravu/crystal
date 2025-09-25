import type { DatabaseService } from '../database/database';
import type { Session, ConversationMessage, PromptMarker, ExecutionDiff } from '../database/models';
import type { SessionOutput } from '../types/session';
import { formatDuration, getTimeDifference, parseTimestamp } from './timestampUtils';

interface CompactionData {
  session: Session;
  conversationMessages: ConversationMessage[];
  promptMarkers: PromptMarker[];
  executionDiffs: ExecutionDiff[];
  sessionOutputs: SessionOutput[];
}

interface FileModification {
  path: string;
  operations: Array<'create' | 'edit'>;
  changeCount: number;
}

interface ToolCall {
  name: string;
  input: unknown;
  id: string;
}

interface PromptAnalysis {
  promptText: string;
  isCompleted: boolean;
  duration: string;
  filesModified: string[];
  lastMessage: string;
  timestamp: string;
}

interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface GitStatus {
  filesChanged: number;
  additions: number;
  deletions: number;
  hasUncommittedChanges?: boolean;
}

export class ProgrammaticCompactor {
  constructor(private db: DatabaseService) {}

  async generateSummary(sessionId: string, data: CompactionData): Promise<string> {
    const { session, conversationMessages, promptMarkers, executionDiffs, sessionOutputs } = data;
    
    // Analyze prompts and their outcomes
    const promptAnalysis = this.analyzePrompts(promptMarkers, sessionOutputs);
    
    // Extract file modifications
    const fileModifications = this.extractFileModifications(sessionOutputs);
    
    // Extract todos and tasks
    const todos = this.extractTodos(sessionOutputs);
    
    // Get git status
    const gitStatus = this.analyzeGitStatus(executionDiffs);
    
    // Detect if session was interrupted
    const wasInterrupted = this.detectInterruption(session, promptMarkers, sessionOutputs);
    
    // Build the summary
    return this.buildSummary({
      session,
      promptAnalysis,
      fileModifications,
      todos,
      gitStatus,
      wasInterrupted,
      conversationMessages
    });
  }

  private analyzePrompts(promptMarkers: PromptMarker[], outputs: SessionOutput[]): PromptAnalysis[] {
    return promptMarkers.map((prompt, index) => {
      const nextPrompt = promptMarkers[index + 1];
      const isCompleted = !!prompt.completion_timestamp;
      
      // Find outputs between this prompt and the next
      // Use array indices instead of database IDs for consistent indexing
      const promptOutputs = outputs.filter((o, outputArrayIndex) => {
        return outputArrayIndex >= prompt.output_index && 
               (!nextPrompt || outputArrayIndex < nextPrompt.output_index);
      });
      
      // Extract files modified during this prompt
      const filesModified = this.extractFilesModifiedForPrompt(promptOutputs);
      
      // Get last assistant message for this prompt
      const lastMessage = this.getLastAssistantMessage(promptOutputs);
      
      // Calculate duration
      let duration = 'Unknown';
      if (isCompleted && prompt.completion_timestamp) {
        const durationMs = getTimeDifference(prompt.timestamp, prompt.completion_timestamp);
        duration = formatDuration(durationMs);
      } else if (!isCompleted) {
        duration = '(ongoing)';
      }
      
      return {
        promptText: prompt.prompt_text,
        isCompleted,
        duration,
        filesModified,
        lastMessage,
        timestamp: prompt.timestamp
      };
    });
  }

  private extractFileModifications(outputs: SessionOutput[]): Map<string, FileModification> {
    const fileMap = new Map<string, FileModification>();
    
    outputs.forEach(output => {
      if (output.type === 'json') {
        try {
          // output.data is already parsed by sessionManager.getSessionOutputs
          const message = output.data as {
            type?: string;
            message?: {
              content?: Array<{
                type?: string;
                name?: string;
                input?: { file_path?: string; todos?: Todo[]; edits?: unknown[] };
                text?: string;
              }>;
            };
          };
          if (message.type === 'assistant' && message.message?.content) {
            message.message.content.forEach((content) => {
              if (content.type === 'tool_use') {
                const path = content.input?.file_path;
                if (path && content.name && ['Edit', 'Write', 'MultiEdit'].includes(content.name)) {
                  const existing = fileMap.get(path) || {
                    path,
                    operations: [] as Array<'create' | 'edit'>,
                    changeCount: 0
                  };
                  
                  const operation = content.name === 'Write' && existing.changeCount === 0 ? 'create' : 'edit';
                  existing.operations.push(operation);
                  existing.changeCount++;
                  
                  // Handle MultiEdit specially
                  if (content.name === 'MultiEdit' && content.input?.edits) {
                    existing.changeCount += content.input.edits.length - 1;
                  }
                  
                  fileMap.set(path, existing);
                }
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    return fileMap;
  }

  private extractFilesModifiedForPrompt(outputs: SessionOutput[]): string[] {
    const files = new Set<string>();
    
    outputs.forEach(output => {
      if (output.type === 'json') {
        try {
          // output.data is already parsed by sessionManager.getSessionOutputs
          const message = output.data as {
            type?: string;
            message?: {
              content?: Array<{
                type?: string;
                name?: string;
                input?: { file_path?: string; todos?: Todo[]; edits?: unknown[] };
                text?: string;
              }>;
            };
          };
          if (message.type === 'assistant' && message.message?.content) {
            message.message.content.forEach((content) => {
              if (content.type === 'tool_use' && content.input?.file_path) {
                if (content.name && ['Edit', 'Write', 'MultiEdit'].includes(content.name)) {
                  files.add(content.input.file_path);
                }
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    return Array.from(files);
  }

  private extractTodos(outputs: SessionOutput[]): Todo[] {
    const todos: Todo[] = [];
    
    outputs.forEach(output => {
      if (output.type === 'json') {
        try {
          // output.data is already parsed by sessionManager.getSessionOutputs
          const message = output.data as {
            type?: string;
            message?: {
              content?: Array<{
                type?: string;
                name?: string;
                input?: { file_path?: string; todos?: Todo[]; edits?: unknown[] };
                text?: string;
              }>;
            };
          };
          if (message.type === 'assistant' && message.message?.content) {
            message.message.content.forEach((content) => {
              if (content.type === 'tool_use' && content.name === 'TodoWrite' && content.input?.todos) {
                // Replace the todo list with the new state
                todos.length = 0;
                todos.push(...content.input.todos);
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    return todos;
  }

  private analyzeGitStatus(diffs: ExecutionDiff[]): GitStatus {
    if (diffs.length === 0) {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }
    
    // Get the latest diff
    const latestDiff = diffs[diffs.length - 1];
    
    return {
      filesChanged: latestDiff.stats_files_changed || 0,
      additions: latestDiff.stats_additions || 0,
      deletions: latestDiff.stats_deletions || 0,
      hasUncommittedChanges: !!latestDiff.git_diff
    };
  }

  private detectInterruption(session: Session, prompts: PromptMarker[], outputs: SessionOutput[]): boolean {
    // Check if session ended without completing the last prompt
    if (prompts.length === 0) return false;
    
    const lastPrompt = prompts[prompts.length - 1];
    const wasInterrupted = !lastPrompt.completion_timestamp && 
                          session.status !== 'running' && 
                          session.status !== 'pending';
    
    return wasInterrupted;
  }

  private getLastAssistantMessage(outputs: SessionOutput[]): string {
    // Find the last assistant message with text content
    for (let i = outputs.length - 1; i >= 0; i--) {
      const output = outputs[i];
      if (output.type === 'json') {
        try {
          // output.data is already parsed by sessionManager.getSessionOutputs
          const message = output.data as {
            type?: string;
            message?: {
              content?: Array<{
                type?: string;
                name?: string;
                input?: { file_path?: string; todos?: Todo[]; edits?: unknown[] };
                text?: string;
              }>;
            };
          };
          if (message.type === 'assistant' && message.message?.content && Array.isArray(message.message.content)) {
            // Look for text content
            for (const content of message.message.content) {
              if (content.type === 'text' && content.text) {
                // Return full text content without truncation
                return content.text;
              }
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    return 'No text response';
  }

  private buildSummary(data: {
    session: Session;
    promptAnalysis: PromptAnalysis[];
    fileModifications: Map<string, FileModification>;
    todos: Todo[];
    gitStatus: GitStatus;
    wasInterrupted: boolean;
    conversationMessages: ConversationMessage[];
  }): string {
    const { session, promptAnalysis, fileModifications, todos, gitStatus, wasInterrupted } = data;
    
    let summary = `<session_context>\n`;
    
    // Individual calls to Claude
    if (promptAnalysis.length > 0) {
      promptAnalysis.forEach((prompt, index: number) => {
        summary += `Call #${index + 1}:\n`;
        summary += `User Prompt: ${prompt.promptText}\n`;
        summary += `Final Assistant Message: ${prompt.lastMessage || 'No text response'}\n\n`;
        
        if (prompt.filesModified.length > 0) {
          summary += `Files modified: ${prompt.filesModified.join(', ')}\n\n`;
        }
        
        const status = prompt.isCompleted ? 'Completed' : 
                      (wasInterrupted && index === promptAnalysis.length - 1) ? 'Interrupted' : 
                      'In Progress';
        summary += `Status: ${status}\n`;
        if (prompt.duration !== 'Unknown') {
          summary += `Duration: ${prompt.duration}\n`;
        }
        summary += '\n---\n\n';
      });
    }
    
    // Overall file modifications
    if (fileModifications.size > 0) {
      summary += `### Files Modified (${fileModifications.size} total)\n\n`;
      
      const sortedFiles = Array.from(fileModifications.values())
        .sort((a: FileModification, b: FileModification) => b.changeCount - a.changeCount);
        // Include all modified files without limit
      
      sortedFiles.forEach((file: FileModification) => {
        const ops = file.operations.includes('create') ? 'Created' : 'Modified';
        summary += `- \`${file.path}\` - ${ops} (${file.changeCount} changes)\n`;
      });
      
      // All files are now included above
      
      summary += '\n';
    }
    
    // Current todos
    if (todos.length > 0) {
      const pending = todos.filter((t) => t.status === 'pending');
      const inProgress = todos.filter((t) => t.status === 'in_progress');
      const completed = todos.filter((t) => t.status === 'completed');
      
      summary += `### Task Status\n\n`;
      summary += `- **Completed**: ${completed.length}\n`;
      summary += `- **In Progress**: ${inProgress.length}\n`;
      summary += `- **Pending**: ${pending.length}\n\n`;
      
      if (inProgress.length > 0) {
        summary += `**Currently Working On**:\n`;
        inProgress.forEach((todo) => {
          summary += `- ${todo.content}\n`;
        });
        summary += '\n';
      }
      
      if (pending.length > 0) {
        summary += `**Next Tasks**:\n`;
        pending.forEach((todo) => {
          summary += `- ${todo.content}\n`;
        });
        // All pending tasks are now included
        summary += '\n';
      }
    }
    
    // Git status
    summary += `### Git Status\n\n`;
    summary += `- **Files Changed**: ${gitStatus.filesChanged}\n`;
    summary += `- **Additions**: +${gitStatus.additions}\n`;
    summary += `- **Deletions**: -${gitStatus.deletions}\n`;
    if (gitStatus.hasUncommittedChanges) {
      summary += `- **Uncommitted Changes**: Yes\n`;
    }
    summary += '\n';
    
    // Interruption info
    if (wasInterrupted) {
      summary += `### ⚠️ Session Interrupted\n\n`;
      summary += `The session was interrupted while working on the last prompt. `;
      summary += `You may need to review the partial work and continue from where it left off.\n\n`;
    }
    
    summary += `</session_context>`;
    
    return summary;
  }
}