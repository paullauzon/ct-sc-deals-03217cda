UPDATE public.leads
SET archived_at = now(),
    archive_reason = 'Internal test submission — predates exclusion filter'
WHERE id = 'TGT-021' AND archived_at IS NULL;