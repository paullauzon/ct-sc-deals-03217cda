// Generates the Microsoft OAuth consent URL for a user to connect their Outlook mailbox.
// Returns { url } that the frontend redirects the browser to.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
].join(" ");

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
    const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
    if (!CLIENT_ID) throw new Error("MICROSOFT_CLIENT_ID missing");
    const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID") || "common";

    const url = new URL(req.url);
    const rawLabel = url.searchParams.get("user_label") || "Default";
    const rawReturnTo = url.searchParams.get("return_to") || "";

    const userLabel = rawLabel.trim().slice(0, 120) || "Default";
    const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : "";

    const stateObj = { user_label: userLabel, return_to: returnTo, ts: Date.now() };
    const state = base64UrlEncode(JSON.stringify(stateObj));

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outlook-oauth-callback`;

    const authUrl = new URL(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("state", state);
    // NOTE: We intentionally do NOT set prompt=consent.
    // Forcing consent on every connect inflames tenant consent-policy failures
    // ("Approval required" wall) and bounces already-approved users through
    // an unnecessary second consent screen. Microsoft will surface its own
    // consent UI on the first connect; subsequent connects skip it cleanly.
    // If a tenant blocks user-self consent, the user is routed to the
    // outlook-admin-consent-start flow instead.

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("outlook-oauth-start error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
