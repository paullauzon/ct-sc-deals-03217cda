// Handles Microsoft OAuth redirect, exchanges code for tokens, fetches the
// user's email via Graph /me, and stores everything in user_email_connections.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function htmlResponse(title: string, detail = "You can close this tab.", redirect?: string) {
  const safeRedirect = redirect ? `<meta http-equiv="refresh" content="2;url=${redirect}" />` : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" />${safeRedirect}<title>${title}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .card{max-width:480px;padding:32px;border:1px solid #262626;border-radius:8px;text-align:center}
    h1{font-size:18px;font-weight:600;margin:0 0 8px}p{color:#a3a3a3;font-size:14px;margin:0;line-height:1.5}</style></head>
    <body><div class="card"><h1>${title}</h1><p>${detail}</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function approvalRequiredHtml(opts: {
  microsoftError: string;
  microsoftErrorDescription: string;
  tenantId: string;
  scopes: string[];
  adminConsentUrl: string;
  returnTo: string;
}) {
  const scopesList = opts.scopes.map((s) => `<li><code>${s}</code></li>`).join("");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" /><title>Outlook approval required</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0a0a0a;color:#fafafa;margin:0;padding:32px;display:flex;align-items:flex-start;justify-content:center;min-height:100vh}
      .card{max-width:640px;width:100%;padding:32px;border:1px solid #262626;border-radius:12px}
      h1{font-size:20px;font-weight:600;margin:0 0 12px}
      h2{font-size:13px;font-weight:600;margin:24px 0 8px;color:#fafafa;text-transform:uppercase;letter-spacing:0.04em}
      p{color:#a3a3a3;font-size:14px;line-height:1.6;margin:0 0 12px}
      ul{color:#a3a3a3;font-size:13px;line-height:1.8;padding-left:20px;margin:0}
      code{background:#171717;padding:2px 6px;border-radius:4px;font-size:12px;color:#fafafa}
      pre{background:#171717;padding:12px;border-radius:6px;font-size:12px;color:#a3a3a3;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:8px 0 0}
      .actions{display:flex;gap:8px;margin-top:24px;flex-wrap:wrap}
      a.btn{display:inline-flex;align-items:center;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:500;text-decoration:none;transition:background 0.15s}
      a.primary{background:#fafafa;color:#0a0a0a}a.primary:hover{background:#e5e5e5}
      a.secondary{background:transparent;color:#fafafa;border:1px solid #404040}a.secondary:hover{background:#171717}
      .meta{font-size:11px;color:#525252;margin-top:16px}
    </style></head>
    <body><div class="card">
      <h1>Your organization requires admin approval</h1>
      <p>Microsoft blocked this connection because the SourceCo tenant doesn't allow individual users to consent to Outlook mailbox access. <strong>This is a tenant policy, not a CRM bug.</strong> A tenant admin needs to approve the app once — then every user can connect normally.</p>

      <h2>What the admin does</h2>
      <p>Open the admin-consent link below in a browser, sign in as a Microsoft tenant admin (e.g. Josh), review the requested permissions, and click <strong>Accept</strong>.</p>

      <h2>Permissions being requested</h2>
      <ul>${scopesList}</ul>

      <h2>Microsoft's reason</h2>
      <pre>${opts.microsoftError}: ${opts.microsoftErrorDescription || "(no description)"}</pre>

      <div class="actions">
        <a class="btn primary" href="${opts.adminConsentUrl}" target="_blank" rel="noopener">Open admin-consent URL</a>
        ${opts.returnTo ? `<a class="btn secondary" href="${opts.returnTo}">Back to CRM</a>` : ""}
      </div>

      <div class="meta">Tenant: ${opts.tenantId}</div>
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function isSafeReturnTo(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

  try {
    const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
    const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID") || "common";
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return htmlResponse("Configuration error", "Microsoft OAuth credentials are missing on the server.");
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error");
    const errorDesc = url.searchParams.get("error_description") || "";

    if (error) {
      return htmlResponse("Authorization denied", `Microsoft returned: ${error} — ${errorDesc}`);
    }
    if (!code) return htmlResponse("Missing authorization code", "Microsoft did not return an authorization code.");

    let userLabel = "Default";
    let returnTo = "";
    if (stateRaw) {
      try {
        const decoded = base64UrlDecode(stateRaw);
        const parsed = JSON.parse(decoded);
        if (typeof parsed.user_label === "string") userLabel = parsed.user_label.slice(0, 120);
        if (typeof parsed.return_to === "string" && isSafeReturnTo(parsed.return_to)) {
          returnTo = parsed.return_to;
        }
      } catch (decodeErr) {
        console.warn("State decode failed; continuing with defaults:", decodeErr);
      }
    }

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outlook-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return htmlResponse("Token exchange failed", "Microsoft rejected the authorization code. Try connecting again.");
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Fetch user profile to get email address
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error("Profile fetch failed:", errText);
      return htmlResponse("Could not fetch profile", "Microsoft accepted the login but we couldn't read your email address.");
    }
    const profile = await profileRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string };
    const emailAddr = (profile.mail || profile.userPrincipalName || "").toLowerCase();
    if (!emailAddr || !emailAddr.includes("@")) {
      return htmlResponse("Missing email address", "Microsoft didn't return an email address for this account.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

    const { data: existing } = await supabase
      .from("user_email_connections")
      .select("id, refresh_token")
      .eq("email_address", emailAddr)
      .maybeSingle();

    const effectiveRefreshToken = tokens.refresh_token || existing?.refresh_token || null;

    if (!effectiveRefreshToken) {
      return htmlResponse(
        "Reconnect required",
        "Microsoft didn't return a refresh token. Try connecting again. If it persists, remove this app from your Microsoft account's app permissions and retry.",
      );
    }

    let connectionId: string | null = null;
    if (existing) {
      const { error: updErr } = await supabase
        .from("user_email_connections")
        .update({
          provider: "outlook",
          user_label: userLabel,
          access_token: tokens.access_token,
          refresh_token: effectiveRefreshToken,
          token_expires_at: expiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      connectionId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase.from("user_email_connections").insert({
        provider: "outlook",
        email_address: emailAddr,
        user_label: userLabel,
        access_token: tokens.access_token,
        refresh_token: effectiveRefreshToken,
        token_expires_at: expiresAt,
        is_active: true,
      }).select("id").single();
      if (insErr) throw insErr;
      connectionId = (inserted as { id: string } | null)?.id ?? null;
    }

    // Auto-trigger a 90d backfill on connect — fire-and-forget.
    if (connectionId) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/start-email-backfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ connection_id: connectionId, target_window: "90d" }),
      }).catch((e) => console.error("auto-backfill dispatch failed:", e));
    }

    return htmlResponse(`Connected ${emailAddr}`, "You can close this tab.", returnTo || undefined);
  } catch (e) {
    console.error("outlook-oauth-callback error:", e);
    return htmlResponse("Connection error", `Something went wrong: ${(e as Error).message}`);
  }
});
