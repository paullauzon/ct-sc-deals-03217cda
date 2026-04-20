

# Can we just use the Lovable Outlook connector? Short answer: **No** — and here's why

## What the Lovable Outlook connector actually is

Per the official connector docs:

> "This connector provides access to the **developer's own Outlook mailbox** — the Microsoft account that completed the OAuth flow when setting up the connection. **All API calls access that account's emails.**"
>
> "If your app needs each end-user to access their own Outlook mailbox … you need per-user OAuth instead of this connector."

The connector is a **single shared mailbox**, authenticated once by whoever sets it up, accessed via a gateway with one shared API key (`MICROSOFT_OUTLOOK_API_KEY`). That's exactly what `sync-outlook-emails` was originally built around — and exactly why it's stuck.

## Why this doesn't work for our CRM

| Requirement | Connector can do it? |
|---|---|
| Adam syncs his `adam@sourcecodeals.com` Outlook | ⛔ Only if Adam is the one workspace-wide developer who set up the connector |
| Malik syncs `malik@sourcecodeals.com` from the same workspace | ⛔ Impossible — only one connection at a time, and switching it would log Adam out |
| Future SourceCo rep joins → connects their own mailbox | ⛔ Same problem — they'd overwrite the previous rep |
| Sent email from a Deal Room lands in **the actual rep's** Sent folder | ⛔ Lands in the single connected mailbox only |
| Email replies attributed to the right rep in the activity timeline | ⛔ All sync traffic looks like it came from one mailbox |

This is the **exact same architectural mismatch** Gmail had — and why we built per-user OAuth there (`gmail-oauth-start` / `gmail-oauth-callback` / per-rep rows in `user_email_connections`). Each Captarget rep clicks "Connect Gmail" and gets their own row with their own refresh token. Outlook needs to mirror that pattern, not the connector pattern.

## Why the connector pattern works for *some* tools but not email

The Lovable connectors are perfect when there's **one shared corporate account** doing the work:
- Slack → company Slack workspace, post messages from the bot
- Resend → company sending domain, transactional emails
- Firecrawl → API key, no user identity at all

Email is different because **identity is the product**. A reply has to come from Malik's mailbox, not from a generic CRM mailbox. The recipient's reply has to land in Malik's inbox. Sync has to attribute to Malik. The connector model fundamentally can't do that — it's one mailbox, full stop.

## The connector path *would* only make sense if

You wanted a **single shared CRM mailbox** like `crm@sourcecodeals.com` that all reps send through (BCC'ing their personal accounts for visibility). That's a valid but very different product decision — every prospect would see "crm@…" not "adam@…", reply rates would tank, and you'd lose the per-rep mailbox separation Gmail already gives Captarget.

## Recommendation: stick with the per-user Azure App Registration plan

The plan from the prior message stands as-is. Concretely:

1. You (or whoever owns the SourceCo Microsoft tenant) registers **one Azure app** with delegated permissions: `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`.
2. Each SourceCo rep clicks "Connect Outlook" in Settings → authorizes with their own Microsoft account → their refresh token lands in `user_email_connections` (provider='outlook').
3. Same exact UX, sync cadence, AI-draft stamping, and reply-trigger pipeline as Gmail.

The Azure registration is a **one-time 5-minute setup** — and once done, every SourceCo rep self-serves forever with no further admin work.

## What I need from you to proceed

| Item | Where to get it |
|---|---|
| `MICROSOFT_CLIENT_ID` | Azure portal → App registrations → your app → Overview |
| `MICROSOFT_CLIENT_SECRET` | Azure portal → App registrations → your app → Certificates & secrets → New client secret |
| Redirect URI registered in Azure | `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback` |
| Delegated scopes in Azure | `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access` |

Once those are in place, the implementation is the 8-file build outlined in the previously-approved plan.

## TL;DR

The Lovable Outlook connector is a **single-mailbox developer tool**, not a multi-rep email sync engine. Using it would break per-rep attribution, sent-folder placement, and inbox routing — the three things that make CRM email actually useful. We need the same per-user OAuth pattern Gmail already uses.

