
The user is showing me a Microsoft "Approval required" screen even though they got "approved" last night. This is a known Microsoft Entra/Azure AD pattern.

Key insight from the screenshot:
- They're signing in as `adam.haile@sourcecodeals.com`
- The screen shows "**This app requires your admin's approval to:**" with scopes Read user mail, Read/write user mail, Send mail as user, Maintain access, View profile
- Last night's approval was for a DIFFERENT scope set (likely a narrower one for the initial connection)
- This is a NEW consent request because the connector is requesting expanded scopes (the read-write + send mail combo, which is broader than read-only sync)

Common causes:
1. **Approval was for a different scope set** — admin previously approved Mail.Read but now Lovable needs Mail.ReadWrite + Mail.Send. Each scope expansion triggers a new admin approval workflow in Entra.
2. **Approval was granted to a different Lovable app registration** — Microsoft may have multiple Lovable enterprise app entries; admin approved one but the connector OAuth is initiating against another.
3. **Tenant policy: "user consent disabled"** — even after admin grants once, if user consent is fully disabled, every new user/scope combo requires fresh admin approval.
4. **Admin consent wasn't granted tenant-wide** — admin clicked "approve" but only for themselves (user consent), not "Grant admin consent for [Tenant]" (the org-wide button). This is the most common cause and matches the symptom exactly.
5. **Different account** — last night's approval may have been for `adam.haile@captarget.com` and now signing in as `adam.haile@sourcecodeals.com` (different tenant entirely).

Note in the screenshot: it specifically says "This app requires your **admin's** approval" — meaning Adam himself is NOT the admin in this tenant, OR the prior approval was performed differently. Adam needs to either:
- Have the actual Entra admin click "Grant admin consent for [tenant]" in Azure portal → Enterprise Applications → Lovable → Permissions
- OR have admin approve the new request (but it'll keep happening on scope changes)

The cleanest fix: have the Microsoft 365 tenant admin go to Entra admin center, find the Lovable enterprise app, and click "Grant admin consent for [tenant name]" once with the full required scope set. That bakes consent in tenant-wide and bypasses this prompt forever.

I should explain this clearly and give them the exact path to fix it. This is a clarifying / diagnostic response — no code to write.

Let me also note: the dialog shows two distinct tenants in play here (sourcecodeals.com signing in). If the admin who approved last night was on captarget.com tenant, that approval doesn't transfer to sourcecodeals.com tenant. Each Microsoft 365 tenant is a completely separate consent boundary.

Plan: explain the diagnosis, list the 3 most likely causes ranked by probability, give exact remediation path. No code changes. Then present 2 paths forward: (a) admin grants tenant-wide consent the right way, (b) we proceed with whatever's connectable now.

Keep it concise.
