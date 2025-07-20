#!/usr/bin/env node

// Test script to verify token tracking API behavior
const path = require('path');

// Import the built database service
const { DatabaseService } = require('./main/dist/database/database');
const { getSessionTokenUsageWithContext } = require('./main/dist/utils/tokenTracker');

const sessionId = 'e48185d1-504a-497d-8893-03c232a6841c';
const dbPath = path.join(process.env.HOME, '.crystal', 'sessions.db');

console.log('Testing token tracking for session:', sessionId);
console.log('Database path:', dbPath);

try {
  // Initialize database service
  const db = new DatabaseService(dbPath);
  
  console.log('\n=== Direct Database Queries ===');
  
  // Test getLatestContextWindowUsage directly
  console.log('Testing getLatestContextWindowUsage...');
  const latestContext = db.getLatestContextWindowUsage(sessionId);
  console.log('Latest context usage:', latestContext);
  
  // Test getSessionTokenSummary
  console.log('\nTesting getSessionTokenSummary...');
  const summary = db.getSessionTokenSummary(sessionId);
  console.log('Session summary:', summary);
  
  console.log('\n=== Full Token Usage Context ===');
  
  // Test the full function
  const result = getSessionTokenUsageWithContext(db, sessionId, 'claude-sonnet-4-20250514');
  console.log('Full result:', JSON.stringify(result, null, 2));
  
  console.log('\n=== Expected vs Actual ===');
  console.log('Expected context usage: 188278 tokens (94.1%)');
  console.log('Actual currentContextUsage:', result.currentContextUsage);
  console.log('Actual summary.total_tokens:', result.summary?.total_tokens);
  
  const actualTokens = result.currentContextUsage ?? result.summary?.total_tokens ?? 0;
  const percentage = Math.round((actualTokens / 200000) * 100);
  console.log('Calculated percentage:', percentage + '%');
  
} catch (error) {
  console.error('Error:', error);
} finally {
  process.exit(0);
}