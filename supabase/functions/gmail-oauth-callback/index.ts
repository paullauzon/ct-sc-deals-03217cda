// Handles Google's OAuth redirect, exchanges code for tokens, fetches the
// user's email, and stores everything in user_email_connections.
// Then redirects the browser back to the frontend (or renders a success card).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function htmlResponse(title: string, detail = "You can close this tab.", redirect?: string) {
  const safeRedirect = redirect ? `<meta http-equiv="refresh" content="2;url=${redirect}" />` : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" />${safeRedirect}<title>${title}</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .card{max-width:480px;padding:32px;border:1px solid #262626;border-radius:8px;text-align:center}
    h1{font-size:18px;font-weight:600;margin:0 0 8px}p{color:#a3a3a3;font-size:14px;margin:0;line-height:1.5}</style></head>
    <body><div class="card"><h1>${title}</h1><p>${detail}</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// UTF-8-safe base64url decoder. The matching encoder in gmail-oauth-start uses
// TextEncoder; without padding restoration atob() can fail intermittently.
function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  // Restore padding so atob never throws on length-misaligned strings.
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return htmlResponse("Configuration error", "Google OAuth credentials are missing on the server.");
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error");

    if (error) {
      if (error === "access_denied") {
        return htmlResponse(
          "Access denied",
          "Your Google account isn't on the test users list. Ask the admin to add your email in Google Cloud Console → OAuth consent screen → Test users.",
        );
      }
      return htmlResponse("Authorization denied", `Google returned: ${error}`);
    }
    if (!code) return htmlResponse("Missing authorization code", "Google did not return an authorization code.");

    // Decode state safely. If it fails, we still continue with defaults but log it.
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

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return htmlResponse(
        "Token exchange failed",
        "Google rejected the authorization code. Try connecting again. If it keeps failing, double-check the OAuth client ID, secret, and redirect URI.",
      );
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
    };

    // Fetch user profile to get the email address
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error("Profile fetch failed:", errText);
      return htmlResponse(
        "Could not fetch profile",
        "Google accepted the login but we couldn't read your email address. Please try connecting again.",
      );
    }
    const profile = await profileRes.json() as { email?: string; name?: string };
    if (!profile.email) {
      return htmlResponse(
        "Missing email address",
        "Google didn't return an email address for this account. Try connecting again with a Google account that has a Gmail address.",
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
    const emailLower = profile.email.toLowerCase();

    // Look up an existing row for this mailbox so we can preserve the refresh_token
    // on reconnects (Google only returns refresh_token on first consent unless
    // prompt=consent forces it — we set prompt=consent, but defense in depth).
    const { data: existing } = await supabase
      .from("user_email_connections")
      .select("id, refresh_token")
      .eq("email_address", emailLower)
      .maybeSingle();

    const effectiveRefreshToken = tokens.refresh_token || existing?.refresh_token || null;

    // Hard guard: never persist a "connected" mailbox without a usable refresh
    // token. Without it, every future sync/send will fail and the UI lies.
    if (!effectiveRefreshToken) {
      return htmlResponse(
        "Reconnect required",
        "Google didn't return a refresh token. Go to your Google Account → Security → Third-party access, remove this app, then click Connect Gmail again.",
      );
    }

    if (existing) {
      const { error: updErr } = await supabase
        .from("user_email_connections")
        .update({
          provider: "gmail",
          user_label: userLabel,
          access_token: tokens.access_token,
          refresh_token: effectiveRefreshToken,
          token_expires_at: expiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("user_email_connections").insert({
        provider: "gmail",
        email_address: emailLower,
        user_label: userLabel,
        access_token: tokens.access_token,
        refresh_token: effectiveRefreshToken,
        token_expires_at: expiresAt,
        is_active: true,
      });
      if (insErr) throw insErr;
    }

    // If returnTo is missing or unsafe, just render the success card with no auto-redirect.
    return htmlResponse(`Connected ${profile.email}`, "You can close this tab.", returnTo || undefined);
  } catch (e) {
    console.error("gmail-oauth-callback error:", e);
    return htmlResponse("Connection error", `Something went wrong: ${(e as Error).message}`);
  }
});
