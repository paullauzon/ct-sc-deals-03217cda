
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to processing_jobs"
ON public.processing_jobs
FOR ALL
USING (true)
WITH CHECK (true);
