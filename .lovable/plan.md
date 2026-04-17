
The user wants a deep investigation of what to build/improve next given current state, with HubSpot reference screenshots and our specific Captarget/SourceCo workflow. This is a planning task. Let me think through this very carefully.

Let me first look at the current state of files to understand what we have, then design a thoughtful plan.

Key context from memory:
- Captarget = M&A buyer-side origination (Off-Market Email, Direct Calling, Banker/Broker)
- SourceCo = M&A targets/intro service
- Deal value = $5K-$25K/mo service revenue (NOT M&A target sizes)
- Black/white minimalist aesthetic, no alarm colors, no emojis
- 12 pipeline stages, AI playbook chips, prep briefs, Fireflies, Calendly, Zapier email
- Current panel has: header (stage progress, copy link, last contact, prev/next), left rail (Key Info, Dates, Won/Lost inline edit), right rail (AI Insights, Submission History, Email Activity, Open Commitments, Stakeholders, Risks), tabs (Activity, Actions, Meetings, Emails, Intelligence, Files, Notes, Debrief), action bar with proper dialogs, email compose drawer, actionable follow-up banner

What HubSpot has that we don't (from screenshots):
1. **Activity timeline controls** — search, filter by type, filter by user, date range, collapse/expand all, thread email replies
2. **Activity types diversity** — sequence enrollments, chat conversations, form submissions, LinkedIn messages
3. **Pinnable activity** — pin to top
4. **Communication subscriptions** — opt-out tracking, GDPR
5. **Website activity** — page views, sessions, original source
6. **Lifecycle stage separate from lead status** — Lead status (New/Open/In Progress/Connected/Bad Timing) is separate from pipeline stage
7. **All properties view** — "view all properties" expansion
8. **Last activity vs Last contacted** — distinction (any activity vs human contact)
9. **Next activity date** — auto from upcoming meetings/tasks
10. **Customizable property layout** — admins set defaults

What's specifically valuable for us (Captarget/SourceCo):
- We're M&A buy-side. Reps need: deal context, stakeholder map, timing signals, competing bankers
- Lead status separate from stage is HUGE for us (a "Meeting Held" lead can be Connected, Stalled, or Reviewing)
- Form submission timeline (we have submission history but not woven into timeline)
- Activity filters when timeline gets dense (long deals = 50+ events)
- Pin pivotal moments (key meeting transcript, decision-maker email)
- Email open/click tracking (when we go live with Outlook deep sync)
- Original source / first touch attribution

Things specifically MISSING that a Fortune 500 sales leader would want for OUR business:
- **Stakeholder/Champion map** — we have a stakeholders card but it's read-only and shallow. M&A deals have 3-7 people: founder, CFO, deal lead, advisor, board. Need add/edit, role tags, last-contacted-per-person
- **Competing bankers/advisors** — critical for Captarget; tracks who else is pitching
- **Acquisition criteria block (SourceCo)** — buyer types, target size, geography, sectors — already in fields but not surfaced as a "criteria card"
- **Deal economics calc** — MRR, contract length, total contract value, expected close date confidence — not just $ value
- **Mutual close plan / next mutual step** — explicit field for "agreed next step" with date
- **Risk register** — we have risks card but no add/track/resolve workflow
- **Email sequence enrollment status** — when we launch sequencing
- **Forecast confidence slider** — not just commit/best-case dropdown
- **Win-room panel** for late-stage deals — proposal, contract, signature tracking
- **Document tracking** — proposal sent date, opened, signed (when we add e-sign)
- **Source attribution** — first-touch, multi-touch, channel — we know source per submission but no attribution narrative
- **Account hierarchy** — for SourceCo where one PE firm has multiple intro requests
- **Engagement score timeline** — graph of engagement over time
- **Snooze whole deal until X date** — beyond next follow-up

UX improvements:
- **Universal search inside panel** (Cmd+/) — search across all activities, files, notes for this deal
- **Activity filter pills** above timeline (All / Emails / Meetings / Notes / Stage changes)
- **Pin to top** for activities
- **Expand/collapse all** activities
- **"Copy summary"** — generates a 1-paragraph deal summary for handoff/Slack
- **Slash commands in notes** (`/task`, `/meeting`, `/risk`)
- **@mention teammates** in notes (when we add multi-user — defer)
- **Inline thread view** for email replies
- **Quick view/peek** without opening full panel (already had this in old card hover)
- **Saved views/filters** at lead list level (not panel)
- **Bulk actions from header** — assign owner, change stage, archive multiple
- **Undo last action** toast (we have stage undo, expand to all field changes)

Visual polish:
- **Density toggle** (compact/comfortable)
- **Right rail collapse** to give activity more room
- **Sticky tab navigation** on scroll
- **Keyboard cheat sheet** (`?` overlay)
- **Print/export deal summary** PDF for client handoffs
- **Persistent draft state** when switching tabs

Bespoke to Captarget/SourceCo workflow:
- **"Origination type" badge prominent** — Email/Calling/Broker
- **"Acquirer profile" snapshot** — for SourceCo, summarize what they buy
- **"Target list status"** — for Captarget, link to target list deliverable
- **"Close confidence narrative"** — short AI-generated 2-line summary at top of panel
- **"Time to first response" tracking** per inbound lead
- **"Days to meeting" / "Days to close"** velocity metrics

I should propose a layered plan — pick the 6-8 highest-leverage items and group them into a coherent v4. Don't try to ship everything. Stay disciplined.

Let me check current files briefly before planning.

Plan structure:
- Brief diagnosis of where we are
- 5-7 capability themes ranked by impact
- Files touched per theme
- What we explicitly defer

Keep concise.
