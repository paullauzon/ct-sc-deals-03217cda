-- Session 9 pre-screen backfill: auto-flip pre_screen_completed for active leads
-- that already carry minimum dossier signal (form-tier dossier coverage exists).
UPDATE public.leads
SET pre_screen_completed = true
WHERE archived_at IS NULL
  AND pre_screen_completed = false
  AND stage NOT IN ('Lost','Went Dark','Closed Won','Revisit/Reconnect')
  AND (
    buyer_type <> '' OR target_criteria <> '' OR target_revenue <> '' OR
    ebitda_min <> '' OR geography <> '' OR acq_timeline <> '' OR acquisition_strategy <> ''
  );