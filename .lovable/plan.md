

# Short answer: No, you do NOT need to publish

You can connect Gmail from **either** the Preview URL or the Live URL. Both work identically. The choice depends on which database you want the connection stored in.

## Why publishing doesn't matter for OAuth

The OAuth flow has three URLs in play. Only one of them needs to be registered with Google:

```text
1. Where you START the flow      → Preview OR Live (your choice)
   https://id-preview--...lovable.app/#sys=crm&view=settings
   OR
   https://ct-sc-deals.lovable.app/#sys=crm&view=settings

2. Where Google REDIRECTS to     → Always Supabase (registered in Google Console)
   https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback

3. Where the callback BOUNCES    → Back to wherever you started (step 1)
   Stored in the `state` param, used by gmail-oauth-callback
```

Google only cares that step 2 matches what you registered. Steps 1 and 3 are handled inside our code via the `return_to` param.

## What actually matters: WHICH database

You have two completely separate Supabase databases (per `mem://project/environment-separation`):

| You connect from | Connection saved in | Sync runs against |
|---|---|---|
| Preview URL | Preview DB | Preview DB leads |
| Live URL | Live DB | Live DB leads |

**Both URLs share the same Supabase project ref `qlvlftqzctywlrsdlyty`** — wait, actually they don't. Let me be precise: the redirect URI in the code points to `qlvlftqzctywlrsdlyty.supabase.co`, which is whatever environment that `.env` file is built against. So whichever environment that ref belongs to is where the token lands.

## The real question to answer first

Before connecting, decide: **do you want this mailbox connected for testing in Preview, or for production use on the Live URL?**

- **If testing**: connect from Preview URL. Inbound emails will sync into your Preview DB and match against Preview-DB leads only.
- **If production**: publish first (click Publish → Update), then connect from `https://ct-sc-deals.lovable.app`. The connection will live in the Live DB and sync against your real leads.

You'll likely want to do **both eventually** — connect once in Preview to verify it works end-to-end, then connect again in Live for actual use. Each environment is a separate connection in a separate database.

## What you need to do right now

### Step 1 — Confirm Google Console is set up (do this first regardless)

Go to Google Cloud Console for the OAuth client behind `GOOGLE_OAUTH_CLIENT_ID`:

1. **APIs & Services → Credentials → [our OAuth client] → Authorized redirect URIs**
   Must contain (exactly, no trailing slash):
   ```
   https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback
   ```

2. **APIs & Services → OAuth consent screen → Test users**
   Add the Google account email you'll click "Allow" with (e.g. `adam@captarget.com`).

3. **OAuth consent screen → Authorized domains**
   Add `lovable.app` (covers both preview and live subdomains) and `supabase.co`.

### Step 2 — Pick where to connect

**For first-time testing (recommended):**
- Stay on Preview URL
- Go to Settings → Mailbox Settings → "Connect Gmail"
- Sign in with the Google account you added as a test user
- Verify connection succeeds, run "Sync Now", check that inbound emails appear on a known lead

**For production rollout (after testing works):**
- Click Publish → Update (top right)
- Open `https://ct-sc-deals.lovable.app`
- Repeat the connect flow there
- This creates a separate connection in the Live DB

### Step 3 — Both environments will need separate connections

Adam connecting Gmail in Preview does NOT connect him in Live, and vice versa. This is unavoidable because the two DBs don't share rows. For each real user (Adam, Malik, Valeria), you'll connect once per environment they need to operate in. Most likely just Live for daily use; Preview only for your own QA.

## What this plan does NOT change

- No code changes
- No DB migrations
- No Google Console scope changes (already set in earlier session)

The integration is built and deployed. Publishing is optional and only affects which database the connection lives in.

