// DEPRECATED — Zapier interim bridge abandoned.
// We are waiting on:
//   - sourcecodeals.com Microsoft tenant admin consent → sync-outlook-emails takes over
//   - captarget.com Google Workspace admin OAuth setup → Gmail OAuth flow takes over
// This endpoint is intentionally disabled. Re-enable only if the Zapier path is revived.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      status: "disabled",
      message:
        "ingest-email is disabled. Email sync now runs through native Outlook/Gmail integrations once admin approvals land.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
