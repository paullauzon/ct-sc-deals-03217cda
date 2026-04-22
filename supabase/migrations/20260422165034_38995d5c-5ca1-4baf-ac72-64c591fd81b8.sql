
-- Round-4 final verification cleanup: residual external misroutes and split threads
BEGIN;

-- 1. SC-I-003 was wrongly marked as duplicate of nonexistent CT-070; Jordi at Valar is a separate firm from Jordi at Pare Group.
UPDATE public.leads SET is_duplicate = false, duplicate_of = '' WHERE id = 'SC-I-003';

-- 2. Move 7 emails where the from_address exactly matches another active lead's primary email.
-- Heuristic: the sender's own canonical lead wins over a different lead that happened to have them as a secondary contact.
UPDATE public.lead_emails le
SET lead_id = sender.id
FROM public.leads sender
WHERE LOWER(sender.email) = LOWER(le.from_address)
  AND sender.archived_at IS NULL
  AND sender.is_duplicate = false
  AND le.lead_id <> sender.id
  AND le.lead_id <> 'unmatched'
  AND LOWER(le.from_address) NOT LIKE '%@captarget.com'
  AND LOWER(le.from_address) NOT LIKE '%@sourcecodeals.com';

-- 3. Consolidate 9 split threads to their majority lead_id (largest message count wins; ties broken by lead_id).
WITH thread_majority AS (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    lead_id AS majority_lead
  FROM public.lead_emails
  WHERE thread_id IN (
    '19d54e4362719b1e','19c9c3c7b9246e8b','195917adada9135a','19c443d9e5afee99',
    '19c976806abe3c07','19c9c76544a5ae42','19d78cd35777dc21','19916a8497d4865b','19bbae9bfa27aa3f'
  )
  AND lead_id <> 'unmatched'
  GROUP BY thread_id, lead_id
  ORDER BY thread_id, COUNT(*) DESC, lead_id
)
UPDATE public.lead_emails le
SET lead_id = tm.majority_lead
FROM thread_majority tm
WHERE le.thread_id = tm.thread_id
  AND le.lead_id <> tm.majority_lead;

COMMIT;
