

# Command Center — Final Status & The One Remaining Gap

## Verified Working (All 4 Tabs)

**Schedule**: Morning briefing strip, 3 meeting cards (2 today, 1 in 6d), "Due today" blue / "1d overdue" red styling, horizon toggle synced, Urgent tier with 2 items. No issues.

**Follow-Ups**: 98 items across 5 sections (77 Overdue, 5 Due This Week, 10 Untouched, 6 Going Dark), rich rows with deal value + last contact + meeting count + email count + Calendly, AI action chips (Send Proposal, Follow Up, etc.), batch snooze >14d, sort controls, summary strip, AI Action Sheet with Copy & Mark Done + Regenerate + stage advance + calendar picker. No issues.

**Deal Pulse**: 4 KPIs with benchmark labels, forecast strip (Commit/Best Case/Pipeline), momentum board with Has Intel (81) toggle and sort controls, "Steady" now renders as distinct blue text vs "—" for no-data, pipeline velocity cards with benchmarks, renewals section. No issues.

**Prep Intel**: 3 cards with Calendly details, "Research Prospect" for 0-meeting leads (now correctly sends flat payload + persists enrichment to DB), "Draft Pre-Meeting Email", Deal Room link, prospect messages, company descriptions, context grid with win strategy + psychological profile + enrichment highlights. No issues.

## The One Remaining Gap: Automated Follow-Up Task Playbooks

Your original vision asked: "what should happen after each action — after they scheduled a meeting, after they took a meeting, if they didn't book at all?"

Currently the system generates one-off AI drafts via the Action Sheet. There are no automated multi-step task sequences triggered by stage transitions.

### What a sales veteran expects

```text
STAGE CHANGE → AUTO-GENERATED TASK SEQUENCE

Meeting Set:
  Day 0: Confirmation email (AI-drafted)
  Day -1: Agenda + talking points email
  Day +0: Auto-generate prep brief
  Day +1: Post-meeting follow-up with recap

Meeting Held → No Proposal Yet:
  Day +1: Send recap + next steps
  Day +3: Check-in if no response
  Day +7: Re-engage with added value

Proposal Sent:
  Day +2: "Any questions?" check-in
  Day +5: Value-add follow-up (case study)
  Day +10: Direct ask / negotiation nudge

Going Dark (21+ days silent):
  Day 0: Re-engagement with market insight
  Day +7: Breakup email (last attempt)
  Day +14: Archive or reassign

No Response to Initial Outreach:
  Day +3: Different angle follow-up
  Day +7: LinkedIn touchpoint suggestion
  Day +14: Final attempt with scarcity
```

### Implementation Plan

**1. Database: `lead_tasks` table**

```sql
CREATE TABLE public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  playbook text NOT NULL,        -- e.g. "meeting-set", "proposal-sent"
  sequence_order integer NOT NULL,
  task_type text NOT NULL,        -- "email", "call", "prep", "internal"
  title text NOT NULL,
  description text DEFAULT '',
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending, done, skipped, snoozed
  ai_content text,               -- AI-generated draft stored here
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to lead_tasks" ON public.lead_tasks FOR ALL USING (true) WITH CHECK (true);
```

**2. Playbook definitions (client-side constants)**

Create `src/lib/playbooks.ts` with typed playbook templates:
- Each playbook = array of task steps with relative day offsets, task type, title, and AI action type
- Playbooks keyed by trigger stage: `meeting-set`, `meeting-held`, `proposal-sent`, `going-dark`, `new-lead-no-response`

**3. Task generation on stage change**

In `LeadContext.tsx` `updateLead` function, when `stage` changes:
- Look up the matching playbook
- Generate task rows with absolute due dates (anchor = today + offset)
- Insert into `lead_tasks` via Supabase
- Optionally batch-generate AI content for each task via `generate-follow-up-action`

**4. UI: Task indicators in Follow-Ups + Prep Intel**

- In `FollowUpsTab`: Below each lead row, show pending task count badge and next task due date
- Add a "Tasks" expandable section showing the task sequence with checkboxes
- Clicking a task opens the AI Action Sheet pre-filled with that task's context
- Task completion marks it done and advances to next in sequence

**5. Schedule Tab: Today's playbook tasks**

- Add a "Playbook Tasks" section showing tasks due today across all leads
- Each task shows lead name, task title, and one-click action button

### Files Changed

| File | Changes |
|------|---------|
| Migration | Create `lead_tasks` table |
| `src/lib/playbooks.ts` | New file — playbook template definitions |
| `src/contexts/LeadContext.tsx` | Trigger playbook generation on stage change |
| `src/components/command-center/FollowUpsTab.tsx` | Show pending tasks per lead, task completion UI |
| `src/components/command-center/ScheduleTab.tsx` | Add "Today's Tasks" section from playbook |
| `src/components/command-center/PrepIntelTab.tsx` | Show upcoming playbook tasks for meeting leads |

