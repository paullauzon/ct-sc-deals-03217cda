UPDATE processing_jobs 
SET status = 'failed', 
    error = 'Timed out — edge function did not complete', 
    acknowledged = true 
WHERE status = 'processing';