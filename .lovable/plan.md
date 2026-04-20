

# Activities tab — final end-to-end verification

I traced every item from all four approved plans against the live code. **Everything is shipped and wired correctly.** Below is the verification matrix and the only remaining optional follow-up.

## ✅ Full implementation matrix

| Plan / Gap | Code location | Status |
|---|---|---|
| Tasks query + project to timeline + Tasks filter | `UnifiedTimeline.tsx` L230-235 (query), L302-319 (project), L153 (filter), L424 (count) | ✅ |
| Calls as first-class events | `LogCallDialog` writes `call_logged` with `metadata.summary`; L267 maps to `call`, L151 filter, L169 `Phone` icon | ✅ |
| Dismissable monochrome intro banner | `LeadActivityTab.tsx` `ActivityTabIntro` + localStorage key | ✅ |
| Default-expand recent 10 | L438-441 `defaultOpenIds` Set, L581 prop | ✅ |
| SLA / playbook + stall reason on tasks | L676-682 `taskSourceLabel`, L816-820 stall reason inline | ✅ |
| Filter pill order matches mockup | L128-138 (All · Emails · Calls · Notes · Meetings · Tasks · Stage · Logged · Pinned) | ✅ |
| Meeting AI rationalization (pills + extract block + AI chip) | L725-729 AI chip, L780-799 pill row, L872-879 `IntelExtractBlock` | ✅ |
| Call AI rationalization (`extract-call-intel` + render) | Edge fn deployed; `LogCallDialog` invokes; L765-778 pill row, L881-892 extract block | ✅ |
| Open transcript link → `TranscriptDrawer` | L594-598 drawer mounted, opens via `setTranscriptMeeting` | ✅ |
| `lead_activity_log.metadata jsonb` column | Migration `20260420190950…` shipped, types regenerated | ✅ |
| Sequence-paused on Gmail reply | `sync-gmail-emails` L540-558 inserts `sequence_paused` | ✅ |
| Sequence-paused on Outlook reply + `replied_at` parity | `sync-outlook-emails` L240-272 | ✅ |
| Sequence-paused -1ms sort bias under inbound | L284-286 | ✅ |
| Sequence-paused render with amber pill | L757-763 | ✅ |
| Email provenance suffix (Gmail / Outlook / Zapier) | L98-104 helper, L343 wired into meta | ✅ |
| Auto-task suffix on outbound sequence emails | L345-346 | ✅ |
| Inline `Sx paused` chip on inbound email row | L445-456 map, L851-855 badge render | ✅ |
| Backfill edge function (`backfill-activity-intel`) | Deployed with `Deno.serve` + esm.sh client (timeout fixed) | ✅ |

## What's left

**Nothing from any approved plan is outstanding.** Every gap, every polish item, every backfill utility is in the codebase and deployed.

The single optional follow-up is **operational, not code**:

- **Run the backfill once.** `backfill-activity-intel` is deployed but has not been invoked yet. Until it's run, historical inbound replies (pre-build) will not have `sequence_paused` rows, and historical `call_logged` rows will not have `metadata.intel`. One POST with `{ "mode": "all", "limit": 1000 }` populates both passes idempotently.

## Recommendation

Two paths from here:

1. **Run the backfill** so historical data matches new data — single edge function call, returns counts of inserts/enrichments, fully idempotent.
2. **Close the thread.** The Activities tab matches the mockup verbatim end-to-end. Nothing else from the plans needs building.

Tell me which.

