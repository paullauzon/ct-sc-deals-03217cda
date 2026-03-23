UPDATE leads
SET meetings = (
  SELECT COALESCE(jsonb_agg(
    CASE 
      WHEN length(COALESCE(m->>'transcript', '')) < 50 
      THEN m || '{"noRecording": true, "summary": "No recording available", "transcript": ""}'::jsonb
      ELSE m
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(meetings) m
),
deal_intelligence = NULL
WHERE id IN ('CT-051', 'CT-036', 'SC-T-026', 'CT-044', 'SC-I-032')
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(meetings) m
  WHERE length(COALESCE(m->>'transcript', '')) < 50
)