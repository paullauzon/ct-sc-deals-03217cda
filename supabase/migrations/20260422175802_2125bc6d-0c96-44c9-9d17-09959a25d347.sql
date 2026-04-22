SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'reclaim-unmatched-backlog-weekly',
  'auto-suggest-intermediaries-daily',
  'daily-attribution-health'
);

SELECT cron.schedule(
  'reclaim-unmatched-backlog-weekly',
  '0 3 * * 0',
  $$ select net.http_post(
    url:='https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/reclaim-unmatched-backlog',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsdmxmdHF6Y3R5d2xyc2RseXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzk4NjQsImV4cCI6MjA4ODExNTg2NH0.6G-62pX8jLy75pOI_RHcJZl4iLeQgZVX5VIQTmJsixk"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'auto-suggest-intermediaries-daily',
  '0 5 * * *',
  $$ select net.http_post(
    url:='https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/auto-suggest-intermediaries',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsdmxmdHF6Y3R5d2xyc2RseXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzk4NjQsImV4cCI6MjA4ODExNTg2NH0.6G-62pX8jLy75pOI_RHcJZl4iLeQgZVX5VIQTmJsixk"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'daily-attribution-health',
  '0 6 * * *',
  $$ select net.http_post(
    url:='https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/daily-attribution-health',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsdmxmdHF6Y3R5d2xyc2RseXR5Iiwicm9sZSI6ImFub24iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3MjUzOTg2NCwiZXhwIjoyMDg4MTE1ODY0fQ.6G-62pX8jLy75pOI_RHcJZl4iLeQgZVX5VIQTmJsixk"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);