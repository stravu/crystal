import { CodexManager } from './codexManager';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Test for Codex with GPT-5 (released August 7, 2025)
// GPT-5 provides significant improvements over previous models

// Simple logger for testing 
const testLogger = {
  verbose: (msg: string) => console.log(`[VERBOSE] ${msg}`),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string, error?: Error) => console.error(`[ERROR] ${msg}`, error || '')
};

// Mock session manager
const mockSessionManager = {
  db: {
    getPanel: (panelId: string) => null
  },
  getDbSession: (sessionId: string) => ({ id: sessionId }),
  getProjectById: (projectId: string) => null,
  getPanelClaudeSessionId: (panelId: string) => null,
  updateSession: (sessionId: string, updates: Record<string, unknown>) => {}
};

// Mock config manager
const mockConfigManager = {
  getConfig: () => ({
    verbose: true,
    codexExecutablePath: null, // Will use auto-discovery
    openaiApiKey: process.env.OPENAI_API_KEY
  }),
  getSystemPromptAppend: () => null
};

async function testCodexManager() {
  console.log('=== Testing Codex Manager ===\n');
  
  // Create manager instance
  const manager = new CodexManager(
    mockSessionManager as unknown as import('../../sessionManager').SessionManager,
    testLogger as unknown as import('../../../utils/logger').Logger,
    mockConfigManager as unknown as import('../../configManager').ConfigManager
  );
  
  // Test 1: Check availability
  console.log('Test 1: Checking Codex availability...');
  const availability = await manager['testCliAvailability']();
  
  if (!availability.available) {
    console.error(`❌ Codex not available: ${availability.error}`);
    console.log('\nPlease install Codex first:');
    console.log('  npm install -g @openai/codex');
    console.log('  OR');
    console.log('  bun add -g @openai/codex');
    return;
  }
  
  console.log(`✅ Codex is available!`);
  console.log(`   Version: ${availability.version}`);
  console.log(`   Path: ${availability.path}`);
  
  // Test 2: Test basic communication
  console.log('\nTest 2: Testing basic Codex communication...');
  
  // Create a temporary directory for testing
  const testDir = path.join(os.tmpdir(), `codex-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  console.log(`   Using test directory: ${testDir}`);
  
  const panelId = 'test-panel-1';
  const sessionId = 'test-session-1';
  
  // Set up event listeners
  let responseReceived = false;
  let modelInfo = '';
  
  manager.on('output', (event) => {
    console.log(`\n📨 Output event received:`);
    console.log(`   Panel: ${event.panelId}`);
    console.log(`   Type: ${event.type}`);
    
    if (event.type === 'json' && event.data) {
      const msg = event.data.msg || event.data;
      
      // Check for different event types from Codex
      if (msg.type === 'session_configured') {
        console.log(`   ✅ Session configured with model: ${msg.model}`);
        modelInfo = msg.model;
      } else if (msg.type === 'agent_message' || msg.type === 'agent_message_delta') {
        const content = msg.message || msg.delta || '';
        console.log(`   🤖 Agent response: ${content.substring(0, 100)}...`);
        responseReceived = true;
      } else if (msg.type === 'task_complete') {
        console.log(`   ✅ Task completed`);
        responseReceived = true;
      } else if (msg.type === 'error') {
        console.log(`   ❌ Error: ${msg.message}`);
      } else {
        console.log(`   Event type: ${msg.type}`);
      }
    } else if (event.type === 'stdout') {
      console.log(`   📝 Stdout: ${event.data.substring(0, 100)}...`);
    }
  });
  
  manager.on('error', (event) => {
    console.error(`\n❌ Error event:`, event.error);
  });
  
  manager.on('spawned', (event) => {
    console.log(`\n✅ Process spawned for panel ${event.panelId}`);
  });
  
  manager.on('exit', (event) => {
    console.log(`\n Process exited for panel ${event.panelId} with code ${event.exitCode}`);
  });
  
  try {
    // Start the Codex panel with a simple test prompt
    console.log('\n🚀 Starting Codex panel with GPT-5...');
    console.log('   (GPT-5 was released on August 7, 2025)');
    await manager.startPanel(
      panelId,
      sessionId,
      testDir,
      'What model are you running? Please confirm you are using GPT-5.'
      // model parameter omitted - will use default GPT-5
    );
    
    // Wait for response (timeout after 30 seconds)
    console.log('\n⏳ Waiting for response from Codex...');
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds
    
    while (!responseReceived && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (responseReceived) {
      console.log('\n✅ Successfully received response from Codex!');
      if (modelInfo) {
        console.log(`   Model running: ${modelInfo}`);
      }
    } else {
      console.log('\n⚠️ Timeout waiting for response (this might be normal if API key is not set)');
    }
    
    // Stop the panel
    console.log('\n🛑 Stopping Codex panel...');
    await manager.stopPanel(panelId);
    console.log('✅ Panel stopped successfully');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    // Clean up
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log('\n🧹 Cleaned up test directory');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testCodexManager().catch(console.error);