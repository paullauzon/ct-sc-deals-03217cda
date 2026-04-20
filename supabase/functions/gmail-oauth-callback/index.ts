// Handles Google's OAuth redirect, exchanges code for tokens, fetches the
// user's email, and stores everything in user_email_connections.
// Then redirects the browser back to the frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function htmlResponse(message: string, redirect?: string) {
  const safeRedirect = redirect ? `<meta http-equiv="refresh" content="2;url=${redirect}" />` : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" />${safeRedirect}<title>Mailbox connected</title>
    <style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .card{max-width:420px;padding:32px;border:1px solid #262626;border-radius:8px;text-align:center}
    h1{font-size:18px;font-weight:600;margin:0 0 8px}p{color:#a3a3a3;font-size:14px;margin:0}</style></head>
    <body><div class="card"><h1>${message}</h1><p>You can close this tab.</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Google OAuth credentials missing");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error");

    if (error) {
      if (error === "access_denied") {
        return htmlResponse(
          "Access denied — your Google account isn't on the test users list. Ask the admin to add your email in Google Cloud Console → OAuth consent screen → Test users.",
        );
      }
      return htmlResponse(`Authorization denied: ${error}`);
    }
    if (!code) return htmlResponse("Missing authorization code");

    let userLabel = "Default";
    let returnTo = "";
    try {
      const decoded = atob(stateRaw.replace(/-/g, "+").replace(/_/g, "/"));
      const parsed = JSON.parse(decoded);
      userLabel = parsed.user_label || "Default";
      returnTo = parsed.return_to || "";
    } catch { /* ignore */ }

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
      return htmlResponse("Token exchange failed");
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
      return htmlResponse("Could not fetch profile");
    }
    const profile = await profileRes.json() as { email: string; name?: string };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

    // Upsert by email_address (one row per mailbox)
    const { data: existing } = await supabase
      .from("user_email_connections")
      .select("id, refresh_token")
      .eq("email_address", profile.email.toLowerCase())
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from("user_email_connections")
        .update({
          provider: "gmail",
          user_label: userLabel,
          access_token: tokens.access_token,
          // Google only returns refresh_token on first consent; preserve old one if missing
          refresh_token: tokens.refresh_token || existing.refresh_token,
          token_expires_at: expiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("user_email_connections").insert({
        provider: "gmail",
        email_address: profile.email.toLowerCase(),
        user_label: userLabel,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        is_active: true,
      });
      if (insErr) throw insErr;
    }

    const redirect = returnTo || `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "/"}/#sys=crm&view=settings&connected=1`;
    return htmlResponse(`Connected ${profile.email}`, redirect);
  } catch (e) {
    console.error("gmail-oauth-callback error:", e);
    return htmlResponse(`Error: ${(e as Error).message}`);
  }
});
