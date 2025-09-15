# Codex CLI Configuration for Crystal

## Overview

The Codex CLI integration for Crystal provides access to OpenAI's advanced language models through a protocol-based interface. By default, Codex uses **GPT-5** (released August 7, 2025), which offers significant improvements in reasoning, speed, and capabilities.

## Default Configuration

The Codex manager uses the following defaults:

- **Model**: `gpt-5` (OpenAI's latest model, released August 7, 2025)
- **Provider**: `openai`
- **Sandbox Mode**: `workspace-write` (safe workspace access)
- **Approval Policy**: `on-request` (requires user approval for actions)
- **Agent Reasoning**: Visible by default for transparency

## Model Selection

While GPT-5 is the default, you can specify other models:

```typescript
// Use GPT-5 (default, released August 7, 2025)
await manager.startPanel(panelId, sessionId, worktreePath, prompt);

// Or explicitly specify GPT-5
await manager.startPanel(panelId, sessionId, worktreePath, prompt, 'gpt-5');

// Use other models if needed
await manager.startPanel(panelId, sessionId, worktreePath, prompt, 'gpt-4');
await manager.startPanel(panelId, sessionId, worktreePath, prompt, 'claude-3-5-sonnet');
```

## API Configuration

Set your API keys as environment variables:

```bash
export OPENAI_API_KEY=your-api-key-here
export GEMINI_API_KEY=your-gemini-key-here  # Optional
export ANTHROPIC_API_KEY=your-anthropic-key-here  # Optional
```

## GPT-5 Advantages

GPT-5 (released August 7, 2025) provides:

- **Enhanced Reasoning**: Superior logical reasoning and problem-solving
- **Larger Context Window**: 272,000 tokens for extensive code understanding
- **Faster Response Times**: Optimized for real-time coding assistance
- **Better Code Generation**: More accurate and idiomatic code output
- **Improved Safety**: Better alignment and reduced harmful outputs

## Protocol Communication

The Codex manager communicates using JSON-RPC protocol:

```json
// User input
{"id":"msg-1","op":{"type":"user_input","items":[{"type":"text","text":"Your prompt"}]}}

// Session configuration response
{"id":"","msg":{"type":"session_configured","model":"gpt-5","session_id":"..."}}

// Agent response
{"id":"msg-1","msg":{"type":"agent_message","message":"Response from GPT-5..."}}
```

## Troubleshooting

If Codex reports an unsupported model error:
1. Verify your API key is valid
2. Check that your account has access to GPT-5 (available since August 7, 2025)
3. Try falling back to GPT-4 if needed

## Future Enhancements

With GPT-5's improved capabilities, future updates may include:
- Better conversation history management
- Enhanced multi-turn reasoning
- Improved code refactoring suggestions
- Advanced debugging assistance