CREATE OR REPLACE FUNCTION public.list_cron_run_details(_limit_per_job int DEFAULT 3)
RETURNS TABLE(jobname text, runid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT j.jobname::text, d.runid, d.status::text, d.return_message::text, d.start_time, d.end_time
  FROM cron.job j
  JOIN LATERAL (
    SELECT runid, status, return_message, start_time, end_time
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT _limit_per_job
  ) d ON true
  ORDER BY j.jobname, d.start_time DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_cron_run_details(int) TO authenticated, service_role;