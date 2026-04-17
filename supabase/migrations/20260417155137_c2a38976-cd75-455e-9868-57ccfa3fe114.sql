UPDATE leads
SET target_criteria = ''
WHERE id IN ('CT-018','CT-028','CT-047','CT-062','SC-T-004','SC-T-033','SC-T-042')
  AND archived_at IS NULL;