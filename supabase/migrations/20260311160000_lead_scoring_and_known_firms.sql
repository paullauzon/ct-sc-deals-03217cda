-- Add lead scoring columns to the existing leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage1_score           integer,
  ADD COLUMN IF NOT EXISTS tier                   integer,
  ADD COLUMN IF NOT EXISTS tier_override          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS known_firm_match       text,
  ADD COLUMN IF NOT EXISTS known_firm_domain_type text,
  ADD COLUMN IF NOT EXISTS pe_backed              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pe_sponsor_name        text,
  ADD COLUMN IF NOT EXISTS stage2_score           integer,
  ADD COLUMN IF NOT EXISTS enrichment_status      text,
  ADD COLUMN IF NOT EXISTS website_url            text,
  ADD COLUMN IF NOT EXISTS website_score          integer,
  ADD COLUMN IF NOT EXISTS pe_backed_stage2       boolean,
  ADD COLUMN IF NOT EXISTS portfolio_count        integer,
  ADD COLUMN IF NOT EXISTS last_acquisition_year  integer,
  ADD COLUMN IF NOT EXISTS linkedin_url           text,
  ADD COLUMN IF NOT EXISTS linkedin_title         text,
  ADD COLUMN IF NOT EXISTS linkedin_ma_experience boolean,
  ADD COLUMN IF NOT EXISTS linkedin_score         integer,
  ADD COLUMN IF NOT EXISTS seniority_score        integer;

-- Create known_buyer_firms lookup table
CREATE TABLE IF NOT EXISTS known_buyer_firms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text UNIQUE NOT NULL,
  firm_name     text NOT NULL,
  firm_type     text NOT NULL,
  lmm_focused   boolean DEFAULT true,
  pe_confirmed  boolean DEFAULT false,
  pe_sponsor    text,
  aum_tier      text,
  active        boolean DEFAULT true,
  added_date    timestamptz DEFAULT now(),
  added_by      text
);

-- Open RLS policy (matches existing pattern)
ALTER TABLE known_buyer_firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to known_buyer_firms"
  ON known_buyer_firms
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed known buyer firms
INSERT INTO known_buyer_firms (domain, firm_name, firm_type, lmm_focused, pe_confirmed, pe_sponsor, aum_tier, active) VALUES
  -- PE Firms from live lead dataset
  ('kinderhook.com',               'Kinderhook Industries',        'pe_firm',       true,  false, null,      'mid',   true),
  ('auxopartners.com',             'Auxo Investment Partners',     'pe_firm',       true,  false, null,      'small', true),
  ('pikestreetcapital.com',        'Pike Street Capital',          'pe_firm',       true,  false, null,      'small', true),
  ('baymarkpartners.com',          'Baymark Partners',             'pe_firm',       true,  false, null,      'small', true),
  ('bluesage.com',                 'Blue Sage Capital',            'pe_firm',       true,  false, null,      'small', true),
  ('cornerstone-cap.com',          'Cornerstone Capital',          'pe_firm',       true,  false, null,      'small', true),
  ('compasspartners.com',          'Compass Partners',             'pe_firm',       true,  false, null,      'small', true),
  ('clarendoncap.com',             'Clarendon Capital',            'pe_firm',       true,  false, null,      'small', true),
  ('cgep.com',                     'CGE Partners',                 'pe_firm',       true,  false, null,      'small', true),
  ('bluecardinalhsg.com',          'Blue Cardinal',                'pe_firm',       true,  false, null,      'small', true),
  ('skyharbor.co',                 'Sky Harbor Capital',           'pe_firm',       true,  false, null,      'small', true),
  ('trispanllp.com',               'Trispan LLP',                  'pe_firm',       false, false, null,      'mid',   true),
  ('emsoft.com',                   'EMSoft PE',                    'pe_firm',       true,  false, null,      'small', true),
  ('oceanhawk.co',                 'Ocean Hawk',                   'pe_firm',       true,  false, null,      'small', true),
  ('swiftanchor.com',              'Swift Anchor',                 'family_office', true,  false, null,      'small', true),
  ('castelore.com',                'Castelore',                    'family_office', true,  false, null,      'small', true),
  ('winterfellinvestments.com',    'Winterfell Investments',       'pe_firm',       true,  false, null,      'small', true),
  -- SourceCo retained buy-side clients
  ('gemspring.com',                'Gemspring Capital',            'pe_firm',       true,  false, null,      'mid',   true),
  ('newheritage.com',              'New Heritage Capital',         'pe_firm',       true,  false, null,      'small', true),
  ('o2investment.com',             'O2 Investment Partners',       'pe_firm',       true,  false, null,      'small', true),
  -- Platform companies
  ('nedshome.com',                 'Neds Home',                    'platform',      true,  true,  'Cobepa',  'mid',   true),
  ('wearealchemy.com',             'Alchemy',                      'platform',      false, false, null,      null,    true),
  ('tesmollc.com',                 'TESMO LLC',                    'platform',      false, false, null,      null,    true),
  ('finkgolf.com',                 'Fink Golf',                    'platform',      false, false, null,      null,    true),
  ('sasservicepartners.com',       'SAS Service Partners',         'platform',      false, false, null,      null,    true),
  ('willowriver.com',             'Willow River',                  'platform',      false, false, null,      null,    true)
ON CONFLICT (domain) DO NOTHING;
