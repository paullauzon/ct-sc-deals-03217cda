-- target_criteria ← intent phrase first, else first sentence (uses LATERAL for set-returning regex)
UPDATE public.leads l
SET target_criteria = m.crit
FROM (
  SELECT
    sub.id,
    COALESCE(
      NULLIF(trim(intent.match[1]), ''),
      NULLIF(left(split_part(regexp_replace(sub.message, '\s+', ' ', 'g'), '.', 1), 200), '')
    ) AS crit
  FROM (
    SELECT id, message
    FROM public.leads
    WHERE COALESCE(target_criteria, '') = '' AND COALESCE(message, '') <> ''
  ) sub
  LEFT JOIN LATERAL (
    SELECT regexp_matches(
      sub.message,
      '(?:looking for|seeking|targeting|acquir\w+|interested in|focused on|specialize in|pursue)\s+([^.;\n]{8,160})',
      'i'
    ) AS match
  ) intent ON true
) m
WHERE l.id = m.id AND m.crit IS NOT NULL AND m.crit <> '' AND COALESCE(l.target_criteria, '') = '';