
-- Email templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text NOT NULL DEFAULT 'Captarget',
  subject_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_by text NOT NULL DEFAULT '',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_templates"
  ON public.email_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_email_templates_brand ON public.email_templates(brand);

-- Scheduled send columns on lead_emails
ALTER TABLE public.lead_emails
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'sent';

-- send_status values: 'sent' (already sent / inbound), 'scheduled', 'cancelled', 'failed'
CREATE INDEX IF NOT EXISTS idx_lead_emails_scheduled
  ON public.lead_emails(scheduled_for)
  WHERE send_status = 'scheduled';

-- Seed 6 default templates (idempotent via NOT EXISTS)
INSERT INTO public.email_templates (name, brand, category, subject_template, body_template, created_by)
SELECT * FROM (VALUES
  (
    'Discovery follow-up',
    'Captarget',
    'follow-up',
    'Following up — {{company}}',
    'Hi {{first_name}},

Thanks for the call earlier. Quick recap of where we landed:

- You''re looking at {{service_interest}}
- Next step we agreed: 

Let me know if anything changed on your end. Happy to put a proposal together when you''re ready.

',
    'system'
  ),
  (
    'Proposal nudge',
    'Captarget',
    'nudge',
    'Proposal — {{company}}',
    'Hi {{first_name}},

Circling back on the proposal we sent over. Anything you''d like me to adjust before you take it to the team?

Happy to jump on a quick call if it''s easier to talk through.

',
    'system'
  ),
  (
    'Proof / case study',
    'Captarget',
    'proof',
    'Quick example of similar work',
    'Hi {{first_name}},

Thought this might be useful — we recently helped a buyer in a similar position to {{company}} originate three off-market opportunities in 90 days.

Want me to send the one-pager?

',
    'system'
  ),
  (
    'Re-engage stale',
    'Captarget',
    're-engage',
    'Still on the table?',
    'Hi {{first_name}},

It''s been a while since we connected on {{service_interest}}. Has anything shifted on your acquisition timeline?

If now isn''t the right moment, just say the word and I''ll close the file.

',
    'system'
  ),
  (
    'Calendly link',
    'Captarget',
    'scheduling',
    'Time to chat — {{company}}',
    'Hi {{first_name}},

Easier than going back-and-forth — here''s my calendar: https://calendly.com/

Grab whatever 20-minute slot works for you.

',
    'system'
  ),
  (
    'SourceCo intro',
    'SourceCo',
    'intro',
    '{{company}} — buy-side support',
    'Hi {{first_name}},

Saw you''re actively looking at {{geography}} acquisitions. SourceCo runs dedicated buy-side mandates for funds with a similar profile to {{company}}.

Worth a 15-minute conversation to see if there''s a fit?

',
    'system'
  )
) AS v(name, brand, category, subject_template, body_template, created_by)
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = v.name);
