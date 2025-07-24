-- Comprehensive script to fix ALL session token summaries
-- This removes the incorrect cache token additions and recalculates properly

-- First, clear all existing incorrect summaries
DELETE FROM session_token_summary;
DELETE FROM message_token_usage;

-- Step 1: Recalculate message_token_usage for ALL sessions using ONLY input_tokens and output_tokens
-- This excludes the cache tokens that were incorrectly being added
INSERT INTO message_token_usage (session_id, output_id, message_type, input_tokens, output_tokens, total_tokens, timestamp)
SELECT 
  session_id,
  id as output_id,
  CASE 
    WHEN json_extract(data, '$.type') = 'assistant' THEN 'assistant'
    WHEN json_extract(data, '$.type') = 'user' THEN 'user'
    ELSE 'system'
  END as message_type,
  COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) as input_tokens,
  COALESCE(json_extract(data, '$.usage.output_tokens'), json_extract(data, '$.message.usage.output_tokens'), 0) as output_tokens,
  (COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) + 
   COALESCE(json_extract(data, '$.usage.output_tokens'), json_extract(data, '$.message.usage.output_tokens'), 0)) as total_tokens,
  timestamp
FROM session_outputs 
WHERE type = 'json' 
  AND (json_extract(data, '$.usage.input_tokens') > 0 OR 
       json_extract(data, '$.usage.output_tokens') > 0 OR
       json_extract(data, '$.message.usage.input_tokens') > 0 OR
       json_extract(data, '$.message.usage.output_tokens') > 0);

-- Step 2: Create corrected session token summaries
INSERT INTO session_token_summary (session_id, total_input_tokens, total_output_tokens, total_tokens, last_updated)
SELECT 
  session_id,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens, 
  SUM(total_tokens) as total_tokens,
  datetime('now') as last_updated
FROM message_token_usage 
GROUP BY session_id;

-- Show a sample of the corrected data
SELECT 'CORRECTED SUMMARIES (sample):' as info;
SELECT 
  s.name,
  sts.total_input_tokens,
  sts.total_output_tokens,
  sts.total_tokens,
  ROUND((sts.total_tokens / 200000.0) * 100, 1) as percentage_if_no_overhead
FROM sessions s
JOIN session_token_summary sts ON s.id = sts.session_id
WHERE sts.total_tokens > 1000  -- Only show sessions with meaningful activity
ORDER BY sts.total_tokens DESC
LIMIT 10;

-- Show the specific sessions that were problematic
SELECT 'PROBLEMATIC SESSIONS FIXED:' as info;
SELECT 
  s.name,
  sts.total_input_tokens,
  sts.total_output_tokens,
  sts.total_tokens,
  ROUND((sts.total_tokens / 200000.0) * 100, 1) as percentage_if_no_overhead
FROM sessions s
JOIN session_token_summary sts ON s.id = sts.session_id
WHERE s.name IN ('theme-change-4', 'auto-commit-modes-2', 'theme-change-3')
ORDER BY s.name;