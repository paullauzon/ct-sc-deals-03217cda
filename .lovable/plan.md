
The user has access to `id@captarget.com` but it's not used for sales. The other captarget sales emails (Adam's, etc.) live on Gmail. The sourcecodeals.com tenant on Outlook is still pending admin consent.

Key question: should we connect `id@captarget.com` now, or wait?

Let me think through this carefully.

**What `id@captarget.com` would give us:**
- Proves the Gmail connector + gateway works end-to-end (de-risks the integration before real sales mailboxes connect)
- Lets me build and test `sync-gmail-emails`, send-via-Gmail in `EmailComposeDrawer`, tracking pixel injection, and click rewriting against a real mailbox
- Zero risk: no real sales emails to worry about, no privacy concerns, no accidental sends to prospects from a non-sales address

**What it would NOT give us:**
- Zero historical sales correspondence to ingest (mailbox is empty of leads)
- Adam's actual sent items / replies won't appear — those are in his personal Gmail
- Won't surface real opens/clicks against real prospects
- Sending from `id@captarget.com` to a prospect would look weird (wrong sender identity) — so we wouldn't actually use it for outbound in production

**The strategic call:**

This is exactly the right kind of "dev/staging mailbox" to connect. It de-risks the whole Gmail pipeline so when Adam (or anyone) connects their real mailbox later, it's a one-click switch with proven infra.

But — important nuance — the connector authenticates the **developer** (whoever clicks Connect), not each end-user. So if Adam connects `id@captarget.com` now, that single connection is what the gateway uses. When his personal `adam.haile@captarget.com` needs to be the sending mailbox, he'd have to either:
- (a) Disconnect `id@` and reconnect as `adam.haile@`, OR
- (b) We architect for per-user OAuth from day one (each sales rep authorizes their own mailbox, tokens stored per user_id in DB)

For a 2-3 person sales team across two brands, option (b) is the right long-term architecture anyway — but it's bigger scope. Option (a) is fine for v7.

**My recommendation:**

Connect `id@captarget.com` now as a **dev/test mailbox** to build & validate the entire Gmail pipeline (sync, send, tracking, threading). Once proven, swap to Adam's real Gmail by reconnecting. Defer multi-user per-mailbox OAuth to v8 once we know how the team wants to operate.

Alternative: skip Gmail entirely for now, build only the provider-agnostic tracking infra + schema migration, and wait for either (a) Outlook admin consent or (b) Adam to be ready to connect his real Gmail.

I'll present 3 clean paths and let the user choose. Keep it tight.
