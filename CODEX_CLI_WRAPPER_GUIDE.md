# Codex CLI Wrapper Implementation Guide

A comprehensive, language-agnostic guide for building a wrapper around the Codex CLI to integrate AI assistance into your application.

## Table of Contents
1. [Overview](#overview)
2. [Installation & Discovery](#installation--discovery)
3. [Command Construction](#command-construction)
4. [Communication Protocol](#communication-protocol)
5. [Event Types Reference](#event-types-reference)
6. [Implementation Examples](#implementation-examples)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

## Overview

The Codex CLI provides AI assistance through a subprocess interface using JSON-RPC over stdin/stdout. The `proto` subcommand enables bidirectional communication without HTTP, allowing real-time streaming and interactive sessions.

### Architecture
```
Your Application → Codex CLI Process → AI Provider (OpenAI/Gemini/etc)
     ↓                    ↑
   JSON/stdin        JSON Events/stdout
```

## Installation & Discovery

### Installing Codex CLI

```bash
# NPM (global)
npm install -g @openai/codex

# Bun (global)
bun add -g @openai/codex

# Direct binary download
# Platform-specific binaries available at:
# - codex-aarch64-apple-darwin (macOS ARM)
# - codex-x86_64-apple-darwin (macOS Intel)
# - codex-x86_64-unknown-linux-musl (Linux x64)
# - codex-aarch64-unknown-linux-musl (Linux ARM)
# - codex-x86_64-pc-windows-msvc.exe (Windows)
```

### Binary Discovery Locations

Search for the Codex executable in this order:

1. **Environment Variable Override**
   ```
   $CODEX_PATH
   ```

2. **Package Manager Installations**
   ```
   # Bun
   ~/.bun/install/global/node_modules/@openai/codex/bin/codex-[platform]
   
   # NPM (user)
   ~/.local/share/npm/lib/node_modules/@openai/codex/bin/codex-[platform]
   
   # NPM (system)
   /usr/local/lib/node_modules/@openai/codex/bin/codex-[platform]
   /opt/homebrew/lib/node_modules/@openai/codex/bin/codex-[platform]
   
   # Windows NPM
   %APPDATA%/npm/codex.cmd
   %APPDATA%/npm/codex.ps1
   ```

3. **Native Binary Locations**
   ```
   ~/.cargo/bin/codex
   /usr/local/bin/codex
   /opt/homebrew/bin/codex
   ```

4. **System PATH**
   ```
   Search $PATH (or %PATH% on Windows)
   ```

### Verification

```bash
# Check if codex is available
codex --version

# View available commands
codex --help

# Test proto mode
echo '{"id":"test","op":{"type":"shutdown"}}' | codex proto
```

## Command Construction

### Basic Command

```bash
codex proto [OPTIONS]
```

### Configuration Options

All configuration is passed via `-c` flags:

```bash
codex proto \
  -c key=value \
  -c nested.key=value \
  -c 'array_key=["item1","item2"]'
```

### Essential Configuration Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `model` | string | AI model to use | `gpt-4o`, `gpt-4o-mini`, `o3-mini` |
| `model_provider` | string | Provider name | `openai`, `gemini`, `oss`, `openrouter` |
| `base_url` | string | Custom API endpoint | `https://api.openai.com/v1` |
| `cwd` | string | Working directory | `/path/to/project` |
| `show_raw_agent_reasoning` | bool | Enable streaming deltas | `true` |
| `model_reasoning_effort` | string | Reasoning level | `low`, `medium`, `high` |
| `model_reasoning_summary` | string | Summary mode | `auto`, `always`, `never` |
| `sandbox_mode` | string | File system access | `read-only`, `workspace-write`, `danger-full-access` |
| `approval_policy` | string | Approval mode | `auto`, `manual` |
| `tools.web_search` | bool | Enable web search | `true` |
| `experimental_resume` | string | Resume from file | `/path/to/rollout.json` |

### Environment Variables

API keys are passed via environment variables:

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Ollama | `OLLAMA_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |

### Complete Example Command

```bash
OPENAI_API_KEY=sk-... \
PATH=$PATH \
codex proto \
  -c model="gpt-4o" \
  -c model_provider="openai" \
  -c cwd="/home/user/project" \
  -c show_raw_agent_reasoning=true \
  -c model_reasoning_effort="high" \
  -c sandbox_mode="workspace-write" \
  -c approval_policy="manual" \
  -c tools.web_search=true
```

## Communication Protocol

### Sending Messages (stdin)

Messages are sent as single-line JSON to stdin:

#### User Input
```json
{
  "id": "unique-id-123",
  "op": {
    "type": "user_input",
    "items": [
      {
        "type": "text",
        "text": "Write a hello world program"
      }
    ]
  }
}
```

#### With Image
```json
{
  "id": "unique-id-124",
  "op": {
    "type": "user_input",
    "items": [
      {
        "type": "text",
        "text": "What's in this image?"
      },
      {
        "type": "image",
        "image_url": "data:image/png;base64,..."
      }
    ]
  }
}
```

#### Interrupt Current Operation
```json
{
  "id": "unique-id-125",
  "op": {
    "type": "interrupt"
  }
}
```

#### Approve/Deny Execution
```json
{
  "id": "unique-id-126",
  "op": {
    "type": "exec_approval",
    "id": "call-id-from-request",
    "decision": "approved"
  }
}
```

#### Approve/Deny File Changes
```json
{
  "id": "unique-id-127",
  "op": {
    "type": "patch_approval",
    "id": "call-id-from-request",
    "decision": "denied"
  }
}
```

#### Shutdown Session
```json
{
  "id": "unique-id-128",
  "op": {
    "type": "shutdown"
  }
}
```

### Receiving Events (stdout)

Events are streamed as single-line JSON from stdout:

## Event Types Reference

### Session Events

#### session_configured
```json
{
  "id": "evt-001",
  "msg": {
    "type": "session_configured",
    "session_id": "session-123",
    "model": "gpt-4o",
    "history_log_id": 42,
    "history_entry_count": 10
  }
}
```

#### task_started
```json
{
  "id": "evt-002",
  "msg": {
    "type": "task_started"
  }
}
```

#### task_complete
```json
{
  "id": "evt-003",
  "msg": {
    "type": "task_complete",
    "response_id": "resp-123",
    "last_agent_message": "Task completed successfully."
  }
}
```

### Message Events

#### agent_message
Complete message (non-streaming):
```json
{
  "id": "evt-004",
  "msg": {
    "type": "agent_message",
    "message": "I'll help you with that task.",
    "last_agent_message": "I'll help you with that task."
  }
}
```

#### agent_message_delta
Streaming message chunk:
```json
{
  "id": "evt-005",
  "msg": {
    "type": "agent_message_delta",
    "delta": "I'll help"
  }
}
```

### Approval Request Events

#### exec_approval_request
Request to execute a command:
```json
{
  "id": "evt-006",
  "msg": {
    "type": "exec_approval_request",
    "call_id": "exec-123",
    "command": ["npm", "install", "express"],
    "cwd": "/home/user/project"
  }
}
```

#### apply_patch_approval_request
Request to modify files:
```json
{
  "id": "evt-007",
  "msg": {
    "type": "apply_patch_approval_request",
    "call_id": "patch-123",
    "changes": {
      "files": [
        {
          "path": "main.js",
          "action": "modify",
          "diff": "--- a/main.js\n+++ b/main.js\n@@ -1 +1 @@\n-console.log('old');\n+console.log('new');"
        }
      ]
    },
    "reason": "Adding hello world output",
    "grant_root": "/home/user/project"
  }
}
```

### Execution Events

#### exec_command_begin
Command execution started:
```json
{
  "id": "evt-008",
  "msg": {
    "type": "exec_command_begin",
    "call_id": "exec-123",
    "command": ["npm", "test"],
    "cwd": "/home/user/project"
  }
}
```

#### exec_command_output_delta
Streaming command output:
```json
{
  "id": "evt-009",
  "msg": {
    "type": "exec_command_output_delta",
    "call_id": "exec-123",
    "stream": "stdout",
    "chunk": [84, 101, 115, 116, 32, 112, 97, 115, 115, 101, 100]
  }
}
```

#### exec_command_end
Command execution completed:
```json
{
  "id": "evt-010",
  "msg": {
    "type": "exec_command_end",
    "call_id": "exec-123",
    "stdout": "All tests passed!",
    "stderr": "",
    "exit_code": 0
  }
}
```

### Reasoning Events

#### agent_reasoning
Complete reasoning (non-streaming):
```json
{
  "id": "evt-011",
  "msg": {
    "type": "agent_reasoning",
    "reasoning": "The user wants a hello world program..."
  }
}
```

#### agent_reasoning_delta
Streaming reasoning chunk:
```json
{
  "id": "evt-012",
  "msg": {
    "type": "agent_reasoning_delta",
    "delta": "Analyzing the"
  }
}
```

### Diff Events

#### turn_diff
Shows file changes for current turn:
```json
{
  "id": "evt-013",
  "msg": {
    "type": "turn_diff",
    "unified_diff": "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old content\n+new content"
  }
}
```

### Error Events

#### error
Error occurred:
```json
{
  "id": "evt-014",
  "msg": {
    "type": "error",
    "message": "Failed to connect to API: rate limit exceeded"
  }
}
```

### Other Events

#### shutdown_complete
Clean shutdown confirmed:
```json
{
  "id": "evt-015",
  "msg": {
    "type": "shutdown_complete"
  }
}
```

## Implementation Examples

### Python Wrapper

```python
import subprocess
import json
import threading
from queue import Queue

class CodexWrapper:
    def __init__(self, config):
        self.config = config
        self.process = None
        self.event_queue = Queue()
        
    def start(self):
        cmd = ['codex', 'proto']
        
        # Add configuration
        for key, value in self.config.items():
            if isinstance(value, bool):
                value = 'true' if value else 'false'
            elif isinstance(value, (list, dict)):
                value = json.dumps(value)
            cmd.extend(['-c', f'{key}={value}'])
        
        # Set environment
        env = os.environ.copy()
        env['OPENAI_API_KEY'] = self.api_key
        
        # Start process
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True
        )
        
        # Start output reader thread
        threading.Thread(target=self._read_output, daemon=True).start()
    
    def _read_output(self):
        for line in self.process.stdout:
            if line.strip():
                try:
                    event = json.loads(line)
                    self.event_queue.put(event)
                except json.JSONDecodeError:
                    print(f"Invalid JSON: {line}")
    
    def send_message(self, text):
        msg = {
            "id": str(uuid.uuid4()),
            "op": {
                "type": "user_input",
                "items": [{"type": "text", "text": text}]
            }
        }
        self.process.stdin.write(json.dumps(msg) + '\n')
        self.process.stdin.flush()
    
    def get_events(self):
        events = []
        while not self.event_queue.empty():
            events.append(self.event_queue.get())
        return events
```

### Node.js Wrapper

```javascript
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class CodexWrapper extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.process = null;
    this.buffer = '';
  }

  start() {
    const args = ['proto'];
    
    // Add configuration
    Object.entries(this.config).forEach(([key, value]) => {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      args.push('-c', `${key}=${value}`);
    });
    
    // Start process
    this.process = spawn('codex', args, {
      env: {
        ...process.env,
        OPENAI_API_KEY: this.apiKey
      }
    });
    
    // Handle stdout
    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
    
    // Handle stderr
    this.process.stderr.on('data', (data) => {
      console.error('Codex stderr:', data.toString());
    });
  }
  
  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    lines.forEach(line => {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          this.handleEvent(event);
        } catch (e) {
          console.error('Invalid JSON:', line);
        }
      }
    });
  }
  
  handleEvent(event) {
    switch (event.msg.type) {
      case 'agent_message_delta':
        this.emit('delta', event.msg.delta);
        break;
      case 'exec_approval_request':
        this.emit('approval_needed', event.msg);
        break;
      case 'error':
        this.emit('error', event.msg.message);
        break;
      default:
        this.emit('event', event);
    }
  }
  
  sendMessage(text) {
    const msg = {
      id: generateId(),
      op: {
        type: 'user_input',
        items: [{ type: 'text', text }]
      }
    };
    
    this.process.stdin.write(JSON.stringify(msg) + '\n');
  }
}
```

### Go Wrapper

```go
package codex

import (
    "bufio"
    "encoding/json"
    "fmt"
    "os/exec"
    "github.com/google/uuid"
)

type CodexWrapper struct {
    Config  map[string]interface{}
    process *exec.Cmd
    stdin   io.WriteCloser
    Events  chan Event
}

func (c *CodexWrapper) Start() error {
    args := []string{"proto"}
    
    // Add configuration
    for key, value := range c.Config {
        var valueStr string
        switch v := value.(type) {
        case bool:
            valueStr = fmt.Sprintf("%t", v)
        case string:
            valueStr = v
        default:
            b, _ := json.Marshal(v)
            valueStr = string(b)
        }
        args = append(args, "-c", fmt.Sprintf("%s=%s", key, valueStr))
    }
    
    // Create command
    c.process = exec.Command("codex", args...)
    c.process.Env = append(os.Environ(), "OPENAI_API_KEY="+c.apiKey)
    
    // Get pipes
    stdin, _ := c.process.StdinPipe()
    stdout, _ := c.process.StdoutPipe()
    c.stdin = stdin
    
    // Start process
    if err := c.process.Start(); err != nil {
        return err
    }
    
    // Read output
    go c.readOutput(stdout)
    
    return nil
}

func (c *CodexWrapper) readOutput(stdout io.Reader) {
    scanner := bufio.NewScanner(stdout)
    for scanner.Scan() {
        var event Event
        if err := json.Unmarshal(scanner.Bytes(), &event); err == nil {
            c.Events <- event
        }
    }
}

func (c *CodexWrapper) SendMessage(text string) error {
    msg := Message{
        ID: uuid.New().String(),
        Op: Operation{
            Type: "user_input",
            Items: []Item{{Type: "text", Text: text}},
        },
    }
    
    data, _ := json.Marshal(msg)
    _, err := c.stdin.Write(append(data, '\n'))
    return err
}
```

## Error Handling

### Process Startup Errors

1. **Codex not found**: Binary discovery failed
   - Solution: Check installation, set `CODEX_PATH` environment variable

2. **Process exits immediately**: Invalid configuration
   - Solution: Check command arguments, verify API keys

3. **Permission denied**: Insufficient permissions
   - Solution: Check file permissions, ensure execute permission on binary

### Runtime Errors

1. **API Key Issues**
   ```json
   {"msg": {"type": "error", "message": "Invalid API key"}}
   ```
   - Solution: Verify environment variable is set correctly

2. **Rate Limiting**
   ```json
   {"msg": {"type": "error", "message": "Rate limit exceeded"}}
   ```
   - Solution: Implement backoff, reduce request frequency

3. **Network Errors**
   ```json
   {"msg": {"type": "error", "message": "Network error: connection timeout"}}
   ```
   - Solution: Check network connectivity, retry with exponential backoff

### Parsing Errors

1. **Invalid JSON from stdout**: Partial message or corruption
   - Solution: Buffer lines, only parse complete lines

2. **Unexpected event types**: New event types in updates
   - Solution: Implement default handler for unknown events

## Best Practices

### 1. Process Management

- **Health Monitoring**: Check process is alive periodically
- **Graceful Shutdown**: Send shutdown op before killing process
- **Resource Cleanup**: Close pipes and wait for process exit

```python
def shutdown(self):
    # Send shutdown command
    self.send_op({"type": "shutdown"})
    
    # Wait for confirmation or timeout
    timeout = 5
    start = time.time()
    while time.time() - start < timeout:
        event = self.get_event()
        if event and event['msg']['type'] == 'shutdown_complete':
            break
        time.sleep(0.1)
    
    # Force kill if needed
    if self.process.poll() is None:
        self.process.terminate()
        self.process.wait(timeout=2)
```

### 2. Event Handling

- **Queue Events**: Use thread-safe queue for events
- **Streaming Assembly**: Accumulate deltas for complete messages
- **Event Routing**: Route events to appropriate handlers

```javascript
class MessageAssembler {
  constructor() {
    this.currentMessage = '';
    this.isStreaming = false;
  }
  
  handleEvent(event) {
    switch (event.msg.type) {
      case 'agent_message_delta':
        this.currentMessage += event.msg.delta;
        this.isStreaming = true;
        this.onPartialMessage(this.currentMessage);
        break;
        
      case 'agent_message':
        this.currentMessage = event.msg.message;
        this.isStreaming = false;
        this.onCompleteMessage(this.currentMessage);
        this.currentMessage = '';
        break;
    }
  }
}
```

### 3. Approval Handling

- **User Prompting**: Present approval requests clearly
- **Timeout Handling**: Auto-deny after timeout for security
- **Audit Logging**: Log all approval decisions

```python
async def handle_approval_request(self, event):
    msg = event['msg']
    
    if msg['type'] == 'exec_approval_request':
        # Show command to user
        approved = await self.prompt_user(
            f"Execute: {' '.join(msg['command'])} in {msg['cwd']}?"
        )
        
        # Send decision
        self.send_op({
            "type": "exec_approval",
            "id": msg['call_id'],
            "decision": "approved" if approved else "denied"
        })
        
        # Log decision
        self.audit_log.write({
            'timestamp': datetime.now(),
            'type': 'exec_approval',
            'command': msg['command'],
            'decision': approved
        })
```

### 4. Configuration Management

- **Provider Detection**: Auto-detect provider from model name
- **Environment Mapping**: Map providers to correct env variables
- **Validation**: Validate configuration before starting

```javascript
const providerConfig = {
  'gpt-4o': {
    provider: 'openai',
    envKey: 'OPENAI_API_KEY'
  },
  'gemini-pro': {
    provider: 'gemini',
    envKey: 'GEMINI_API_KEY'
  },
  'llama-3': {
    provider: 'oss',
    envKey: 'OLLAMA_API_KEY'
  }
};

function getProviderConfig(model) {
  for (const [pattern, config] of Object.entries(providerConfig)) {
    if (model.includes(pattern)) {
      return config;
    }
  }
  return { provider: 'openai', envKey: 'OPENAI_API_KEY' };
}
```

### 5. Performance Optimization

- **Buffering**: Buffer stdin writes for efficiency
- **Debouncing**: Debounce rapid UI updates from deltas
- **Lazy Loading**: Only start process when needed

### 6. Security Considerations

- **Sandbox Mode**: Default to restrictive sandbox settings
- **Input Validation**: Validate all user input before sending
- **Process Isolation**: Run each session in separate process
- **API Key Protection**: Never log or expose API keys

```python
# Secure configuration
secure_config = {
    'sandbox_mode': 'workspace-write',  # Not 'danger-full-access'
    'approval_policy': 'manual',        # Not 'auto'
    'cwd': '/safe/working/directory',   # Restricted directory
}
```

## Testing Your Wrapper

### Basic Test Script

```bash
#!/bin/bash

# Test 1: Check codex availability
if ! command -v codex &> /dev/null; then
    echo "❌ Codex not found"
    exit 1
fi

# Test 2: Simple echo test
echo '{"id":"test1","op":{"type":"user_input","items":[{"type":"text","text":"Say hello"}]}}' | \
    OPENAI_API_KEY=$KEY codex proto -c model="gpt-4o-mini" | \
    grep -q "agent_message" && echo "✅ Basic communication works"

# Test 3: Shutdown test  
(echo '{"id":"test2","op":{"type":"shutdown"}}' | \
    codex proto) | grep -q "shutdown_complete" && \
    echo "✅ Shutdown works"
```

### Integration Test

```python
def test_wrapper():
    # Initialize wrapper
    wrapper = CodexWrapper({
        'model': 'gpt-4o-mini',
        'model_provider': 'openai',
        'show_raw_agent_reasoning': True
    })
    
    # Start process
    wrapper.start()
    
    # Send test message
    wrapper.send_message("What is 2+2?")
    
    # Collect response
    response = ""
    timeout = 30
    start = time.time()
    
    while time.time() - start < timeout:
        events = wrapper.get_events()
        for event in events:
            if event['msg']['type'] == 'agent_message_delta':
                response += event['msg']['delta']
            elif event['msg']['type'] == 'agent_message':
                response = event['msg']['message']
                break
        
        if response and "4" in response:
            print("✅ Test passed")
            break
    
    # Cleanup
    wrapper.shutdown()
```

## Troubleshooting

### Common Issues

1. **No output from process**
   - Check stderr for errors
   - Verify API key is set
   - Try running command manually

2. **JSON parsing errors**
   - Ensure reading line-by-line
   - Handle partial lines with buffering
   - Log raw output for debugging

3. **Process hangs**
   - Check if waiting for approval
   - Verify stdin is being flushed
   - Monitor process CPU/memory usage

4. **Unexpected disconnections**
   - Implement reconnection logic
   - Save session state for resume
   - Handle process crashes gracefully

### Debug Mode

Enable verbose logging by setting environment:

```bash
DEBUG=1 CODEX_LOG_LEVEL=debug your-wrapper-app
```

Or add to process environment:

```python
env = {
    'DEBUG': '1',
    'CODEX_LOG_LEVEL': 'debug',
    'OPENAI_API_KEY': api_key
}
```

## Conclusion

This guide provides everything needed to build a robust wrapper around the Codex CLI. The key points:

1. Use `codex proto` for bidirectional JSON-RPC communication
2. Configure via `-c` flags and environment variables
3. Handle events asynchronously with proper buffering
4. Implement approval flows for security
5. Manage process lifecycle carefully

For additional features or provider-specific configurations, refer to the Codex CLI documentation or explore the available configuration options with `codex proto --help`.