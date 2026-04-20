// Generates the Gmail OAuth consent URL for a user to connect their mailbox.
// Returns { url } that the frontend redirects the browser to.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Trimmed scopes — only what we actually use.
// Removed gmail.modify (unused) and userinfo.profile (unused) to reduce consent friction.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// UTF-8-safe base64url encoder. btoa() throws on non-Latin1 chars (e.g. em dash),
// which would break the OAuth start when the user_label contains unicode.
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
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!CLIENT_ID) throw new Error("GOOGLE_OAUTH_CLIENT_ID missing");

    const url = new URL(req.url);
    const rawLabel = url.searchParams.get("user_label") || "Default";
    const rawReturnTo = url.searchParams.get("return_to") || "";

    // Sanitize label: trim, cap length, allow unicode (handled by UTF-8 encoder below).
    const userLabel = rawLabel.trim().slice(0, 120) || "Default";

    // Validate return_to — drop it if not a real http(s) URL so we never try to
    // redirect the user to garbage on the way back.
    const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : "";

    // State carries info we need at callback time. Base64url-encoded JSON, UTF-8 safe.
    const stateObj = { user_label: userLabel, return_to: returnTo, ts: Date.now() };
    const state = base64UrlEncode(JSON.stringify(stateObj));

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
