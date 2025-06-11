# Crystal Integration with Stravu MCP Server

## Overview

Crystal is an Electron application that provides a UI on top of Claude Code, allowing users to seamlessly integrate Stravu notebooks as context and instructions for their AI conversations. The integration uses the secure MCP JWT authentication system to access Stravu data while maintaining strict tenant isolation and user consent.

**Key Features:**
- 🔐 **Secure OAuth Flow**: Browser-based authentication with granular permission control
- 🧠 **AI-Powered Search**: Vector semantic search finds notebooks by concept, not just keywords
- 📝 **Rich Content Access**: Full markdown notebook content with metadata
- ⚡ **Real-time Integration**: Direct insertion into Claude Code prompts
- 🛡️ **Session Management**: User control over active integrations and security

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Crystal App   │    │  Stravu SaaS    │    │  Claude Code    │
│   (Electron)    │    │   (Web App)     │    │     (AI)        │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Auth Manager  │◄──►│ • MCP Auth API  │    │ • Prompt Engine │
│ • Connection UI │    │ • JWT Endpoints │    │ • Context Mgmt  │
│ • Notebook UI   │    │ • Notebook API  │    │ • Response Gen  │
│ • Claude Bridge │    │ • Session Mgmt  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## User Experience Flow

### 1. Initial Connection Setup
1. User opens Crystal and sees "Connect to Stravu" option
2. Click triggers browser-based OAuth flow via Stravu MCP server
3. User authenticates with existing Stravu Google Auth
4. User sees consent screen for "Read Notebooks" and "Basic Info" scopes
5. Upon approval, Crystal receives secure JWT for API access
6. Connection status shows as "Connected to [Organization Name]"

### 2. Notebook Selection in Prompts
1. User starts typing a new prompt to Claude Code
2. Crystal shows a "📓 Add Stravu Notebook" button in prompt interface
3. Clicking opens a searchable notebook picker showing user's accessible notebooks
4. **AI-Powered Search**: Users can search by concept (e.g., "machine learning tutorials") not just exact titles
5. **Vector Semantic Search**: Stravu's embedding system finds conceptually related notebooks
6. User selects notebook, Crystal fetches full markdown content via MCP API
7. Notebook content is automatically formatted and inserted into prompt as context
8. User can continue typing additional instructions before sending to Claude

### 3. Session Management
1. Crystal shows connection status and last sync time in status bar
2. Settings panel allows viewing/revoking active Stravu sessions
3. Automatic re-authentication when JWT expires
4. Clear indication when offline or connection issues occur

## Available API Endpoints

### Authentication Flow
- `POST /mcp/auth/initiate` - Start auth session for Electron app
- `GET /mcp/auth/browser?session_id=<id>` - Browser auth page
- `POST /mcp/auth/grant` - User consent handling
- `GET /mcp/auth/status/<session_id>` - Poll for auth completion

### Session Management (for web UI security screen)
- `GET /mcp/auth/sessions` - List active MCP sessions for user
- `DELETE /mcp/auth/sessions/<session_id>` - Revoke specific session
- `POST /mcp/auth/sessions/revoke-all` - Revoke all user sessions

### Data Access (JWT authenticated)
- `GET /mcp/v1/ping` - Simple connectivity test
- `GET /mcp/v1/notebooks` - List all accessible notebooks
- `GET /mcp/v1/notebooks/<notebook_id>` - Get specific notebook content
- `POST /mcp/v1/notebooks/search` - Vector semantic search across notebooks
- `GET /mcp/v1/workspaces` - List accessible workspaces
- `GET /mcp/v1/member/info` - Get current user info

## Technical Implementation

### Authentication Manager
```javascript
// auth-manager.js
class StravuAuthManager {
    constructor() {
        this.jwtToken = null;
        this.memberInfo = null;
        this.connectionStatus = 'disconnected';
        this.eventEmitter = new EventEmitter();
    }

    async authenticate() {
        try {
            // 1. Initiate auth session with Stravu
            const { auth_url, session_id } = await this.initiateAuth();
            
            // 2. Open browser for user authentication
            await shell.openExternal(auth_url);
            
            // 3. Poll for completion
            const authResult = await this.pollForCompletion(session_id);
            
            // 4. Store JWT securely
            await this.storeCredentials(authResult);
            
            this.connectionStatus = 'connected';
            this.eventEmitter.emit('auth-success', authResult);
            
            return authResult;
        } catch (error) {
            this.connectionStatus = 'error';
            this.eventEmitter.emit('auth-error', error);
            throw error;
        }
    }

    async initiateAuth() {
        const response = await fetch(`${STRAVU_API_BASE}/mcp/auth/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return await response.json();
    }

    async pollForCompletion(sessionId) {
        return new Promise((resolve, reject) => {
            const poll = async () => {
                try {
                    const response = await fetch(
                        `${STRAVU_API_BASE}/mcp/auth/status/${sessionId}`
                    );
                    const status = await response.json();
                    
                    if (status.status === 'completed') {
                        resolve({
                            jwt: status.jwt_token,
                            memberId: status.member_id,
                            orgSlug: status.org_slug,
                            scopes: status.scopes
                        });
                    } else if (status.status === 'denied' || status.status === 'expired') {
                        reject(new Error('Authentication failed or denied'));
                    } else {
                        setTimeout(poll, 2000); // Continue polling
                    }
                } catch (error) {
                    setTimeout(poll, 2000); // Retry on network errors
                }
            };
            
            poll();
            
            // Timeout after 10 minutes
            setTimeout(() => reject(new Error('Authentication timeout')), 600000);
        });
    }

    async storeCredentials(authResult) {
        // Use Electron's secure storage
        const { safeStorage } = require('electron');
        
        if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(authResult.jwt);
            await this.store.set('stravu_jwt', encrypted);
        } else {
            // Fallback for development - never in production
            await this.store.set('stravu_jwt', authResult.jwt);
        }
        
        await this.store.set('stravu_member_info', {
            memberId: authResult.memberId,
            orgSlug: authResult.orgSlug,
            scopes: authResult.scopes
        });
    }

    async getStoredJWT() {
        const { safeStorage } = require('electron');
        const encrypted = await this.store.get('stravu_jwt');
        
        if (!encrypted) return null;
        
        if (safeStorage.isEncryptionAvailable()) {
            return safeStorage.decryptString(encrypted);
        } else {
            return encrypted;
        }
    }

    async makeAuthenticatedRequest(endpoint, options = {}) {
        const jwt = await this.getStoredJWT();
        if (!jwt) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${STRAVU_API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (response.status === 401) {
            // JWT expired or revoked, trigger re-auth
            this.connectionStatus = 'expired';
            this.eventEmitter.emit('auth-expired');
            throw new Error('Authentication expired');
        }

        return response;
    }
}
```

### Notebook Service
```javascript
// notebook-service.js
class StravuNotebookService {
    constructor(authManager) {
        this.authManager = authManager;
        this.cache = new Map(); // Simple in-memory cache
        this.lastFetch = null;
    }

    async getNotebooks(forceRefresh = false) {
        // Check cache first (5 minute TTL)
        if (!forceRefresh && this.lastFetch && 
            Date.now() - this.lastFetch < 300000 && 
            this.cache.has('notebooks')) {
            return this.cache.get('notebooks');
        }

        try {
            const response = await this.authManager.makeAuthenticatedRequest('/mcp/v1/notebooks');
            const data = await response.json();
            
            const notebooks = data.notebooks.map(nb => ({
                id: nb.id,
                title: nb.title,
                excerpt: this.createExcerpt(nb.content),
                lastModified: nb.updated_at,
                tags: nb.tags || [],
                wordCount: this.countWords(nb.content)
            }));

            this.cache.set('notebooks', notebooks);
            this.lastFetch = Date.now();
            
            return notebooks;
        } catch (error) {
            console.error('Failed to fetch notebooks:', error);
            throw error;
        }
    }

    async getNotebookContent(notebookId) {
        const cacheKey = `notebook_${notebookId}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const response = await this.authManager.makeAuthenticatedRequest(
                `/mcp/v1/notebooks/${notebookId}`
            );
            const notebook = await response.json();
            
            this.cache.set(cacheKey, notebook);
            return notebook;
        } catch (error) {
            console.error(`Failed to fetch notebook ${notebookId}:`, error);
            throw error;
        }
    }

    createExcerpt(content, maxLength = 150) {
        const text = content.replace(/[#*`_\[\]]/g, '').trim();
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    countWords(content) {
        return content.split(/\s+/).filter(word => word.length > 0).length;
    }

    async searchNotebooks(query) {
        try {
            // Try vector search first for semantic matching
            const response = await this.authManager.makeAuthenticatedRequest('/mcp/v1/notebooks/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit: 20 })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.results.map(result => ({
                    id: result.id,
                    title: result.title,
                    excerpt: this.createExcerpt(result.content || ''),
                    lastModified: result.updated_at,
                    tags: result.tags || [],
                    wordCount: this.countWords(result.content || ''),
                    similarity: result.similarity || 0
                }));
            }
        } catch (error) {
            console.log('Vector search failed, falling back to text search:', error);
        }
        
        // Fallback to basic text search if vector search fails
        const notebooks = await this.getNotebooks();
        const lowerQuery = query.toLowerCase();
        
        return notebooks.filter(nb => 
            nb.title.toLowerCase().includes(lowerQuery) ||
            nb.excerpt.toLowerCase().includes(lowerQuery) ||
            nb.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }
}
```

### UI Components

#### Connection Status Component
```javascript
// components/connection-status.js
class ConnectionStatus extends HTMLElement {
    constructor() {
        super();
        this.authManager = window.authManager;
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.innerHTML = `
            <div class="connection-status">
                <div class="status-indicator" id="status-indicator"></div>
                <div class="status-text" id="status-text">Disconnected</div>
                <button class="connect-btn" id="connect-btn">Connect to Stravu</button>
                <button class="settings-btn" id="settings-btn" style="display: none;">⚙️</button>
            </div>
        `;
        this.updateStatus();
    }

    setupEventListeners() {
        this.querySelector('#connect-btn').addEventListener('click', () => {
            this.handleConnect();
        });

        this.querySelector('#settings-btn').addEventListener('click', () => {
            this.showSettings();
        });

        this.authManager.eventEmitter.on('auth-success', () => {
            this.updateStatus();
        });

        this.authManager.eventEmitter.on('auth-expired', () => {
            this.updateStatus();
        });
    }

    async handleConnect() {
        const connectBtn = this.querySelector('#connect-btn');
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';

        try {
            await this.authManager.authenticate();
        } catch (error) {
            console.error('Connection failed:', error);
            // Show error message to user
        } finally {
            connectBtn.disabled = false;
            this.updateStatus();
        }
    }

    updateStatus() {
        const indicator = this.querySelector('#status-indicator');
        const text = this.querySelector('#status-text');
        const connectBtn = this.querySelector('#connect-btn');
        const settingsBtn = this.querySelector('#settings-btn');

        switch (this.authManager.connectionStatus) {
            case 'connected':
                indicator.className = 'status-indicator connected';
                text.textContent = `Connected to ${this.authManager.memberInfo?.orgSlug || 'Stravu'}`;
                connectBtn.style.display = 'none';
                settingsBtn.style.display = 'inline-block';
                break;
            case 'expired':
                indicator.className = 'status-indicator expired';
                text.textContent = 'Session expired';
                connectBtn.style.display = 'inline-block';
                connectBtn.textContent = 'Reconnect';
                settingsBtn.style.display = 'none';
                break;
            default:
                indicator.className = 'status-indicator disconnected';
                text.textContent = 'Disconnected';
                connectBtn.style.display = 'inline-block';
                connectBtn.textContent = 'Connect to Stravu';
                settingsBtn.style.display = 'none';
        }
    }
}

customElements.define('connection-status', ConnectionStatus);
```

#### Notebook Picker Component
```javascript
// components/notebook-picker.js
class NotebookPicker extends HTMLElement {
    constructor() {
        super();
        this.notebookService = window.notebookService;
        this.selectedNotebook = null;
        this.onSelect = null;
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.innerHTML = `
            <div class="notebook-picker-modal" id="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Select Stravu Notebook</h2>
                        <button class="close-btn" id="close-btn">×</button>
                    </div>
                    <div class="search-container">
                        <input type="text" id="search-input" placeholder="Search notebooks (AI-powered semantic search)..." />
                        <div class="search-hint">
                            💡 Try searching by concepts, not just keywords (e.g., "machine learning examples" or "project documentation")
                        </div>
                    </div>
                    <div class="notebook-list" id="notebook-list">
                        <div class="loading">Loading notebooks...</div>
                    </div>
                    <div class="modal-footer">
                        <button class="cancel-btn" id="cancel-btn">Cancel</button>
                        <button class="select-btn" id="select-btn" disabled>Insert Notebook</button>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const modal = this.querySelector('#modal');
        const closeBtn = this.querySelector('#close-btn');
        const cancelBtn = this.querySelector('#cancel-btn');
        const selectBtn = this.querySelector('#select-btn');
        const searchInput = this.querySelector('#search-input');

        closeBtn.addEventListener('click', () => this.hide());
        cancelBtn.addEventListener('click', () => this.hide());
        selectBtn.addEventListener('click', () => this.handleSelect());

        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hide();
        });
    }

    async show(onSelectCallback) {
        this.onSelect = onSelectCallback;
        this.querySelector('#modal').style.display = 'flex';
        
        try {
            await this.loadNotebooks();
        } catch (error) {
            this.showError('Failed to load notebooks. Please check your connection.');
        }
    }

    hide() {
        this.querySelector('#modal').style.display = 'none';
        this.selectedNotebook = null;
        this.querySelector('#select-btn').disabled = true;
    }

    async loadNotebooks() {
        const listContainer = this.querySelector('#notebook-list');
        
        try {
            const notebooks = await this.notebookService.getNotebooks();
            this.renderNotebooks(notebooks);
        } catch (error) {
            listContainer.innerHTML = '<div class="error">Failed to load notebooks</div>';
            throw error;
        }
    }

    renderNotebooks(notebooks) {
        const listContainer = this.querySelector('#notebook-list');
        
        if (notebooks.length === 0) {
            listContainer.innerHTML = '<div class="empty">No notebooks found</div>';
            return;
        }

        listContainer.innerHTML = notebooks.map(notebook => `
            <div class="notebook-item" data-notebook-id="${notebook.id}">
                <div class="notebook-title">${this.escapeHtml(notebook.title)}</div>
                <div class="notebook-meta">
                    <span class="word-count">${notebook.wordCount} words</span>
                    <span class="last-modified">${this.formatDate(notebook.lastModified)}</span>
                </div>
                <div class="notebook-excerpt">${this.escapeHtml(notebook.excerpt)}</div>
                ${notebook.tags.length > 0 ? `
                    <div class="notebook-tags">
                        ${notebook.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Add click listeners
        listContainer.querySelectorAll('.notebook-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectNotebook(item.dataset.notebookId, notebooks);
            });
        });
    }

    selectNotebook(notebookId, notebooks) {
        // Update UI selection
        this.querySelectorAll('.notebook-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.querySelector(`[data-notebook-id="${notebookId}"]`).classList.add('selected');

        // Store selection
        this.selectedNotebook = notebooks.find(nb => nb.id === notebookId);
        this.querySelector('#select-btn').disabled = false;
    }

    async handleSelect() {
        if (!this.selectedNotebook || !this.onSelect) return;

        const selectBtn = this.querySelector('#select-btn');
        selectBtn.disabled = true;
        selectBtn.textContent = 'Loading...';

        try {
            // Fetch full notebook content
            const fullNotebook = await this.notebookService.getNotebookContent(this.selectedNotebook.id);
            
            // Format for Claude
            const formattedContent = this.formatNotebookForClaude(fullNotebook);
            
            // Call the callback
            this.onSelect(formattedContent, this.selectedNotebook);
            
            this.hide();
        } catch (error) {
            console.error('Failed to load notebook content:', error);
            selectBtn.textContent = 'Insert Notebook';
            selectBtn.disabled = false;
        }
    }

    formatNotebookForClaude(notebook) {
        return `# 📓 Stravu Notebook: ${notebook.title}

${notebook.content}

---
*Source: Stravu Notebook "${notebook.title}" (Last updated: ${this.formatDate(notebook.updated_at)})*`;
    }

    async handleSearch(query) {
        if (!query.trim()) {
            await this.loadNotebooks();
            return;
        }

        try {
            const results = await this.notebookService.searchNotebooks(query);
            this.renderNotebooks(results);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    showError(message) {
        this.querySelector('#notebook-list').innerHTML = `<div class="error">${message}</div>`;
    }
}

customElements.define('notebook-picker', NotebookPicker);
```

### Claude Code Integration

#### Prompt Enhancement
```javascript
// claude-integration.js
class ClaudeIntegration {
    constructor(authManager, notebookService) {
        this.authManager = authManager;
        this.notebookService = notebookService;
        this.setupPromptEnhancement();
    }

    setupPromptEnhancement() {
        // Find Claude Code's prompt input area
        const promptContainer = document.querySelector('[data-testid="prompt-input"]') || 
                               document.querySelector('.prompt-input') ||
                               document.querySelector('textarea[placeholder*="prompt"]');

        if (promptContainer) {
            this.addNotebookButton(promptContainer);
        } else {
            // Retry with MutationObserver if not found immediately
            this.observeForPromptInput();
        }
    }

    observeForPromptInput() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const promptInput = node.querySelector('[data-testid="prompt-input"]') ||
                                          node.querySelector('.prompt-input') ||
                                          node.querySelector('textarea[placeholder*="prompt"]');
                        
                        if (promptInput) {
                            this.addNotebookButton(promptInput.parentElement);
                            observer.disconnect();
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    addNotebookButton(container) {
        // Check if user is connected to Stravu
        if (this.authManager.connectionStatus !== 'connected') {
            return;
        }

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'stravu-integration';
        buttonContainer.innerHTML = `
            <button class="stravu-notebook-btn" id="stravu-notebook-btn">
                📓 Add Stravu Notebook
            </button>
        `;

        // Insert button near prompt input
        container.appendChild(buttonContainer);

        // Setup click handler
        buttonContainer.querySelector('#stravu-notebook-btn').addEventListener('click', () => {
            this.showNotebookPicker();
        });

        // Listen for auth status changes
        this.authManager.eventEmitter.on('auth-expired', () => {
            buttonContainer.style.display = 'none';
        });

        this.authManager.eventEmitter.on('auth-success', () => {
            buttonContainer.style.display = 'block';
        });
    }

    showNotebookPicker() {
        const picker = document.querySelector('notebook-picker') || 
                      document.createElement('notebook-picker');
        
        if (!document.body.contains(picker)) {
            document.body.appendChild(picker);
        }

        picker.show((content, notebook) => {
            this.insertNotebookContent(content, notebook);
        });
    }

    insertNotebookContent(content, notebook) {
        // Find the active prompt input
        const promptInput = document.querySelector('[data-testid="prompt-input"]') ||
                           document.querySelector('.prompt-input') ||
                           document.querySelector('textarea[placeholder*="prompt"]');

        if (promptInput) {
            const currentValue = promptInput.value || '';
            const newValue = currentValue + (currentValue ? '\n\n' : '') + content;
            
            // Set the value
            promptInput.value = newValue;
            
            // Trigger input events to ensure Claude Code recognizes the change
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            promptInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Focus and position cursor at end
            promptInput.focus();
            promptInput.setSelectionRange(newValue.length, newValue.length);

            // Show success feedback
            this.showInsertionFeedback(notebook.title);
        }
    }

    showInsertionFeedback(notebookTitle) {
        const feedback = document.createElement('div');
        feedback.className = 'stravu-feedback';
        feedback.innerHTML = `✅ Added "${notebookTitle}" to prompt`;
        document.body.appendChild(feedback);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            feedback.remove();
        }, 3000);
    }
}
```

## API Data Formats

### Notebook List Response (`GET /mcp/v1/notebooks`)
```json
{
  "notebooks": [
    {
      "id": "notebook_uuid",
      "title": "Notebook Title",
      "content": "markdown content...",
      "updated_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-10T09:00:00Z", 
      "tags": ["tag1", "tag2"]
    }
  ],
  "org_slug": "organization_name"
}
```

### Individual Notebook Response (`GET /mcp/v1/notebooks/<id>`)
```json
{
  "id": "notebook_uuid",
  "title": "Detailed Notebook Title",
  "content": "# Full markdown content here...",
  "updated_at": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-10T09:00:00Z",
  "tags": ["documentation", "api"],
  "org_slug": "organization_name"
}
```

### Vector Search Response (`POST /mcp/v1/notebooks/search`)
```json
{
  "query": "machine learning examples",
  "results": [
    {
      "id": "notebook_uuid",
      "title": "ML Tutorial Notebook",
      "content": "markdown content...",
      "updated_at": "2024-01-15T10:30:00Z",
      "tags": ["ml", "tutorial"],
      "similarity": 0.95
    }
  ],
  "org_slug": "organization_name",
  "count": 1
}
```

## Security Considerations

### 1. Credential Storage
- JWT tokens stored using Electron's `safeStorage` API for encryption at rest
- Automatic token expiration (48 hours) limits exposure window
- Secure deletion of expired/revoked tokens

### 2. Network Security
- All API requests use HTTPS
- JWT validation on every request
- Rate limiting protection on Stravu side

### 3. User Privacy
- Clear consent flow showing exactly what data is accessed
- Notebook content cached temporarily, cleared on app exit
- No persistent storage of notebook content
- Session management UI for user control

### 4. Error Handling
- Graceful degradation when Stravu is unreachable
- Clear error messages for authentication failures
- Automatic retry with exponential backoff for network issues

## Development Setup

### 1. Environment Configuration
```javascript
// config.js
const config = {
    development: {
        stravuApiBase: 'http://localhost:3000',
        enableDebugLogging: true,
        cacheTimeout: 60000 // 1 minute for development
    },
    production: {
        stravuApiBase: 'https://api.stravu.com',
        enableDebugLogging: false,
        cacheTimeout: 300000 // 5 minutes for production
    }
};

module.exports = config[process.env.NODE_ENV || 'development'];
```

### 2. Build Integration
```json
{
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "build": "electron-builder",
    "test": "jest"
  },
  "dependencies": {
    "electron": "^latest",
    "node-fetch": "^3.0.0"
  }
}
```

## User Documentation

### Getting Started
1. **Connect to Stravu**: Click "Connect to Stravu" in Crystal's status bar
2. **Authenticate**: Complete the browser authentication flow
3. **Grant Permissions**: Approve access to read your notebooks
4. **Start Using**: Click "📓 Add Stravu Notebook" when composing prompts
5. **Smart Search**: Use AI-powered search to find notebooks by concept, not just exact titles

### Enhanced Search Features
- **Semantic Search**: Find notebooks by meaning, not just keywords
- **Concept Discovery**: Search for "API documentation" to find all related notebooks
- **Intelligent Matching**: Stravu's AI understands context and relationships
- **Instant Results**: Vector search provides fast, relevant results

### Troubleshooting
- **Connection Issues**: Check internet connection and try reconnecting
- **Authentication Expired**: Click "Reconnect" when prompted
- **Missing Notebooks**: Ensure you have access to notebooks in your Stravu organization

### Privacy
- Crystal only accesses notebooks you explicitly select
- Notebook content is not permanently stored on your device
- You can revoke access anytime through Stravu's security settings

This integration provides a seamless bridge between Stravu's knowledge management and Claude Code's AI capabilities while maintaining security and user control. 
