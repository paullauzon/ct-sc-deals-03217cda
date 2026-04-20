// Refreshes a Microsoft Outlook access token using the stored refresh_token.
// Mirrors refresh-gmail-token pattern exactly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function getValidOutlookToken(connectionId: string): Promise<string> {
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
  const stillValid = expiresAt > Date.now() + 60_000;
  if (stillValid && conn.access_token) return conn.access_token;

  const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Microsoft OAuth credentials missing");

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outlook token refresh failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  const tokens = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  // Microsoft may rotate the refresh token — persist the new one if returned.
  const updatePayload: Record<string, unknown> = {
    access_token: tokens.access_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) {
    updatePayload.refresh_token = tokens.refresh_token;
  }

  await supabase
    .from("user_email_connections")
    .update(updatePayload)
    .eq("id", connectionId);

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const connectionId = body.connection_id as string | undefined;

    if (connectionId) {
      const token = await getValidOutlookToken(connectionId);
      return new Response(JSON.stringify({ ok: true, refreshed: true, token_preview: token.slice(0, 12) + "..." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh all active Outlook connections (used by cron)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: conns } = await supabase
      .from("user_email_connections")
      .select("id")
      .eq("provider", "outlook")
      .eq("is_active", true);

    const results = await Promise.allSettled(
      (conns || []).map((c) => getValidOutlookToken(c.id))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;

    return new Response(JSON.stringify({ ok: true, refreshed: ok, failed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-outlook-token error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
