// Helper edge function: refreshes a Gmail access token if it's expired
// or about to expire. Returns the (possibly new) access token.
// Used internally by sync-gmail-emails and send-gmail-email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function getValidAccessToken(connectionId: string): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: conn, error } = await supabase
    .from("user_email_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !conn) throw new Error(`Connection ${connectionId} not found`);
  if (!conn.refresh_token) throw new Error(`Connection ${connectionId} has no refresh_token — reconnect required`);

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 60_000; // 60s buffer
  if (stillValid && conn.access_token) return conn.access_token;

  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Google OAuth credentials missing");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  const tokens = await res.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  await supabase
    .from("user_email_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return tokens.access_token;
}

// Stand-alone HTTP endpoint for manual / scheduled refresh.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const connectionId = body.connection_id as string | undefined;

    if (connectionId) {
      const token = await getValidAccessToken(connectionId);
      return new Response(JSON.stringify({ ok: true, refreshed: true, token_preview: token.slice(0, 12) + "..." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh all active connections (used by cron)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: conns } = await supabase
      .from("user_email_connections")
      .select("id")
      .eq("provider", "gmail")
      .eq("is_active", true);

    const results = await Promise.allSettled(
      (conns || []).map((c) => getValidAccessToken(c.id))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;

    return new Response(JSON.stringify({ ok: true, refreshed: ok, failed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-gmail-token error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
