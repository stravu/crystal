#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = '/Users/erishaff/.crystal/sessions.db';
const sessionId = 'e48185d1-504a-497d-8893-03c232a6841c';

const db = new sqlite3.Database(dbPath);

// Get all responses with token usage
const query = `
SELECT 
  id,
  timestamp,
  json_extract(data, '$.usage.input_tokens') as input_tokens,
  json_extract(data, '$.usage.cache_creation_input_tokens') as cache_creation,
  json_extract(data, '$.usage.cache_read_input_tokens') as cache_read,
  json_extract(data, '$.usage.output_tokens') as output_tokens,
  json_extract(data, '$.type') as message_type
FROM session_outputs 
WHERE session_id = ? 
  AND type = 'json' 
  AND json_extract(data, '$.usage.input_tokens') >= 0
ORDER BY id ASC
`;

db.all(query, [sessionId], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('=== Token Usage Analysis for auto-commit-modes-2 ===');
  console.log('Total responses with usage data:', rows.length);
  console.log();

  let runningContextSize = 0;
  let totalOutputTokens = 0;
  let maxContextSeen = 0;

  console.log('ID\t\tInput\tCache_Cr\tCache_Rd\tOutput\tEst_Context\tType');
  console.log('-'.repeat(100));

  rows.forEach((row, index) => {
    const input = parseInt(row.input_tokens) || 0;
    const cacheCreation = parseInt(row.cache_creation) || 0;
    const cacheRead = parseInt(row.cache_read) || 0;
    const output = parseInt(row.output_tokens) || 0;

    // For context estimation: input + previous context + new output
    // The cache values might represent cumulative context state
    const estimatedContext = input + cacheCreation + cacheRead;
    
    runningContextSize += input + output; // Simple running sum
    totalOutputTokens += output;
    
    if (estimatedContext > maxContextSeen) {
      maxContextSeen = estimatedContext;
    }

    // Show first 10, last 10, and any particularly large context sizes
    if (index < 10 || index >= rows.length - 10 || estimatedContext > 150000) {
      console.log(
        `${row.id}\t\t${input}\t${cacheCreation}\t\t${cacheRead}\t\t${output}\t${estimatedContext}\t\t${row.message_type}`
      );
    }
  });

  console.log('-'.repeat(100));
  console.log();
  console.log('=== Summary ===');
  console.log(`Maximum context size seen: ${maxContextSeen.toLocaleString()} tokens`);
  console.log(`Running context sum: ${runningContextSize.toLocaleString()} tokens`);
  console.log(`Total output tokens: ${totalOutputTokens.toLocaleString()} tokens`);
  console.log(`Expected from Claude error: 188,278 tokens`);
  console.log();

  // Check the last successful response before the error
  const lastSuccessful = rows[rows.length - 1];
  if (lastSuccessful) {
    const finalInput = parseInt(lastSuccessful.input_tokens) || 0;
    const finalCacheCreation = parseInt(lastSuccessful.cache_creation) || 0;
    const finalCacheRead = parseInt(lastSuccessful.cache_read) || 0;
    const finalEstimate = finalInput + finalCacheCreation + finalCacheRead;
    
    console.log('=== Last Successful Response Analysis ===');
    console.log(`Input tokens: ${finalInput.toLocaleString()}`);
    console.log(`Cache creation: ${finalCacheCreation.toLocaleString()}`);
    console.log(`Cache read: ${finalCacheRead.toLocaleString()}`);
    console.log(`Total estimate: ${finalEstimate.toLocaleString()}`);
    console.log(`Difference from Claude's 188K: ${Math.abs(finalEstimate - 188278).toLocaleString()}`);
  }

  db.close();
});