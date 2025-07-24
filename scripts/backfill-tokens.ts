#!/usr/bin/env ts-node

/**
 * One-off script to backfill token usage from existing sessions
 * This can be run manually if needed, but the same logic runs automatically
 * during database migrations.
 * 
 * Usage: npx ts-node scripts/backfill-tokens.ts [--dry-run]
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import { extractTokenUsage, getMessageType } from '../main/src/utils/tokenTracker';

const isDryRun = process.argv.includes('--dry-run');
const crystalDir = path.join(os.homedir(), '.crystal');
const dbPath = path.join(crystalDir, 'crystal.db');

console.log('=== Token Usage Backfill Script ===');
console.log(`Database: ${dbPath}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
console.log('');

// Open database
const db = new Database(dbPath);

try {
  // Check if tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name IN ('message_token_usage', 'session_token_summary')
  `).all() as Array<{ name: string }>;
  
  if (tables.length !== 2) {
    console.error('❌ Token tracking tables not found. Please run Crystal to apply migrations first.');
    process.exit(1);
  }

  // Get statistics
  const stats = {
    totalSessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number },
    totalJsonOutputs: db.prepare("SELECT COUNT(*) as count FROM session_outputs WHERE type = 'json'").get() as { count: number },
    existingTokenRecords: db.prepare('SELECT COUNT(*) as count FROM message_token_usage').get() as { count: number },
  };

  console.log('📊 Current Statistics:');
  console.log(`   Total sessions: ${stats.totalSessions.count}`);
  console.log(`   Total JSON outputs: ${stats.totalJsonOutputs.count}`);
  console.log(`   Existing token records: ${stats.existingTokenRecords.count}`);
  console.log('');

  if (stats.existingTokenRecords.count > 0 && !process.argv.includes('--force')) {
    console.log('⚠️  Token records already exist. Use --force to re-process all messages.');
    process.exit(0);
  }

  // Get all JSON outputs
  const jsonOutputs = db.prepare(`
    SELECT so.id, so.session_id, so.data, s.model
    FROM session_outputs so
    JOIN sessions s ON s.id = so.session_id
    WHERE so.type = 'json'
    ORDER BY so.timestamp ASC
  `).all() as Array<{ id: number; session_id: string; data: string; model: string | null }>;

  console.log(`🔍 Found ${jsonOutputs.length} JSON messages to process`);
  
  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ---');
    console.log('Analyzing first 10 messages...\n');
    
    const sample = jsonOutputs.slice(0, 10);
    for (const output of sample) {
      try {
        const jsonData = JSON.parse(output.data);
        const usage = extractTokenUsage(jsonData);
        
        if (usage) {
          const messageType = getMessageType(jsonData);
          console.log(`✓ Session ${output.session_id.substring(0, 8)}... | Type: ${messageType} | Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out, ${usage.totalTokens} total`);
        }
      } catch (error) {
        console.log(`✗ Session ${output.session_id.substring(0, 8)}... | Error parsing JSON`);
      }
    }
    
    process.exit(0);
  }

  // Process all outputs
  console.log('\n🚀 Starting backfill...');
  
  let processedCount = 0;
  let errorCount = 0;
  const sessionTotals = new Map<string, { input: number; output: number; total: number }>();
  
  // Start transaction for better performance
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO message_token_usage (session_id, output_id, message_type, input_tokens, output_tokens, total_tokens)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction(() => {
    for (const output of jsonOutputs) {
      try {
        const jsonData = JSON.parse(output.data);
        const usage = extractTokenUsage(jsonData);
        
        if (usage) {
          const messageType = getMessageType(jsonData);
          
          insertStmt.run(
            output.session_id,
            output.id,
            messageType,
            usage.inputTokens,
            usage.outputTokens,
            usage.totalTokens
          );
          
          // Track totals per session
          const current = sessionTotals.get(output.session_id) || { input: 0, output: 0, total: 0 };
          sessionTotals.set(output.session_id, {
            input: current.input + usage.inputTokens,
            output: current.output + usage.outputTokens,
            total: current.total + usage.totalTokens
          });
          
          processedCount++;
          
          if (processedCount % 100 === 0) {
            process.stdout.write(`\r   Processed ${processedCount}/${jsonOutputs.length} messages...`);
          }
        }
      } catch (error) {
        errorCount++;
      }
    }
  });
  
  transaction();
  
  console.log(`\n✅ Processed ${processedCount} messages with token usage (${errorCount} errors)`);
  
  // Update session summaries
  console.log('\n📈 Updating session summaries...');
  
  const updateStmt = db.prepare(`
    INSERT INTO session_token_summary (session_id, total_input_tokens, total_output_tokens, total_tokens)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      total_tokens = excluded.total_tokens,
      last_updated = CURRENT_TIMESTAMP
  `);
  
  const summaryTransaction = db.transaction(() => {
    for (const [sessionId, totals] of sessionTotals) {
      updateStmt.run(sessionId, totals.input, totals.output, totals.total);
    }
  });
  
  summaryTransaction();
  
  console.log(`✅ Updated ${sessionTotals.size} session summaries`);
  
  // Show top sessions by token usage
  console.log('\n🏆 Top 10 Sessions by Token Usage:');
  const topSessions = db.prepare(`
    SELECT 
      s.id,
      s.name,
      s.model,
      sts.total_tokens,
      sts.total_input_tokens,
      sts.total_output_tokens
    FROM session_token_summary sts
    JOIN sessions s ON s.id = sts.session_id
    ORDER BY sts.total_tokens DESC
    LIMIT 10
  `).all() as Array<{
    id: string;
    name: string;
    model: string | null;
    total_tokens: number;
    total_input_tokens: number;
    total_output_tokens: number;
  }>;
  
  for (const session of topSessions) {
    const contextWindow = session.model?.includes('haiku') ? 200000 : 200000;
    const percentage = Math.round((session.total_tokens / contextWindow) * 100);
    console.log(`   ${session.name.substring(0, 40).padEnd(40)} | ${session.total_tokens.toLocaleString().padStart(8)} tokens (${percentage}% of context)`);
  }
  
  console.log('\n✨ Backfill complete!');
  
} catch (error) {
  console.error('❌ Error during backfill:', error);
  process.exit(1);
} finally {
  db.close();
}