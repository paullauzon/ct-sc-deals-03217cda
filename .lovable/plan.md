

# Activities tab — final outstanding work

After the last build, **Gaps A and B are fully shipped** (meeting AI rationalization pills + extracted blocks, call AI extraction via `extract-call-intel`, transcript drawer wiring). The only remaining item from the approved plan is **Gap C — sequence-pause-on-reply rows**, and during the audit I found an additional related miss in the Outlook sync that should be closed at the same time.

## What's still missing

### 1. `sequence_paused` activity row never gets written

`UnifiedTimeline.tsx` already knows how to render `sequence_paused` events (filter wiring, `PauseCircle` icon, amber pill, raw `sequenceStep` parsed from `new_value`) — but **no edge function ever inserts one**. The mockup row `[Email received · reply] [S5 paused on reply]` will never appear until the sync functions write it.

### 2. `sync-outlook-emails` is missing `replied_at` stamping entirely

While auditing, I confirmed `sync-gmail-emails` lines 522-540 stamps `replied_at` on the matched outbound when an inbound reply arrives, but `sync-outlook-emails` does **not** — it jumps straight from insert to the reply-draft trigger at line 239. This means Outlook-connected mailboxes never show the "Replied" pill on outbound emails in the Email tab, and they have no anchor for sequence-pause detection. This needs to be fixed before Gap C can work for Outlook users.

## Build plan

### File 1 — `supabase/functions/sync-gmail-emails/index.ts`

After the existing `replied_at` update (line 538), if the matched outbound carried a `sequence_step`, insert a `sequence_paused` activity log row keyed to that step:

```ts
if (replyTarget) {
  await supabase.from("lead_emails")
    .update({ replied_at: emailDate })
    .eq("id", replyTarget.id);

  // NEW — fetch the sequence_step on the matched outbound and log a pause event
  const { data: stepRow } = await supabase
    .from("lead_emails")
    .select("sequence_step")
    .eq("id", replyTarget.id)
    .maybeSingle();
  const step = (stepRow as { sequence_step?: string } | null)?.sequence_step;
  if (step) {
    await supabase.from("lead_activity_log").insert({
      lead_id: leadId,
      event_type: "sequence_paused",
      description: `Sequence ${step} auto-paused on reply`,
      new_value: step,
      metadata: { trigger: "inbound_reply", inbound_email_id: insertedRow.id },
    });
  }
}
```

### File 2 — `supabase/functions/sync-outlook-emails/index.ts`

Add the same `replied_at` stamping block that Gmail has (currently absent), then the same `sequence_paused` log insert. Place it just before the existing `if (direction === "inbound" && leadId && insertedRow)` block at line 239 so the reply detection runs alongside the draft trigger.

Outlook uses `conversationId` instead of `threadId` — the existing insert already maps Outlook's conversation ID into `lead_emails.thread_id`, so the same query pattern works.

### File 3 — `UnifiedTimeline.tsx` (minor polish)

The rendering and filter wiring already exist. One tiny improvement: when both an inbound email row and its `sequence_paused` row land at the same second, sort the pause row immediately **after** the email row (currently strict reverse-chrono may flip them depending on insert order). Add a 1-millisecond bias when projecting `sequence_paused` events so they land just below the triggering inbound, matching the mockup's stacking.

## What the user gets

- Inbound replies on Gmail-connected mailboxes will now show the `[S5 paused on reply]` row directly under the email, exactly as the mockup specifies
- Outlook-connected mailboxes finally get the "Replied" pill working on outbound emails (parity with Gmail)
- Outlook-connected mailboxes also get the same `sequence_paused` rows
- Activities tab now matches the mockup verbatim — every entry type (tasks, calls, emails, replies, sequence pauses, notes, meetings with AI intel, stage events, submissions) is present with the right pills and rationalization

## Out of scope

- Backfilling `sequence_paused` rows for historical replies that landed before this change
- A dedicated "Sequence" filter pill (the existing **Emails** pill already includes `sequence_paused` per current UnifiedTimeline filter logic)
- One-time backfill of call intel for historical `call_logged` rows without `metadata.intel`

