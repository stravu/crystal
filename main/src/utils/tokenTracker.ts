/**
 * Token Tracking Utilities
 * Extracts and processes token usage information from Claude's JSON messages
 */

import { DatabaseService } from '../database/database';
import { getModelContextWindow } from './modelContextWindows';
import type { MessageTokenUsage, SessionTokenSummary } from '../database/models';

export interface TokenUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindowTokens?: number; // Actual context window usage from cache data
}

export interface TokenUsageWarning {
  level: 'info' | 'warning' | 'critical';
  percentage: number;
  message: string;
  tokensUsed: number;
  contextWindow: number;
}

/**
 * Extract token usage from a Claude JSON message
 * @param jsonMessage The JSON message from Claude
 * @returns Token usage data if available, null otherwise
 */
export function extractTokenUsage(jsonMessage: any): TokenUsageData | null {
  // Check if this is an assistant message with usage information
  // The usage can be directly on the message or nested inside message.usage
  if (jsonMessage.type === 'assistant') {
    // Check for nested structure (common in Crystal's stored messages)
    const usage = jsonMessage.message?.usage || jsonMessage.usage;
    
    if (usage) {
      // Claude's usage field contains input_tokens (new tokens) and output_tokens
      // Cache tokens are cumulative context state, not new tokens to add
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      
      // Calculate actual context window usage from cache data
      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const contextWindowTokens = inputTokens + cacheCreation + cacheRead;
      
      if (inputTokens > 0 || outputTokens > 0) {
        return {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          contextWindowTokens: contextWindowTokens > 0 ? contextWindowTokens : undefined
        };
      }
    }
  }
  
  // Some messages might have usage in a different format
  if (jsonMessage.type === 'system' && jsonMessage.subtype === 'result') {
    const usage = jsonMessage.message?.usage || jsonMessage.usage;
    if (usage) {
      // Only count actual new input tokens, not cumulative cache state
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      
      // Calculate context window usage for system/result messages too
      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const contextWindowTokens = inputTokens + cacheCreation + cacheRead;
      
      return {
        inputTokens,
        outputTokens,
        totalTokens: usage.total_tokens || (inputTokens + outputTokens),
        contextWindowTokens: contextWindowTokens > 0 ? contextWindowTokens : undefined
      };
    }
  }
  
  return null;
}

/**
 * Determine the message type from a JSON message
 * @param jsonMessage The JSON message from Claude
 * @returns The message type
 */
export function getMessageType(jsonMessage: any): 'user' | 'assistant' | 'system' {
  if (jsonMessage.type === 'user') return 'user';
  if (jsonMessage.type === 'assistant') return 'assistant';
  return 'system';
}

/**
 * Calculate token usage warning level based on percentage of context window used
 * @param tokensUsed Total tokens used in the session
 * @param contextWindow The model's context window size
 * @returns Warning information
 */
export function calculateTokenWarning(tokensUsed: number, contextWindow: number): TokenUsageWarning {
  const percentage = Math.round((tokensUsed / contextWindow) * 100);
  
  if (percentage >= 95) {
    return {
      level: 'critical',
      percentage,
      message: `Critical: Session is at ${percentage}% of context limit. Consider starting a new session.`,
      tokensUsed,
      contextWindow
    };
  } else if (percentage >= 80) {
    return {
      level: 'warning',
      percentage,
      message: `Warning: Session is at ${percentage}% of context limit. Approaching maximum capacity.`,
      tokensUsed,
      contextWindow
    };
  } else {
    return {
      level: 'info',
      percentage,
      message: `Using ${percentage}% of context window (${tokensUsed.toLocaleString()} / ${contextWindow.toLocaleString()} tokens)`,
      tokensUsed,
      contextWindow
    };
  }
}

/**
 * Format token count for display
 * @param tokens Number of tokens
 * @returns Formatted string
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

/**
 * Format token usage summary for display
 * @param summary Token usage summary
 * @param contextWindow Context window size
 * @returns Formatted display string
 */
export function formatTokenSummary(summary: SessionTokenSummary, contextWindow: number): string {
  const percentage = Math.round((summary.total_tokens / contextWindow) * 100);
  const remaining = contextWindow - summary.total_tokens;
  
  return `${formatTokenCount(summary.total_tokens)} / ${formatTokenCount(contextWindow)} tokens (${percentage}% used, ${formatTokenCount(remaining)} remaining)`;
}

/**
 * Estimate tokens from text (rough approximation)
 * This is a simple heuristic - actual token count may vary
 * @param text The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~1 token per 4 characters (varies by model and content)
  return Math.ceil(text.length / 4);
}

/**
 * Track token usage for a session output
 * @param db Database service instance
 * @param sessionId Session ID
 * @param outputId Output ID
 * @param jsonMessage The JSON message containing usage data
 */
export async function trackTokenUsage(
  db: DatabaseService,
  sessionId: string,
  outputId: number,
  jsonMessage: any
): Promise<void> {
  const usage = extractTokenUsage(jsonMessage);
  if (usage) {
    const messageType = getMessageType(jsonMessage);
    db.addMessageTokenUsage(
      sessionId,
      outputId,
      messageType,
      usage.inputTokens,
      usage.outputTokens
    );
    
    // Also track context window usage if available
    if (usage.contextWindowTokens !== undefined) {
      // Update the latest context window state for this session
      db.updateSessionContextWindow(sessionId, usage.contextWindowTokens);
    }
  }
}

/**
 * Calculate current context window usage for a session
 * @param db Database service instance  
 * @param sessionId Session ID
 * @param contextWindow The model's context window size
 * @returns Context window usage based on conversation tokens + estimated Claude Code overhead
 */
function getLatestContextFromResponses(db: DatabaseService, sessionId: string, contextWindow: number): number | null {
  console.log('[TokenTracker] Calculating context window usage for session:', sessionId);
  
  // Get the conversation token summary (now properly calculated without cache tokens)
  const summary = db.getSessionTokenSummary(sessionId);
  if (!summary) {
    console.log('[TokenTracker] No token summary found');
    return null;
  }
  
  const conversationTokens = summary.total_input_tokens + summary.total_output_tokens;
  
  // Dynamic Claude Code system overhead estimation based on analysis of sessions that hit context limits:
  // 
  // From analyzing 4 sessions that hit the 200K limit, we found system overhead varies with conversation size.
  // Known data points from sessions that reached exactly 200,000 tokens:
  const knownDataPoints = [
    { convTokens: 96776, overhead: 103224 },   // theme-change-3-1
    { convTokens: 119248, overhead: 80752 },   // theme-change  
    { convTokens: 124473, overhead: 75527 },   // auto-commit-modes-2
    { convTokens: 163992, overhead: 36008 }    // theme-change-2
  ];
  
  // Find the closest data point(s) to interpolate from
  let estimatedSystemOverhead: number;
  
  if (conversationTokens <= knownDataPoints[0].convTokens) {
    // Smaller than our smallest sample - use the ratio from smallest sample
    const ratio = knownDataPoints[0].overhead / knownDataPoints[0].convTokens;
    estimatedSystemOverhead = Math.round(conversationTokens * ratio);
  } else if (conversationTokens >= knownDataPoints[knownDataPoints.length - 1].convTokens) {
    // Larger than our largest sample - use the ratio from largest sample
    const ratio = knownDataPoints[knownDataPoints.length - 1].overhead / knownDataPoints[knownDataPoints.length - 1].convTokens;
    estimatedSystemOverhead = Math.round(conversationTokens * ratio);
  } else {
    // Interpolate between the two closest data points
    let lowerPoint = knownDataPoints[0];
    let upperPoint = knownDataPoints[1];
    
    for (let i = 0; i < knownDataPoints.length - 1; i++) {
      if (conversationTokens >= knownDataPoints[i].convTokens && conversationTokens <= knownDataPoints[i + 1].convTokens) {
        lowerPoint = knownDataPoints[i];
        upperPoint = knownDataPoints[i + 1];
        break;
      }
    }
    
    // Linear interpolation
    const ratio = (conversationTokens - lowerPoint.convTokens) / (upperPoint.convTokens - lowerPoint.convTokens);
    estimatedSystemOverhead = Math.round(lowerPoint.overhead + ratio * (upperPoint.overhead - lowerPoint.overhead));
  }
  
  const estimatedContext = conversationTokens + estimatedSystemOverhead;
  
  console.log('[TokenTracker] Context calculation:', {
    conversationTokens,
    estimatedSystemOverhead,
    estimatedContext,
    contextWindow,
    sessionId
  });
  
  return estimatedContext;
}

/**
 * Get session token usage with context window information
 * @param db Database service instance
 * @param sessionId Session ID
 * @param modelName Model name
 * @returns Token usage with context information
 */
export function getSessionTokenUsageWithContext(
  db: DatabaseService,
  sessionId: string,
  modelName: string
): {
  summary: SessionTokenSummary | null;
  contextWindow: number;
  warning: TokenUsageWarning | null;
  currentContextUsage?: number | null;
} {
  console.log('[TokenTracker] Getting token usage for session:', sessionId, 'model:', modelName);
  
  const summary = db.getSessionTokenSummary(sessionId);
  console.log('[TokenTracker] Summary from DB:', summary);
  
  const contextWindow = getModelContextWindow(modelName);
  console.log('[TokenTracker] Context window for model:', contextWindow);
  
  // Get the latest context window usage from the most recent Claude response
  console.log('[TokenTracker] Getting latest context window usage for session:', sessionId);
  const latestContextUsage = getLatestContextFromResponses(db, sessionId, contextWindow);
  console.log('[TokenTracker] Latest context usage from responses:', latestContextUsage, typeof latestContextUsage);
  
  let warning: TokenUsageWarning | null = null;
  const tokensForWarning = latestContextUsage || (summary?.total_tokens || 0);
  
  if (tokensForWarning > 0) {
    warning = calculateTokenWarning(tokensForWarning, contextWindow);
    console.log('[TokenTracker] Warning calculated:', warning);
  }
  
  const result = {
    summary: summary || null,
    contextWindow,
    warning,
    currentContextUsage: latestContextUsage
  };
  
  console.log('[TokenTracker] Returning result:', result);
  return result;
}