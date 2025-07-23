# Rich Output Migration Plan

## The Good News: It's Completely Pluggable!

The tab system is frontend-only and extremely flexible. We can add a "Rich Output" tab in parallel with the existing terminal view.

## Implementation Steps

### 1. Add ViewMode (5 minutes)
```typescript
// hooks/useSessionView.ts
export type ViewMode = 'output' | 'messages' | 'changes' | 'terminal' | 'editor' | 'dashboard' | 'richOutput';
```

### 2. Add Tab (10 minutes)
```typescript
// components/session/ViewTabs.tsx
const tabs = [
  { mode: 'output', label: 'Output', activity: unreadActivity.output },
  { mode: 'richOutput', label: 'Rich Output', activity: unreadActivity.richOutput }, // NEW!
  // ... other tabs
];
```

### 3. Create RichOutputView Component (1-2 hours)
```typescript
// components/session/RichOutputView.tsx
export const RichOutputView = ({ sessionId }) => {
  const [messages, setMessages] = useState([]);
  
  useEffect(() => {
    // Load raw messages from backend
    API.sessions.getConversation(sessionId).then(response => {
      setMessages(response.data);
    });
  }, [sessionId]);
  
  // Group messages by user/assistant
  const conversation = messages.map(msg => ({
    role: msg.role,
    content: msg.message.content,
    timestamp: msg.timestamp
  }));
  
  return (
    <div className="h-full overflow-y-auto p-4">
      {conversation.map((msg, idx) => (
        <div key={idx} className={`mb-6 ${msg.role === 'user' ? 'bg-surface-secondary' : ''} rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-2">
            {msg.role === 'user' ? <User /> : <Bot />}
            <span className="font-semibold">{msg.role === 'user' ? 'You' : 'Claude'}</span>
            <span className="text-text-tertiary text-sm">{formatTime(msg.timestamp)}</span>
          </div>
          <MarkdownPreview content={msg.content} />
        </div>
      ))}
    </div>
  );
};
```

### 4. Add to SessionView (5 minutes)
```typescript
// components/SessionView.tsx
<div className={`h-full ${hook.viewMode === 'richOutput' ? 'block' : 'hidden'}`}>
  <RichOutputView sessionId={activeSession.id} />
</div>
```

## Data Flow

```
Current Terminal Flow:
SQLite → formatJsonForOutputEnhanced() → ANSI codes → XTerm

New Rich Output Flow:
SQLite → Raw JSON → React Components → Markdown → HTML
```

## Benefits of This Approach

1. **Zero Risk**: Old view still works
2. **Gradual Migration**: Users can switch between views
3. **A/B Testing**: See which users prefer
4. **No Backend Changes**: Frontend-only
5. **Reuses Existing Components**: MarkdownPreview already exists

## Timeline

- **Day 1**: Add tab and basic rich view
- **Day 2-3**: Polish the UI, add features
- **Week 1**: Gather user feedback
- **Week 2**: Improve based on feedback
- **Month 1**: Consider deprecating terminal view

## Future Enhancements

Once the rich view is working:
- Code syntax highlighting
- Copy code buttons
- Collapsible sections
- Jump to prompts
- Export conversations
- Search within output

## No More Terminal Paradigm!

This migration path lets us escape the terminal paradigm without breaking anything. We can build the future while keeping the past working.