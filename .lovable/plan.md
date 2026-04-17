

The user wants to ship a Zapier-based bridge from their Outlook (sourcecodeals.com) into the existing `ingest-email` edge function while waiting for: (a) the Outlook tenant admin consent, and (b) the captarget.com Workspace admin to set up Google Cloud OAuth.

Let me think about what's already in place vs what needs to happen.

**What already exists (verified from code):**
- `supabase/functions/ingest-email/index.ts` is fully functional — accepts POST with `from`, `to`, `subject`, `body_preview`, `date`, `thread_id`, `message_id`. Bearer-auth via `INGEST_API_KEY`. Dedupes on `message_id`. Auto-matches lead by external email. Inserts into `lead_emails` with `source: "zapier"`. Memory file `mem://features/email-correspondence-tracking` confirms this is the "Zapier active for inbound" path that's already shipping.
- `lead_emails` schema supports everything Zapier sends.
- The metric materializer (`lead_email_metrics` view) and EmailMetricsCard already render whatever lands in `lead_emails`.

**What's missing for an Outlook→Zapier bridge:**
1. **Zapier Zap configuration** — user-side, not code. Microsoft Outlook trigger ("New Email") → Webhooks by Zapier ("POST" action) → our `ingest-email` URL with the right field mapping and `Authorization: Bearer ${INGEST_API_KEY}` header.
2. **Outbound (sent) coverage** — Zapier's "New Email" trigger watches Inbox by default. To capture sent emails (so we know Adam replied), need a second Zap watching the Sent Items folder.
3. **Direction detection** — `ingest-email` already handles this via `INTERNAL_DOMAINS` check on `from` address. Good.
4. **Body content** — current `ingest-email` only takes `body_preview` (first 5000 chars). For threading/AI follow-ups, we'd ideally want full HTML/text. Outlook via Zapier exposes `Body Plain` and `Body HTML`. Quick schema add: accept optional `body_text` and `body_html` and store them in the existing columns (already on `lead_emails` per the Outlook function).
5. **Thread/Message IDs** — Zapier exposes `Message ID` and `Conversation ID` from Outlook. Map to `message_id` and `thread_id` for proper threading.
6. **Recipients** — Zapier exposes `To`, `Cc`, `Bcc`. Current code parses `to` only. Quick add: accept `cc` and `bcc`.
7. **No tracking pixels / opens / clicks** — Zapier path can't deliver these. Acceptable trade-off until real send infra ships.
8. **Sending from app** — out of scope for Zapier path. Compose drawer stays in "Copy & mark sent" mode for now.

**Cost/effort honesty:**
- Code-side: ~30 min. Tiny enhancement to `ingest-email` to accept `body_text`, `body_html`, `cc`, `bcc`. Zero schema migration (columns already exist from the Outlook function). No new edge functions.
- User-side: 10-15 min in Zapier UI. Two Zaps (Inbox + Sent Items). Need a Zapier paid plan if doing >100 tasks/month (likely needed at sales volume).
- Limitations to disclose: 5-15 min latency (Zapier polling), no opens/clicks, no in-app send, Zapier task quota costs money at volume.

**Why this is actually a smart bridge:**
- Captarget side already runs through Zapier (per memory). Adding sourcecodeals via Zapier creates *symmetry* — both brands on the same ingest path until proper OAuth lands.
- Provider-agnostic infra work isn't wasted — the `lead_emails` schema is the same target.
- Zero risk to existing Captarget Zapier flow (separate Zaps, same endpoint).
- When Outlook admin consent finally lands, the existing `sync-outlook-emails` function takes over and we just pause/disable the Zapier Zaps. No cleanup needed because dedup is on `message_id`.

**Memory to save:** the user explicitly said "remember all of this for later" referring to the admin/OAuth status. Need to update `mem://integrations/email-sync-status` with current state.

I'll present a tight plan: tiny code enhancement + step-by-step Zapier Zap config the user can execute themselves.

---

# Plan: Outlook → Zapier → CRM bridge (interim)

## What we're building

While waiting for (a) sourcecodeals.com tenant admin consent for Outlook deep sync and (b) captarget.com Workspace admin for Gmail OAuth, route Outlook emails through Zapier into the existing `ingest-email` endpoint. Same path Captarget already uses — creates brand symmetry.

## Code changes (small)

**1. Enhance `supabase/functions/ingest-email/index.ts`**
- Accept optional fields: `body_text`, `body_html`, `cc`, `bcc`, `conversation_id`
- Map `conversation_id` → `thread_id` (Outlook's term)
- Store `body_text` and `body_html` in the existing columns on `lead_emails` (already there from `sync-outlook-emails`)
- Keep all existing behavior (dedup, internal-domain direction detection, lead matching)

**2. Update memory**
- Save current waiting-on-admin status to `mem://integrations/email-sync-status` so future sessions know context
- Note that Zapier-Outlook bridge is the interim solution

No schema migration needed. No new functions. ~30 lines changed.

## User-side: Zapier setup (you do this)

You'll create **two Zaps** (one for Inbox, one for Sent Items). I'll give you exact field mappings.

**Zap 1: Outlook Inbox → CRM**
- Trigger: Microsoft Outlook → "New Email" → folder: Inbox
- Action: Webhooks by Zapier → "POST"
  - URL: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-email`
  - Headers: `Authorization: Bearer <INGEST_API_KEY>` + `Content-Type: application/json`
  - Body (JSON): exact field map I'll provide (from, to, cc, bcc, subject, body_text, body_html, date, message_id, conversation_id)

**Zap 2: Outlook Sent Items → CRM** — same recipe, different folder

## Trade-offs (honest)

| | Zapier bridge | Real Outlook OAuth (when admin approves) |
|---|---|---|
| Latency | 5-15 min polling | <1 min via cron |
| Sent emails | ✅ via 2nd Zap | ✅ |
| Opens/clicks tracking | ❌ | ✅ (when we add tracking pixels) |
| Send-from-app | ❌ (still copy/paste) | ✅ |
| Cost | Zapier Pro ~$30/mo at volume | Free |
| Switch-over effort | Zero — disable Zap, dedup on message_id prevents duplicates | — |

## What this unblocks

- Real sourcecodeals.com sales correspondence flowing into the CRM **today**
- All existing intelligence (lead matching, EmailMetricsCard, AskDeal context, follow-up suggestions) works immediately
- No wasted work — when proper OAuth lands, we flip a switch and nothing changes downstream

## What this does NOT do

- No tracking pixels (need real send infra)
- No in-app sending (compose drawer stays "Copy & mark sent")
- No Gmail (still waiting on captarget admin)

## After plan approval, exact sequence

1. I update `ingest-email` (5 min)
2. I save the memory file (1 min)
3. I give you a step-by-step Zapier setup walkthrough with screenshots-by-words for both Zaps
4. You build the Zaps (~15 min)
5. We test with one real email end-to-end
6. Done — sourcecodeals Outlook is live via Zapier

