// Generates a Microsoft tenant admin-consent URL for the Outlook integration.
// Use this when end users hit "Approval required" because the tenant's user-consent
// policy blocks self-consent for Mail.Read / Mail.Send. A tenant admin opens this
// URL once and grants consent on behalf of all users; afterwards the normal
// outlook-oauth-start flow works for every user in the tenant.
//
// Returns: { url, tenant_id, scopes }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
    const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID");
    if (!CLIENT_ID) throw new Error("MICROSOFT_CLIENT_ID missing");
    if (!TENANT_ID) throw new Error("MICROSOFT_TENANT_ID missing — admin consent must be tenant-scoped");

    const url = new URL(req.url);
    const rawReturnTo = url.searchParams.get("return_to") || "";
    let returnTo = "";
    try {
      const u = new URL(rawReturnTo);
      if (u.protocol === "https:" || u.protocol === "http:") returnTo = rawReturnTo;
    } catch { /* ignore */ }

    // Microsoft's adminconsent endpoint: a single click by a tenant admin
    // grants the requested permissions to the app for every user in that tenant.
    // Docs: https://learn.microsoft.com/azure/active-directory/manage-apps/grant-admin-consent
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outlook-oauth-callback`;
    const adminUrl = new URL(`https://login.microsoftonline.com/${TENANT_ID}/v2.0/adminconsent`);
    adminUrl.searchParams.set("client_id", CLIENT_ID);
    adminUrl.searchParams.set("scope", SCOPES.join(" "));
    adminUrl.searchParams.set("redirect_uri", redirectUri);
    if (returnTo) adminUrl.searchParams.set("state", returnTo);

    return new Response(
      JSON.stringify({
        url: adminUrl.toString(),
        tenant_id: TENANT_ID,
        scopes: SCOPES,
        explanation:
          "Tenant admin must open this URL and approve. After approval, all users in the tenant can connect their mailbox via the normal Connect Outlook flow without the 'Approval required' wall.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("outlook-admin-consent-start error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
