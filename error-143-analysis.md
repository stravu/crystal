# Analysis of Sessions Exiting with Error Code 143

## Executive Summary

Error code 143 (SIGTERM) indicates that Claude Code processes were terminated, likely due to reaching context window limits or being manually stopped. This analysis examines 29 sessions that experienced this error to identify patterns and root causes.

## Key Findings

### 1. Model Distribution
- **Claude Sonnet 4**: 23 sessions (79.3%)
- **Claude Opus 4**: 5 sessions (17.2%)
- **Claude Haiku 3.5**: 1 session (3.4%)

### 2. Token Usage Patterns

#### High Token Usage Sessions
The sessions with the highest token usage before failure:
1. **session-inputbox-ux** (Opus 4): 179,717 tokens
2. **session-inputbox-ux-2** (Sonnet 4): 164,271 tokens  
3. **setting-menu** (Opus 4): 163,701 tokens
4. **eshaffer-audit** (Sonnet 4): 153,030 tokens
5. **auto-commit-modes** (Opus 4): 132,846 tokens

#### Average Token Usage by Model
- **Opus 4**: 137,019 tokens average
- **Sonnet 4**: 57,416 tokens average
- **Haiku 3.5**: 1,101 tokens average

### 3. Session Characteristics

#### Sessions with Most Messages Before Failure
1. **eshaffer-audit**: 1,391 messages
2. **archive-sessions**: 1,219 messages
3. **auto-commit-modes**: 1,018 messages
4. **session-fetch-latest**: 946 messages
5. **auto-commit-modes-2**: 895 messages

### 4. Context Window Limits

All Claude models have a 200,000 token context window. Several sessions show "Prompt is too long" errors, confirming they hit this limit:
- **dashboard-ux-2** (Opus 4): 193,451 tokens
- **session-inputbox-ux** (Opus 4): 179,717 tokens
- **output-terminal-revamp** (Opus 4): 174,054 tokens

## Root Causes

### 1. Context Window Exhaustion
The primary cause appears to be reaching the 200K token context limit. This is evidenced by:
- "Prompt is too long" errors in session outputs
- High token counts approaching 200K
- Opus 4 sessions failing at higher token counts (uses more tokens per interaction)

### 2. Long-Running Sessions
Sessions with 500+ messages are prone to context exhaustion:
- Complex refactoring tasks
- UI/UX improvements requiring many iterations
- Debugging sessions with extensive back-and-forth

### 3. Model-Specific Patterns
- **Opus 4**: More verbose responses, reaches limits faster
- **Sonnet 4**: More efficient token usage but still hits limits in long sessions
- **Haiku 3.5**: Rarely hits limits due to concise responses

## Recommendations

### 1. Implement Context Window Warnings
- Add visual indicators when approaching 80% of context limit
- Display real-time token usage in the UI
- Suggest starting new sessions at 90% usage

### 2. Session Management Improvements
- Auto-save conversation state before hitting limits
- Implement conversation summarization to compress context
- Allow easy continuation in new session with compressed history

### 3. Model Selection Guidance
- Recommend Haiku 3.5 for simple tasks to conserve tokens
- Suggest Sonnet 4 for most coding tasks (good balance)
- Reserve Opus 4 for complex architecture/refactoring

### 4. Token Tracking Enhancements
- Track context window usage separately from total tokens
- Show remaining tokens in real-time
- Implement predictive warnings based on usage patterns

## Technical Details

### Database Schema
The analysis uses these tables:
- `sessions`: Core session metadata
- `session_outputs`: All terminal output including JSON messages
- `session_token_summary`: Aggregated token usage per session
- `message_token_usage`: Per-message token tracking

### Error Detection Query
```sql
SELECT DISTINCT session_id 
FROM session_outputs 
WHERE data LIKE '%Claude Code exited with error (exit code: 143)%'
```

### Token Analysis Query
```sql
SELECT s.id, s.name, s.model, sts.total_tokens 
FROM sessions s 
LEFT JOIN session_token_summary sts ON s.id = sts.session_id 
WHERE s.id IN ([error sessions])
ORDER BY sts.total_tokens DESC
```

## Conclusion

Error code 143 is primarily caused by context window exhaustion in long-running sessions. Implementing better token tracking, warnings, and session management features will significantly improve the user experience and prevent unexpected session terminations.