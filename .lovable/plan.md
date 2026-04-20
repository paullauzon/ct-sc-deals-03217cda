

# Activities tab — verification: what's done vs. still open

I audited every gap from the original plan and all three follow-up plans against the current code (`UnifiedTimeline.tsx`, `LeadActivityTab.tsx`, `LogCallDialog.tsx`, `extract-call-intel`, both sync functions, and the `lead_activity_log.metadata` migration).

## ✅ Everything from the approved plans is shipped

| Plan item | Status | Evidence |
|---|---|---|
| Tasks in timeline + Tasks filter pill | ✅ | `UnifiedTimeline` lines 220-230 (query), 293-309 (project), 124 (filter) |
| Calls as first-class events (`call_logged`) | ✅ | `LogCallDialog` writes `call_logged`; `iconFor` line 159 uses `Phone`; filter line 121 |
| Dismissable monochrome intro banner | ✅ | `LeadActivityTab` lines 22-55 (`ActivityTabIntro`, `localStorage` key) |
| Default-expand recent 10 | ✅ | `defaultOpenIds` lines 422-425, passed via `defaultExpanded` prop |
| SLA / playbook + stall reason on task rows | ✅ | Lines 641-647 (`taskSourceLabel`), 781-785 (stall reason inline) |
| Filter pill reorder to mockup | ✅ | All · Emails · Calls · Notes · Meetings · Tasks · Stage · Logged · Pinned (lines 118-128) |
| Meeting AI rationalization (pills + extracted block) | ✅ | Lines 745-764 (pill row), 832-839 (`IntelExtractBlock`), `Sparkles` AI chip 690-694 |
| Call AI rationalization (`extract-call-intel` + metadata render) | ✅ | Edge function exists; `LogCallDialog` invokes it; lines 841-852 render `IntelExtractBlock` for calls |
| Open transcript link → `TranscriptDrawer` | ✅ | Lines 866-875 + drawer at line 561 |
| `lead_activity_log.metadata jsonb` migration | ✅ | Migration `20260420190950_…sql` shipped, types regenerated |
| Sequence-paused-on-reply (Gmail) | ✅ | `sync-gmail-emails` lines 540-558 insert `sequence_paused` |
| Sequence-paused-on-reply (Outlook) + Outlook `replied_at` parity | ✅ | `sync-outlook-emails` lines 240-272 |
| Sequence-paused row sort bias (-1ms under inbound) | ✅ | Lines 272-276 |
| Sequence-paused render with amber pill + filter inclusion under Emails | ✅ | Lines 161, 405, 721-728 |

**Conclusion: every gap that was identified and approved is in the codebase.** Nothing from the scoped plans is missing.

## What the mockup still implies but was never scoped

These are minor polish items visible in the wireframe that were intentionally not in any of the four approved plans. Listing them so you can decide whether to scope a new round:

### 1. "auto-task day +5 from sample" inline meta on email rows
The mockup's `S5-B` outbound shows `Apr 8 (auto-task day +5 from sample)` as inline meta — i.e. when an email was sent because a playbook task fired, link the email row back to the originating playbook step. We don't currently surface that origin trail on outbound emails. Requires joining `lead_emails` against `lead_tasks` by playbook + send window, or stamping the originating task id at send time.

### 2. "auto-logged from connected inbox" provenance on inbound emails
The mockup's `Re: Following up on the sample targets` row shows `· auto-logged from connected inbox` in its meta line. Today every email simply shows `From {sender}`; we don't disambiguate Zapier-ingested vs. Gmail-deep-sync vs. Outlook-deep-sync. Trivial: append a provenance suffix derived from `lead_emails.source` (`zapier` / `gmail` / `outlook`).

### 3. Two distinct sequence-paused affordances on the same row
The mockup shows the inbound reply with **two** badges on its header (`Email received · reply` and `S5 paused on reply`) AND a third badge below (`Sequence S5 auto-paused on reply`). We currently render one separate row per sequence pause directly under the inbound. The mockup arguably wants the pause **inline on the inbound row itself**, not as a sibling row. Could be rendered as both — sibling row stays, but the inbound row also gets a `Sx paused` chip.

### 4. Backfill for historical replies
Any inbound reply that landed before this build will never get a `sequence_paused` row. A one-time backfill function would scan `lead_emails` where `direction='inbound'` and the matched outbound had a `sequence_step`, then insert the missing log rows. Same pattern for historical call summaries that pre-date `extract-call-intel`.

## Recommendation

The Activities tab matches the approved plan **verbatim**. If you want to close the remaining mockup-implied items, items #1 and #2 are genuinely user-facing polish (provenance trails) that would take an hour of work; #3 is taste; #4 is a one-time data hygiene job. Tell me which of these (if any) to scope into a new build, otherwise this thread is done.

