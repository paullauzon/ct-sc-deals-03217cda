// Sync emails from Microsoft Outlook (workspace mailbox) into lead_emails.
// Uses the Lovable connector gateway for Microsoft Graph.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";
const INTERNAL_DOMAINS = ["captarget.com", "sourcecodeals.com"];

function isInternal(email: string): boolean {
  const d = (email || "").toLowerCase().split("@")[1];
  return INTERNAL_DOMAINS.includes(d);
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const MS_API_KEY = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!MS_API_KEY) throw new Error("MICROSOFT_OUTLOOK_API_KEY missing — connect Outlook in Connectors");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sinceDays = Number(body.since_days ?? 7);
    const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();

    let totalProcessed = 0;
    let inserted = 0;
    let matched = 0;

    // Pull from Inbox (received) and SentItems
    for (const folder of ["inbox", "sentitems"]) {
      let url: string | null =
        `${GATEWAY_URL}/me/mailFolders/${folder}/messages` +
        `?$top=50&$orderby=receivedDateTime desc` +
        `&$filter=receivedDateTime ge ${sinceIso}` +
        `&$select=id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments`;

      // Cap pagination to 5 pages per folder per run
      for (let page = 0; page < 5 && url; page++) {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": MS_API_KEY,
          },
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Graph ${folder} ${res.status}: ${txt.slice(0, 200)}`);
        }
        const data = await res.json();
        const messages: GraphMessage[] = data.value || [];
        url = data["@odata.nextLink"] || null;

        for (const m of messages) {
          totalProcessed++;
          const fromAddr = m.from?.emailAddress?.address?.toLowerCase() || "";
          const fromName = m.from?.emailAddress?.name || "";
          const toList = (m.toRecipients || [])
            .map((r) => r.emailAddress?.address?.toLowerCase() || "")
            .filter(Boolean);
          const ccList = (m.ccRecipients || [])
            .map((r) => r.emailAddress?.address?.toLowerCase() || "")
            .filter(Boolean);
          const bccList = (m.bccRecipients || [])
            .map((r) => r.emailAddress?.address?.toLowerCase() || "")
            .filter(Boolean);

          const direction = isInternal(fromAddr) ? "outbound" : "inbound";

          // Match lead by external participants
          const externalEmails = [fromAddr, ...toList, ...ccList].filter(
            (e) => e && !isInternal(e)
          );

          let leadId = "unmatched";
          if (externalEmails.length > 0) {
            const { data: leads } = await supabase
              .from("leads")
              .select("id, email")
              .in("email", externalEmails)
              .limit(1);
            if (leads && leads.length > 0) {
              leadId = leads[0].id;
              matched++;
            }
          }

          const messageId = m.internetMessageId || m.id;

          // Dedup: skip if already stored by provider_message_id or message_id
          const { data: existing } = await supabase
            .from("lead_emails")
            .select("id")
            .or(`provider_message_id.eq.${m.id},message_id.eq.${messageId}`)
            .limit(1);

          if (existing && existing.length > 0) continue;

          const emailDate = m.receivedDateTime || m.sentDateTime || new Date().toISOString();
          const html = m.body?.contentType === "html" ? m.body.content : "";
          const text = m.body?.contentType === "text" ? m.body.content : "";

          const { error: insertErr } = await supabase.from("lead_emails").insert({
            lead_id: leadId,
            message_id: messageId,
            provider_message_id: m.id,
            thread_id: m.conversationId || "",
            direction,
            from_address: fromAddr,
            from_name: fromName,
            to_addresses: toList,
            cc_addresses: ccList,
            bcc_addresses: bccList,
            subject: (m.subject || "").substring(0, 500),
            body_preview: (m.bodyPreview || "").substring(0, 5000),
            body_html: html,
            body_text: text,
            email_date: emailDate,
            source: "outlook",
            is_read: !!m.isRead,
            attachments: m.hasAttachments ? [{ has: true }] : [],
            raw_payload: m as unknown as Record<string, unknown>,
          });

          if (!insertErr) inserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: totalProcessed, inserted, matched, since: sinceIso }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-outlook-emails error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
