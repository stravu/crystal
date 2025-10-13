# Session Output Handling System

⚠️ **WARNING**: The session output handling system is complex and fragile. Modifying it frequently causes issues like duplicate messages, disappearing content, or blank screens. Any changes require explicit user permission.

## How It Works

### 1. Database Storage

- Raw JSON messages from Claude are stored as-is in the database
- Stdout/stderr outputs are stored directly
- No formatting or transformation happens at storage time

### 2. Real-time Streaming

- When Claude outputs data, it's saved to the database immediately
- For JSON messages, a formatted stdout version is sent to the frontend for the Output view
- The original JSON is also sent for the Messages view
- This provides immediate visual feedback during active sessions

### 3. Session Loading

- When navigating to a session, outputs are loaded from the database
- The `sessions:get-output` handler transforms JSON messages to formatted stdout on-the-fly
- Uses `setSessionOutputs` for atomic updates to prevent race conditions

### 4. Frontend Display

- The useSessionView hook manages session view logic and state (extracted from SessionView component)
- A mutex lock (`loadingRef`) prevents concurrent loads
- Timing is carefully managed with `requestAnimationFrame` and delays
- The `formattedOutput` state is NOT cleared on session switch - it updates naturally

### 5. Key Principles

- Database is the single source of truth
- Transformations happen on-the-fly, not at storage time
- Real-time updates supplement but don't replace database data
- Session switches always reload from database to ensure consistency

## Common Issues and Solutions

- **Duplicate messages**: Usually caused by sending both formatted and raw versions
- **Disappearing content**: Often due to clearing output states at the wrong time
- **Black screens**: Typically from race conditions during session switching
- **Content only loads once**: Results from improper state management or missing dependencies

The current implementation carefully balances real-time updates with data persistence to provide a smooth user experience.
