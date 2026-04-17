-- 1) buyer_type ← normalized role
UPDATE public.leads
SET buyer_type = CASE
  WHEN lower(role) LIKE '%family office%' THEN 'Family Office'
  WHEN lower(role) LIKE '%search fund%' THEN 'Search Fund'
  WHEN lower(role) LIKE '%independent sponsor%' THEN 'Independent Sponsor'
  WHEN lower(role) LIKE '%private equity%' OR lower(role) = 'pe' OR lower(role) LIKE '%pe firm%' THEN 'PE Firm'
  WHEN lower(role) LIKE '%individual%' OR lower(role) LIKE '%hnwi%' OR lower(role) LIKE '%high net worth%' THEN 'HNWI'
  WHEN lower(role) LIKE '%business owner%' OR lower(role) LIKE '%strategic%' OR lower(role) LIKE '%corporate%' THEN 'Strategic / Corporate'
  WHEN lower(role) LIKE '%holdco%' OR lower(role) LIKE '%holding%' THEN 'Holdco'
  ELSE buyer_type
END
WHERE COALESCE(buyer_type, '') = '' AND COALESCE(role, '') <> '';

-- 2) target_revenue ← regex on message
UPDATE public.leads l
SET target_revenue = '$' || (rev.match)[1] || upper(COALESCE(NULLIF((rev.match)[2], ''), (rev.match)[4])) || '-' || (rev.match)[3] || upper((rev.match)[4])
FROM (
  SELECT sub.id, m.match
  FROM (
    SELECT id, message FROM public.leads
    WHERE COALESCE(target_revenue, '') = '' AND COALESCE(message, '') <> ''
  ) sub
  JOIN LATERAL (
    SELECT regexp_matches(sub.message, '\$?\s?([\d.]+)\s?([mk]?)\s?[-–to]+\s?\$?\s?([\d.]+)\s?([mk])\s+(?:in\s+)?(?:revenue|sales|topline|arr)', 'i') AS match
  ) m ON true
) rev
WHERE l.id = rev.id AND COALESCE(l.target_revenue, '') = '';

-- 3) geography ← regex on message
UPDATE public.leads l
SET geography = trim(regexp_replace((g.match)[1], '[,.;].*$', ''))
FROM (
  SELECT sub.id, m.match
  FROM (
    SELECT id, message FROM public.leads
    WHERE COALESCE(geography, '') = '' AND COALESCE(message, '') <> ''
  ) sub
  JOIN LATERAL (
    SELECT regexp_matches(
      sub.message,
      '\b(?:southern|northern|eastern|western|central)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)|\b(midwest|midwestern|northeast|southeast|southwest|northwest|west coast|east coast|sun belt|rust belt|new england)\b|\b(canada|usa|united states|uk|united kingdom|europe|emea|apac|latam|mexico|ontario|quebec|texas|california|florida|new york)\b',
      'i'
    ) AS match
  ) m ON true
) g
WHERE l.id = g.id
  AND COALESCE(trim(regexp_replace(COALESCE((g.match)[1], (g.match)[2], (g.match)[3], ''), '[,.;].*$', '')), '') <> ''
  AND COALESCE(l.geography, '') = '';