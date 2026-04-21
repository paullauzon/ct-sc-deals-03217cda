

# Microsoft tenant is blocking consent. 3 paths forward — pick one and I'll proceed.

## What's actually happening

The screen you saw is **Microsoft Entra's admin consent gate**, not an error in our code. Your tenant `sourcecodeals.com` has one or both of these settings:

1. **User consent disabled** (or restricted to verified publishers only) — meaning regular users cannot consent to third-party apps
2. **App is "unverified"** — Microsoft flags any app not on the Microsoft Verified Publisher list as unverified, which auto-triggers admin approval in many tenants

Combined with Mail.Read + Mail.Send being **higher-privilege scopes**, Microsoft requires a tenant admin to either grant consent once for the whole tenant, or approve your specific request.

The "Request approval" button is greyed-out because the textbox above it is empty — Microsoft requires a justification string before letting you submit. But even if you fill it in and submit, the request goes to your **tenant's Global Admin** for approval (which is likely Josh / The Bridge Group, your IT support).

## 3 paths forward

### Path A — Grant admin consent ONCE for the whole tenant (recommended, ~2 min)

This is the cleanest, permanent fix. A tenant admin clicks one button, consent is granted forever for the app, every user in `sourcecodeals.com` can connect their mailbox without seeing this screen again.

**Steps for Josh (or whoever has Global Admin in your tenant):**

1. Go to **[Microsoft Entra admin center](https://entra.microsoft.com)** → **App registrations** → **All applications** → find **Lovable CRM — Outlook Sync**
2. Open it → left sidebar → **API permissions**
3. Click the big blue button **Grant admin consent for SMC SourceCo, LLC**
4. Confirm

Done. Next time you click **Connect Outlook**, you'll see a clean consent screen (not the admin-required one), or it'll skip consent entirely and go straight to authorize.

### Path B — Submit the approval request and wait

1. Type any text in the justification box (e.g. *"CRM email sync for sales team"*)
2. Click **Request approval** — it sends a notification to your Global Admin (Josh's team)
3. Once they approve in Entra, you can retry **Connect Outlook**

This works but is slower and requires a back-and-forth with The Bridge Group.

### Path C — Loosen tenant consent policy (if you want users self-serve forever)

If Josh wants to allow users to consent to verified low-risk apps without admin approval going forward:
- **Entra admin center** → **Identity** → **Applications** → **Enterprise applications** → **Consent and permissions** → **User consent settings** → set to **"Allow user consent for apps from verified publishers, for selected permissions"**

Not strictly needed for you — Path A is the fastest fix.

## My recommendation

**Path A.** Forward the steps above to Josh — it's a 30-second click for him and it permanently solves it for your whole tenant. After he confirms, ping me and click **Connect Outlook** again. The OAuth flow should complete cleanly, the connection will land in the database, and I'll immediately:

1. Register the `sync-outlook-emails-10min` pg_cron job
2. Trigger the 90-day backfill
3. Run the routing accuracy audit
4. Mark Outlook integration LIVE

## What NOT to do

- ❌ Don't change anything in our code or Azure registration — both are correct
- ❌ Don't add more scopes or change account types in Azure — Mail.Read + Mail.Send genuinely need admin consent in most enterprise tenants regardless
- ❌ Don't try a different Microsoft account (e.g., personal `outlook.com`) — your sales mailboxes are on `sourcecodeals.com`, that's the tenant we need

## One operational note

Once Path A is done, the consent grant is **per-app, not per-user**, so Malik and any other rep on `sourcecodeals.com` will be able to connect their Outlook with no friction.

