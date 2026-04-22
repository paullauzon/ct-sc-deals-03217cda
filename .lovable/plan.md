

# Phase 9 — Close the real gaps (no cosmetic-only features)

After deep end-to-end inspection of every wireframe element against the actual code, **almost everything is built and wired**. But three pieces are deceptive: they look done in the UI but the backend silently ignores them. Plus one wireframe surface (form-research on first outbound) was never implemented. This phase fixes those four real gaps. Everything else from your original prompt is shipped.

## What's actually broken (confirmed by reading edge function code)

### Gap A — `tracking_enabled` toggle is purely cosmetic
`EmailComposerV2` shows a "Tracking ON/OFF" pill, persists it to `mailbox_preferences`, and passes `tracking_enabled` in the send payload. **Both `send-gmail-email/index.ts` and `send-outlook-email/index.ts` never read it** — they unconditionally inject the open pixel and rewrite every link. So toggling OFF does nothing.

### Gap B — Attachment picker uploads but never attaches
`EmailComposerV2` uploads files to the `email-attachments` bucket and passes `attachments: [{name, url, size}]`. **Neither send function reads `attachments`**. The files sit in storage; the recipient gets an email with zero attachments. Wireframe lists "Attach" as a first-class compose action.

### Gap C — Form-research on first email (wireframe AI #6 / S1) never wired
The wireframe explicitly calls out: *"Before S1 sends: AI visits firm website, reads portfolio and thesis. Finds one specific fact to reference in line 1. Never generic."* The pieces exist (`enrich-lead`, `backfill-discover`) but are tied to lead ingestion, not to the first outbound compose. There is no signal flowing into `compose-email-drafts` that says "this is the first email — inject one website-derived fact into line 1."

### Gap D — `send_status='scheduled'` rows never get tracking
When a draft is scheduled (via `process-scheduled-emails` cron), the row is created without going through the same pixel/link-rewrite path. Confirm in code; if true, scheduled sends do not generate opens/clicks data. Fix in the same pass.

## Build plan (one focused phase, ~5 surgical edits)

### Edit 1 — Honor `tracking_enabled` in both send functions
- `send-gmail-email/index.ts` and `send-outlook-email/index.ts`: read `tracking_enabled` from the body. If `false`:
  - Skip `rewriteLinks` (leave hrefs untouched)
  - Skip the `pixelTag` injection
  - Set `lead_emails.tracked = false` so the UI doesn't promise opens that will never come
- The toggle becomes real. Per-mailbox preference already loads correctly client-side.

### Edit 2 — Honor `attachments` in both send functions
- `send-gmail-email/index.ts`: extend `buildRfc822` to add `multipart/mixed` outer boundary when attachments are present. For each attachment: fetch the public URL, base64-encode, add a part with `Content-Disposition: attachment; filename="..."` and the correct MIME type from the URL extension.
- `send-outlook-email/index.ts`: Microsoft Graph `messages` endpoint accepts an `attachments` array of `@odata.type: #microsoft.graph.fileAttachment` with `contentBytes` (base64). Wire that up.
- Persist the attachment list to `lead_emails.attachments` so it shows up in the thread.

### Edit 3 — First-email research injection
- New small edge function `research-first-email-fact` (GPT-5):
  - Input: `{ leadId }`. Reads `lead.companyUrl` / `lead.linkedin`, fetches a brief website snapshot (re-uses existing `backfill-discover` helper).
  - Output: `{ fact: string, source_url: string }` — one specific, citable line (e.g. "BrightPath Software in your portfolio").
  - Cached on `leads.first_email_fact` + `first_email_fact_source` columns (new tiny migration) so it only runs once per lead.
- `compose-email-drafts/index.ts`: when no prior outbound exists for this lead, call `research-first-email-fact` and inject the fact into the system prompt as a required reference. Drafts must contain that fact in line 1 or 2.

### Edit 4 — Apply tracking to scheduled sends
- `process-scheduled-emails/index.ts`: when invoking the send function, forward the same `tracking_enabled` and `attachments` fields from the scheduled row's metadata. Confirm the scheduled row stores both at create time (add columns if not present).

### Edit 5 — Surface a small "Tracking off · this mailbox" line in the EmailTabHeader
- Two-line inline note when `mailbox_preferences.tracking_enabled = false` for the rep's primary mailbox: *"Open/click tracking disabled for m.hayes@captarget.com — engagement metrics will not populate."* Prevents Malik staring at an empty Open Rate KPI wondering why.

## Verification plan

1. **Tracking off**: Toggle tracking off in compose, send an email, inspect the row — `tracked = false`, body HTML in `lead_emails` has zero pixel and original hrefs intact. Toggle on, send again — pixel and rewritten links present.
2. **Attachments**: Attach a 1MB PDF, send to a personal address, confirm Gmail/Outlook delivers the file. `lead_emails.attachments` populated.
3. **First-email research**: Pick a lead with `companyUrl` set and zero prior outbound; click Compose → confirm one of the 3 drafts cites a website-specific fact in line 1. Re-open compose for same lead, confirm `leads.first_email_fact` is reused (no duplicate research call).
4. **Scheduled send**: Schedule an email with tracking off + attachment for 2 minutes out, wait, confirm sent message respects both.
5. **UI banner**: Toggle tracking off, refresh email tab, confirm the small notice appears.

## Out of scope (intentional, after this audit)

- **Mobile email summary view** — you flagged out of scope from Phase 1.
- **Outlook deep-sync UI** — paused pending Josh's tenant approval. Code already handles it once OAuth lights up.
- **Per-deal Intelligence pattern view** — `Settings → AI Learning` already shows the matrix. Per-deal slicing has near-zero data per deal and would mislead. Revisit at 90 days.
- **Historical click rewriting** — physically impossible.
- **Default-OFF "do not train" toggle** — current default-ON with per-send override matches your earlier confirmation.

