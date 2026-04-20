// Generates the Gmail OAuth consent URL for a user to connect their mailbox.
// Returns { url } that the frontend redirects the browser to.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!CLIENT_ID) throw new Error("GOOGLE_OAUTH_CLIENT_ID missing");

    const url = new URL(req.url);
    const userLabel = url.searchParams.get("user_label") || "Default";
    const returnTo = url.searchParams.get("return_to") || "";

    // State carries info we need at callback time. Base64url-encoded JSON.
    const stateObj = { user_label: userLabel, return_to: returnTo, ts: Date.now() };
    const state = btoa(JSON.stringify(stateObj))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("include_granted_scopes", "true");

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-oauth-start error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
