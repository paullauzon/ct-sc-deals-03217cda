// Admin-only edge function: invite a teammate by email with a pre-assigned role.
// Called from /settings/team. Sends a Supabase magic-link invite and stashes the
// intended role in `pending_invites`; the `handle_new_user()` trigger consumes it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Verify caller is authenticated
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);

  // 2. Verify caller is admin
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdminData, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdminData) return json({ error: "Admin only" }, 403);

  // 3. Parse body
  let body: { email?: string; name?: string; role?: "admin" | "rep" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  const role = body.role === "admin" ? "admin" : "rep";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Valid email required" }, 400);
  }

  // 4. Stash pending invite (so the signup trigger picks up the role)
  const { error: inviteRowErr } = await admin
    .from("pending_invites")
    .upsert(
      { email, name, role, invited_by: userData.user.id, invited_at: new Date().toISOString() },
      { onConflict: "email" }
    );
  if (inviteRowErr) return json({ error: `DB: ${inviteRowErr.message}` }, 500);

  // 5. Send the Supabase magic-link invite email
  const origin = req.headers.get("origin") || "";
  const redirectTo = origin ? `${origin}/` : undefined;
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, invited_role: role },
    redirectTo,
  });
  if (inviteErr) {
    // Common cases: user already exists. Leave the pending_invites row so if they sign up later the role still applies.
    const msg = inviteErr.message || "Invite failed";
    return json({ error: msg, ok: false }, 400);
  }

  return json({ ok: true, userId: inviteData.user?.id ?? null, email });
});
