-- Recalculate token tracking for auto-commit-modes-2 session
-- This script fixes the incorrect token counting that was including cache tokens as new tokens

-- Session ID for auto-commit-modes-2
-- e48185d1-504a-497d-8893-03c232a6841c

-- First, let's clear the incorrect data
DELETE FROM message_token_usage WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c';
DELETE FROM session_token_summary WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c';
DELETE FROM token_usage_history WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c';

-- Now let's recalculate with the corrected logic
-- Extract only input_tokens and output_tokens (not cache tokens) from the raw data

INSERT INTO message_token_usage (session_id, output_id, message_type, input_tokens, output_tokens, total_tokens, timestamp)
SELECT 
  'e48185d1-504a-497d-8893-03c232a6841c' as session_id,
  id as output_id,
  'assistant' as message_type,
  COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) as input_tokens,
  COALESCE(json_extract(data, '$.usage.output_tokens'), json_extract(data, '$.message.usage.output_tokens'), 0) as output_tokens,
  (COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) + 
   COALESCE(json_extract(data, '$.usage.output_tokens'), json_extract(data, '$.message.usage.output_tokens'), 0)) as total_tokens,
  timestamp
FROM session_outputs 
WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c' 
  AND type = 'json' 
  AND (json_extract(data, '$.usage.input_tokens') > 0 OR json_extract(data, '$.message.usage.input_tokens') > 0);

-- Create the corrected session token summary
INSERT INTO session_token_summary (session_id, total_input_tokens, total_output_tokens, total_tokens, last_updated)
SELECT 
  session_id,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens, 
  SUM(total_tokens) as total_tokens,
  datetime('now') as last_updated
FROM message_token_usage 
WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c'
GROUP BY session_id;

-- Now populate token_usage_history with context window data
-- This uses cache data to show actual context window usage at each point
INSERT INTO token_usage_history (
  session_id, 
  output_id,
  input_tokens, 
  output_tokens, 
  context_window_tokens,
  timestamp
)
SELECT 
  'e48185d1-504a-497d-8893-03c232a6841c' as session_id,
  id as output_id,
  COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) as input_tokens,
  COALESCE(json_extract(data, '$.usage.output_tokens'), json_extract(data, '$.message.usage.output_tokens'), 0) as output_tokens,
  (COALESCE(json_extract(data, '$.usage.input_tokens'), json_extract(data, '$.message.usage.input_tokens'), 0) + 
   COALESCE(json_extract(data, '$.usage.cache_creation_input_tokens'), json_extract(data, '$.message.usage.cache_creation_input_tokens'), 0) +
   COALESCE(json_extract(data, '$.usage.cache_read_input_tokens'), json_extract(data, '$.message.usage.cache_read_input_tokens'), 0)) as context_window_tokens,
  timestamp
FROM session_outputs 
WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c' 
  AND type = 'json' 
  AND (json_extract(data, '$.usage.input_tokens') >= 0 OR json_extract(data, '$.message.usage.input_tokens') >= 0)
ORDER BY id;

-- Show the results
SELECT 'CORRECTED TOKEN SUMMARY' as info;
SELECT * FROM session_token_summary WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c';

SELECT 'LATEST CONTEXT WINDOW USAGE' as info;
SELECT context_window_tokens, timestamp 
FROM token_usage_history 
WHERE session_id = 'e48185d1-504a-497d-8893-03c232a6841c' 
  AND context_window_tokens > 0
ORDER BY timestamp DESC 
LIMIT 5;