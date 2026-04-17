
The user wants a deep, strategic plan for what to build next. They've given me HubSpot reference screenshots and asked me to think about: persona, industry (M&A buy-side advisory), sales process, prospect signals from calls, and what world-class would look like.

Let me think extremely deep about this.

**Who are Captarget/SourceCo's customers?**
- Captarget: PE firms, family offices, search funds, strategic acquirers, independent sponsors looking to buy companies. They pay $5-25K/mo for off-market deal flow (email origination, direct calling, banker coverage).
- SourceCo: Similar buyer universe but for retained M&A intro searches.
- These are sophisticated finance buyers. Long sales cycles. Multiple stakeholders (Managing Partner, Principal, Associate, Operating Partner).
- Decision criteria: deal flow quality, relevance to thesis, cost-per-qualified-lead, banker relationships.

**What do they say on calls (from existing intelligence schema)?**
Looking at MeetingIntelligence — we already extract: buying intent, sentiment, timeline, budget, champions, competitors (other origination shops, in-house BD, bankers), objections, risk factors, decision process, urgency drivers, pain points, value prop, engagement level, buyer journey, champion strength.

**What does our typical sales process look like?**
1. Inbound form (Webflow → Zapier → ingest-lead) → enrichment → scoring → tier
2. SDR/Malik calendly booking → meeting held (Fireflies transcript)
3. Synthesis → deal intelligence → next steps
4. Proposal → contract → won/lost

**Where are the gaps that would give us 10x leverage?**

Let me think about what a Fortune 500 M&A-focused sales leader would demand that we DON'T have:

### Category 1: Conversation Intelligence Beyond Single Meetings
- **Talk-time analytics dashboard per rep** — we extract talkRatio per meeting, never aggregated. A rep talking >60% across all calls is a coaching flag.
- **Question quality trends** — we have it per meeting, never charted. "Malik's question quality has dropped from Strong → Adequate over last 5 calls."
- **Objection patterns across the book** — "47% of lost deals raised pricing in meeting 1; we win 73% when we address it before meeting 2"
- **Win/loss linguistics** — what phrases appear in won vs lost transcripts
- **Competitor mention frequency over time** — Sourcescrub mentioned 12x last quarter, 28x this quarter → competitive pressure

### Category 2: Predictive Deal Scoring (beyond static lead score)
- **Win probability that updates after each meeting** — combining stage + momentum + champion strength + objection count + days since last contact
- **Deal slip-risk forecast** — "This deal will close ~14d later than committed based on cadence"
- **Stalled deal early warning** — before it's actually stalled
- **Forecast confidence calibration** — track Malik's actual vs predicted close rate by confidence level

### Category 3: M&A-Specific Intelligence Layer
- **Buybox match scoring** — score each lead against their *stated* acquisition criteria (revenue range, geography, sector). When a Captarget client says "we want $5-15M EBITDA SaaS in TX", we score how well our pitch matches.
- **Thesis alignment narrative** — for SourceCo, generate a 2-line "why we're a fit for their thesis" 
- **Deal flow ROI projection per client** — "if we ship 30 targets/mo at our hit rate, expect 2 LOIs / yr at $X/deal"
- **Banker landscape map** — track which bankers each client mentions / works with → identify referral patterns
- **Sector/strategy heat map** — which buyer segments are growing (PE-backed search funds up 40%, family offices flat)

### Category 4: Stakeholder & Account Intelligence
- **Multi-stakeholder timeline view** — who's been talked to when, who's gone dark
- **Influence/champion-strength evolution** — chart of how champion has trended over meetings
- **Email engagement per stakeholder** — opens/clicks broken down by person, not just deal-level
- **Stakeholder activity feed** — "CFO hasn't been on a call in 21d" 
- **Account hierarchy** — for PE firms making multiple intro requests over time, treat as one account with deal history

### Category 5: AI Sales Coach (Real-Time Assistant)
- **Pre-call brief delivered to Slack/email 2hrs before meeting** — already have prep brief, never proactively pushed
- **Post-call coach card** — "You missed 2 buying signals at 14:32 and 22:17 — here's what to follow up on"
- **Email response coach** — when a prospect emails an objection, AI suggests 3 response approaches scored by historical win rate
- **Daily AI standup** — "Top 3 deals you should touch today, top 3 risks, top 3 wins to celebrate"
- **Inline AI chat in panel** — "Ask about this deal" — chat over the entire deal context

### Category 6: Sequencing & Cadence
- **Multi-step email sequence builder** — drip campaigns for nurture stages (Revisit/Reconnect, Went Dark)
- **Cadence templates per stage** — "Meeting Held → 24h thank-you, 7d value asset, 14d re-engage"
- **Follow-up SLA tracker** — "Promised next step in 48h, currently 73h overdue"
- **Auto-pause sequences** when prospect replies

### Category 7: Knowledge & Asset Library
- **Sales asset library** — case studies, decks, ROI calculators, indexed by deal stage / objection type
- **"Send asset" inline action** in panel that picks the right one based on stage + objection
- **Snippet/template library** for common email responses

### Category 8: Pipeline & Reporting Power Tools
- **Saved views** at pipeline level (My deals · Closing this month · No activity 14d · etc.)
- **Bulk actions** (assign owner, change stage, archive, send email)
- **Cohort analysis** — leads from CT Free Targets Form vs SC Intro convert at what rate
- **Source ROI** — $ in (ad spend) vs $ out (closed won) per source/brand
- **Channel attribution multi-touch** — first/last/linear

### Category 9: Lead Quality Loop
- **Lead grading feedback loop** — when reps mark leads as bad fit, retrain scoring weights
- **ICP refinement** — quarterly auto-suggested ICP updates based on closed-won patterns
- **Disqualification reasons taxonomy** — track why leads dropped to refine intake form

### Category 10: Operations & Hygiene
- **Data quality dashboard** — % of deals with missing fields, stale stages, no next step
- **Workload balancing** — leads per rep, response time per rep
- **Holiday/OOO awareness** — auto-snooze deals when prospect on vacation
- **Time-zone awareness** for outreach
- **Email send time optimization** — best response rate by hour for this prospect type

### Category 11: Mobile / Quick Capture
- **Voice note → AI transcribed lead update** — log a call from your phone
- **Lightweight mobile pipeline view**
- **Push notification for urgent deal events**

### Category 12: Integrations Beyond Current
- **Slack DM digest** of daily priorities
- **Zoom/MS Teams integration** (currently Fireflies only)
- **Calendar block protection** (don't book over deep-work blocks)
- **CRM-to-billing handoff** when deal closes (Stripe)
- **Sentiment alerts** — Slack ping when a deal sentiment drops below threshold

### Category 13: Client Success / Post-Close (huge gap)
- **Client onboarding tracker** for closed-won deals
- **NRR / churn risk** scoring for active clients
- **Renewal pipeline** separate from new deal pipeline
- **Expansion opportunity flagging** (client could upgrade Captarget basic → full platform)

### Category 14: Compliance & Audit
- **Email recording disclosure** tracking
- **GDPR opt-out** management
- **Audit trail per deal** for regulated buyers

OK that's an extensive list. Now I need to be disciplined and cluster these into a strategic roadmap. The user wants "extremely helpful, intuitive, world-class" — so don't propose 50 things. Propose a layered v6+ strategy with 3-5 themes ranked by impact, then specific shippable deliverables per theme.

The truly highest-leverage items that match Captarget/SourceCo's specific reality:

**Theme 1: Deal Intelligence That Predicts (not just describes)**
Currently we describe what happened. Next: predict what will happen.
- Win probability rolling score
- Slip-risk forecast
- Stalled deal early warning

**Theme 2: AI Sales Coach (active, not passive)**
Currently AI synthesizes after meetings. Next: AI coaches in-flow.
- Inline deal chat ("Ask about this deal")
- Daily AI standup digest
- Post-call coach card with missed signals
- Email objection response suggester

**Theme 3: Conversation Analytics Across the Book**
Per-meeting intelligence is rich. Aggregate intelligence is missing.
- Talk-time / question quality trend chart per rep
- Objection pattern dashboard
- Competitor mention timeline
- Win/loss linguistic patterns

**Theme 4: M&A Buybox Matching (deeply bespoke)**
We don't lean into the M&A specificity enough.
- Buybox match score (lead's stated criteria vs our offering relevance)
- Thesis alignment 2-line narrative
- Banker landscape tracker
- Sector heat map

**Theme 5: Post-Close & Account Intelligence**
The biggest gap entirely — once deal closes, we forget about it.
- Client success tab (separate from deal pipeline)
- Renewal pipeline
- Expansion flag (upsell signals)
- NRR / churn risk

**Theme 6: Sequencing & Cadence Engine**
Currently we have one-off emails. Reps need cadences.
- Multi-step email sequence per stage
- Auto-pause on reply
- Follow-up SLA tracker

**Theme 7: Operations & Reporting Power**
- Saved views + bulk actions
- Source ROI / cohort
- Data quality dashboard

I'll present 5-7 themes with the top 3 specifically prioritized as the "v6 build" and the rest as a longer-horizon strategic roadmap. Be honest about what's deeply differentiating vs. table-stakes catch-up.

Let me draft. Keep under 10K chars. Don't ramble. The user is sophisticated.
