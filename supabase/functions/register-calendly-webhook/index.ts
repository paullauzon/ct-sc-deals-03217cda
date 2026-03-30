import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const CALENDLY_API = "https://api.calendly.com";
const WEBHOOK_TARGET_URL = "https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-calendly-booking";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const url = new URL(req.url);
    const apiKey = req.headers.get("x-api-key") || url.searchParams.get("key");
    const expectedKey = Deno.env.get("INGEST_API_KEY");
    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendlyToken = Deno.env.get("CALENDLY_API_TOKEN");
    if (!calendlyToken) {
      throw new Error("CALENDLY_API_TOKEN not set");
    }

    const headers = {
      Authorization: `Bearer ${calendlyToken}`,
      "Content-Type": "application/json",
    };

    // 1. Get current user to find organization URI
    const meRes = await fetch(`${CALENDLY_API}/users/me`, { headers });
    if (!meRes.ok) throw new Error(`/users/me failed: ${meRes.status} ${await meRes.text()}`);
    const meData = await meRes.json();
    const orgUri = meData.resource?.current_organization;
    if (!orgUri) throw new Error("Could not find organization URI");

    console.log(`[register-calendly-webhook] Org: ${orgUri}`);

    // 2. Check existing webhooks to avoid duplicates
    const listRes = await fetch(
      `${CALENDLY_API}/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`,
      { headers }
    );
    if (!listRes.ok) throw new Error(`List webhooks failed: ${listRes.status} ${await listRes.text()}`);
    const listData = await listRes.json();

    const existing = (listData.collection || []).find(
      (wh: any) => wh.callback_url === WEBHOOK_TARGET_URL && wh.state === "active"
    );

    if (existing) {
      console.log(`[register-calendly-webhook] Already registered: ${existing.uri}`);
      return new Response(JSON.stringify({
        status: "already_registered",
        webhook: {
          uri: existing.uri,
          callback_url: existing.callback_url,
          events: existing.events,
          state: existing.state,
          created_at: existing.created_at,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Register new webhook
    const createRes = await fetch(`${CALENDLY_API}/webhook_subscriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: WEBHOOK_TARGET_URL,
        events: ["invitee.created"],
        organization: orgUri,
        scope: "organization",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Create webhook failed: ${createRes.status} ${errText}`);
    }

    const createData = await createRes.json();
    console.log(`[register-calendly-webhook] Registered:`, JSON.stringify(createData.resource));

    return new Response(JSON.stringify({
      status: "registered",
      webhook: {
        uri: createData.resource?.uri,
        callback_url: createData.resource?.callback_url,
        events: createData.resource?.events,
        state: createData.resource?.state,
        created_at: createData.resource?.created_at,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[register-calendly-webhook] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
