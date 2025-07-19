# Crystal Architecture Documentation

## Overview

Crystal is an Electron desktop application that manages multiple Claude Code instances using git worktrees. This document visualizes the architecture using Mermaid diagrams.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Electron Application"
        subgraph "Renderer Process"
            UI[React UI]
            Store[Zustand Store]
            Terminal[XTerm.js Terminal]
        end
        
        subgraph "Main Process"
            IPC[IPC Handlers]
            API[Express API Server]
            DB[(SQLite Database)]
            Queue[Bull Task Queue]
            Sessions[Session Manager]
            Git[Git Manager]
        end
        
        UI <--> IPC
        Store <--> IPC
        Terminal <--> IPC
        
        IPC <--> API
        IPC <--> Sessions
        IPC <--> Git
        
        API <--> DB
        API <--> Queue
        Sessions <--> DB
        Git <--> DB
    end
    
    subgraph "External Processes"
        Claude1[Claude Code Instance 1]
        Claude2[Claude Code Instance 2]
        Claude3[Claude Code Instance N]
        
        Worktree1[Git Worktree 1]
        Worktree2[Git Worktree 2]
        Worktree3[Git Worktree N]
    end
    
    Sessions --> Claude1
    Sessions --> Claude2
    Sessions --> Claude3
    
    Claude1 --> Worktree1
    Claude2 --> Worktree2
    Claude3 --> Worktree3
```

## Component Flow

```mermaid
flowchart LR
    User[User] --> UI[UI Components]
    UI --> Action[User Action]
    
    Action --> IPC{IPC Router}
    
    IPC -->|Session Ops| SessionHandler[Session Handler]
    IPC -->|Git Ops| GitHandler[Git Handler]
    IPC -->|Config| ConfigHandler[Config Handler]
    
    SessionHandler --> DB[(Database)]
    GitHandler --> Git[Git Commands]
    ConfigHandler --> Store[Electron Store]
    
    SessionHandler --> Claude[Claude Process]
    Claude --> Output[Terminal Output]
    Output --> WS[WebSocket/IPC]
    WS --> UI
```

## Database Schema

```mermaid
erDiagram
    projects ||--o{ sessions : has
    sessions ||--o{ session_outputs : generates
    sessions ||--o{ conversation_messages : contains
    sessions ||--o{ execution_diffs : tracks
    sessions ||--o{ prompt_markers : marks
    
    projects {
        int id PK
        string name
        string path
        string system_prompt
        string run_script
        string main_branch
        timestamp created_at
        timestamp updated_at
    }
    
    sessions {
        int id PK
        int project_id FK
        string name
        string prompt
        string status
        string worktree_path
        string branch_name
        boolean archived
        timestamp created_at
        timestamp updated_at
    }
    
    session_outputs {
        int id PK
        int session_id FK
        string type
        text data
        timestamp timestamp
    }
    
    conversation_messages {
        int id PK
        int session_id FK
        string role
        text content
        int message_order
        timestamp timestamp
    }
    
    execution_diffs {
        int id PK
        int session_id FK
        text diff_content
        json file_stats
        timestamp timestamp
    }
    
    prompt_markers {
        int id PK
        int session_id FK
        string prompt_text
        int output_index
        timestamp timestamp
        timestamp completion_timestamp
    }
```

## Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: User creates session
    Created --> Initializing: Start worktree setup
    Initializing --> Running: Claude Code started
    Running --> Waiting: Needs user input
    Waiting --> Running: User provides input
    Running --> Completed: Task finished
    Running --> Error: Process failed
    Waiting --> Stopped: User stops
    Running --> Stopped: User stops
    Completed --> Archived: User archives
    Error --> Archived: User archives
    Stopped --> Archived: User archives
    Archived --> [*]
```

## IPC Communication Flow

```mermaid
sequenceDiagram
    participant UI as Frontend UI
    participant IPC as IPC Handler
    participant Main as Main Process
    participant DB as Database
    participant Claude as Claude Process
    
    UI->>IPC: Create Session Request
    IPC->>Main: Validate & Process
    Main->>DB: Store Session Data
    Main->>Main: Create Git Worktree
    Main->>Claude: Spawn Claude Process
    Claude-->>Main: Process Started
    Main->>DB: Update Session Status
    Main-->>IPC: Session Created
    IPC-->>UI: Update UI
    
    loop Real-time Output
        Claude->>Main: Output Data
        Main->>DB: Store Output
        Main->>IPC: Stream Output
        IPC->>UI: Display in Terminal
    end
```

## Frontend Component Hierarchy

```mermaid
graph TD
    App[App Component]
    App --> Sidebar[Sidebar]
    App --> Main[Main Content Area]
    
    Sidebar --> ProjectSelector[Project Selector]
    Sidebar --> SessionList[Session List]
    Sidebar --> PromptHistory[Prompt History]
    
    SessionList --> SessionItem[Session Item]
    SessionItem --> StatusBadge[Status Badge]
    SessionItem --> Actions[Session Actions]
    
    Main --> SessionView[Session View]
    SessionView --> Tabs[View Tabs]
    SessionView --> Terminal[Terminal Display]
    SessionView --> Input[Input Area]
    
    Tabs --> OutputView[Output View]
    Tabs --> MessagesView[Messages View]
    Tabs --> DiffView[Diff View]
    Tabs --> TerminalView[Terminal View]
```

## Data Flow for Session Output

```mermaid
flowchart TD
    Claude[Claude Process] --> Raw[Raw Output]
    Raw --> Parse{Parse Output}
    
    Parse -->|JSON Message| Format[Format for Display]
    Parse -->|Stdout/Stderr| Direct[Direct Display]
    
    Format --> Store[(Database)]
    Direct --> Store
    
    Store --> Load{Load Session}
    Load --> Transform[Transform JSON to Stdout]
    Transform --> Display[Display in Terminal]
    
    subgraph "Real-time Updates"
        Raw --> Stream[WebSocket Stream]
        Stream --> LiveDisplay[Live Terminal Update]
    end
```

## Git Operations Flow

```mermaid
flowchart LR
    UI[User Interface] --> GitOp{Git Operation}
    
    GitOp -->|Rebase| RebaseFlow
    GitOp -->|Squash| SquashFlow
    GitOp -->|Diff| DiffFlow
    
    subgraph RebaseFlow[Rebase from Main]
        Fetch[git fetch origin]
        Fetch --> Rebase[git rebase origin/main]
        Rebase --> UpdateDB[Update Database]
    end
    
    subgraph SquashFlow[Squash and Rebase]
        Reset[git reset --soft origin/main]
        Reset --> Commit[git commit]
        Commit --> UpdateDB2[Update Database]
    end
    
    subgraph DiffFlow[View Diff]
        DiffCmd[git diff origin/main]
        DiffCmd --> ParseDiff[Parse Diff Output]
        ParseDiff --> StoreDiff[Store in Database]
        StoreDiff --> DisplayDiff[Display in UI]
    end
```

## Task Queue Processing

```mermaid
flowchart TD
    Request[API Request] --> Queue{Task Queue}
    
    Queue --> Job1[Session Creation Job]
    Queue --> Job2[Git Operation Job]
    Queue --> Job3[Cleanup Job]
    
    Job1 --> Process1[Create Worktree]
    Process1 --> Start1[Start Claude]
    Start1 --> Update1[Update Database]
    
    Job2 --> Process2[Execute Git Command]
    Process2 --> Update2[Update Database]
    
    Job3 --> Process3[Remove Worktree]
    Process3 --> Update3[Archive Session]
    
    Update1 --> Event1[Emit Event]
    Update2 --> Event2[Emit Event]
    Update3 --> Event3[Emit Event]
    
    Event1 --> UI[Update UI]
    Event2 --> UI
    Event3 --> UI
```

## Module Dependencies

```mermaid
graph TD
    subgraph "Main Process Modules"
        Index[index.ts] --> IPC[IPC Handlers]
        Index --> Events[events.ts]
        
        IPC --> GitIPC[ipc/git.ts]
        IPC --> SessionIPC[ipc/session.ts]
        
        GitIPC --> GitManager[GitManager]
        SessionIPC --> SessionManager[SessionManager]
        
        SessionManager --> DB[Database]
        SessionManager --> ClaudeManager[ClaudeManager]
        
        GitManager --> DB
        
        Events --> SessionManager
        Events --> GitManager
    end
    
    subgraph "Frontend Modules"
        App[App.tsx] --> SessionView[SessionView.tsx]
        SessionView --> UseSessionView[useSessionView.ts]
        
        UseSessionView --> Store[Zustand Stores]
        UseSessionView --> Utils[Utils]
        
        App --> Sidebar[Sidebar Components]
        Sidebar --> Store
    end
```

## Security & Isolation

```mermaid
flowchart TB
    subgraph "Security Boundaries"
        subgraph "Renderer Process"
            UI[UI Components]
            UI -.->|Sandboxed| External[External Resources]
        end
        
        subgraph "Main Process"
            IPC[IPC Handlers]
            FS[File System Access]
            Process[Process Spawning]
        end
        
        subgraph "Isolation"
            W1[Worktree 1]
            W2[Worktree 2]
            W3[Worktree N]
            
            C1[Claude 1]
            C2[Claude 2]
            C3[Claude N]
        end
    end
    
    UI -->|Controlled IPC| IPC
    IPC --> FS
    IPC --> Process
    
    Process --> C1
    Process --> C2
    Process --> C3
    
    C1 --> W1
    C2 --> W2
    C3 --> W3
    
    W1 -.->|Isolated| W2
    W2 -.->|Isolated| W3
```

## Performance Optimizations

```mermaid
flowchart LR
    subgraph "Optimization Strategies"
        subgraph "Frontend"
            Debounce[Debounced Updates]
            Lazy[Lazy Loading]
            Virtual[Virtual Scrolling]
            Cache[State Caching]
        end
        
        subgraph "Backend"
            Batch[Batch Operations]
            Index[DB Indexing]
            Pool[Connection Pooling]
            Queue[Async Queue]
        end
        
        subgraph "Communication"
            Targeted[Targeted Updates]
            Compress[Data Compression]
            Stream[Streaming]
        end
    end
    
    Updates[State Updates] --> Debounce
    LargeData[Large Datasets] --> Lazy
    Terminal[Terminal Output] --> Virtual
    
    Multiple[Multiple Ops] --> Batch
    Queries[DB Queries] --> Index
    
    Changes[Data Changes] --> Targeted
    Output[Claude Output] --> Stream
```

This comprehensive set of Mermaid diagrams illustrates the various aspects of Crystal's architecture, from high-level component relationships to detailed data flows and module dependencies.