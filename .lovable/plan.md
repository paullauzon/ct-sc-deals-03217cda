

# AI Copywriting Overhaul — All Edge Functions

## The Core Problem

The current prompts produce generic "sales consultant" copy. For an audience of PE partners, family office principals, and C-suite acquirers — people getting 50+ cold emails per week — the output reads like every other AI-generated sales email. Specific failures:

1. **"Professional but warm" is meaningless** — it produces platitudes like "I hope this email finds you well" and "I'd love to connect"
2. **No awareness of recipient seniority** — writing to a PE Managing Partner the same way as a mid-market VP
3. **No anti-patterns enforced** — the AI uses filler phrases, rhetorical questions, and generic compliments
4. **Emails are too long** — 200 words is still too many for this audience. 75-120 words max
5. **No tone calibration by brand** — SourceCo (retained search) should sound different from Captarget (deal origination)
6. **Subject lines are generic** — "Following up on our conversation" instead of something specific
7. **Enrichment data is available but underused** — the draft functions receive `enrichment` and `dealIntelligence` but the prompts don't tell the AI how to weaponize that data
8. **No negative examples** — the AI doesn't know what BAD looks like for this audience

## What a 50-Year Sales Veteran Would Demand

- **First line must earn the second line** — no throat-clearing
- **One ask per email** — not three CTAs
- **Specificity over warmth** — name a number, a deal, a date, a name
- **Respect their time** — if it can be said in 3 sentences, say it in 3
- **Never sound like you're selling** — sound like a peer sharing intelligence
- **Match their register** — PE partners speak differently than search fund operators
- **Subject lines that get opened** — specific, not salesy

## Changes Across All AI Functions

### 1. `generate-follow-up-action/index.ts` — Complete Prompt Rewrite

**Base prompt** — replace the current generic instructions with:

```
Rules:
- Maximum 100 words for emails. 60-80 is ideal.
- First sentence must contain a SPECIFIC reference (a name, number, date, company, or event). No "I hope this finds you well." No "I wanted to reach out."
- ONE call-to-action per email. Not two. Not three. One.
- Never use: "I'd love to", "I wanted to", "I hope", "Just checking in", "Following up", "Circling back", "Touching base", "Per our conversation", "As discussed"
- Subject line: max 6 words. Must be specific. Never start with "Re:" unless it IS a reply.
- Sign off with first name only. No "Best regards", no "Looking forward".
- Write as a peer, not a vendor. You are sharing intelligence, not pitching.
- If brand is SourceCo: tone is direct, research-heavy, executive search vernacular. If Captarget: tone is market-intelligence-forward, deal-flow focused.
- Match seniority: for Managing Partners/CEOs, be briefer and more direct. For VPs/Directors, slightly more context is OK.
```

**Per-action-type prompts** — tighten each one:

- `initial-outreach`: Lead with a SPECIFIC insight from their enrichment data. Not "I noticed your company is growing" but "Your 3rd bolt-on since Q2 signals a platform play in HVAC distribution." One sentence of value, one CTA.
- `post-meeting`: Reference ONE specific thing they said (from meeting intelligence). Confirm the ONE next step. Done.
- `meeting-nudge`: Name the specific value they'll get from the meeting. Not "I'd love to discuss how we can help" but "I have 3 off-market targets in your geography that match your $5-15M EBITDA criteria."
- `proposal-followup`: Add ONE new data point they don't have. Not "checking in on the proposal."
- `re-engagement`: Max 50 words. Lead with one new market fact. End with "Still relevant?" or equivalent.
- `reply-inbound`: Mirror their tone and length. Answer the question in the first line.

### 2. `draft-followup/index.ts` — Same Prompt Standards

Apply the same anti-pattern rules and word limits. This function currently allows 200 words — cut to 100. Add the banned phrases list. Add the seniority-matching instruction.

### 3. `enrich-lead/index.ts` — Improve Battle Card Copy Quality

The enrichment prompts are already strong, but two improvements:
- `openingHook`: Add instruction "Do NOT start with 'I noticed' or 'I saw'. Start with the insight itself as a statement or question."
- `discoveryQuestions`: Add instruction "Questions must be impossible to answer with 'yes' or 'no'. Each must surface strategic intent."

### 4. Add a Banned Phrases List (shared constant)

Create a banned phrases string that gets injected into all email-generating prompts:

```
BANNED PHRASES (never use these):
"I hope this finds you well", "I wanted to reach out", "I'd love to", "Just checking in",
"Following up", "Circling back", "Touching base", "Per our conversation", "As discussed",
"At your earliest convenience", "Please don't hesitate", "I look forward to hearing from you",
"Let me know if you have any questions", "Happy to discuss further", "Quick question",
"I noticed that", "It was great to", "Thank you for your time"
```

### 5. Add Negative Examples to System Prompts

For `generate-follow-up-action`, add a "BAD vs GOOD" section:

```
BAD: "Hi John, I hope this email finds you well. I wanted to follow up on our recent conversation about your acquisition strategy. I'd love to schedule a call to discuss how our services might align with your goals. Please let me know what works for your schedule. Best regards, The Team"

GOOD: "John — your 3rd bolt-on this year puts you ahead of most platforms in building density. We have 2 off-market targets in your core geography, both $8-12M EBITDA. Worth a 15-min look Thursday? — Mike"
```

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-follow-up-action/index.ts` | Rewrite base prompt with 100-word limit, banned phrases, seniority matching, brand tone calibration, one-CTA rule, bad/good examples; tighten all 8 action-type prompts |
| `supabase/functions/draft-followup/index.ts` | Apply same prompt standards: 100-word limit, banned phrases, specificity rules, seniority matching |
| `supabase/functions/enrich-lead/index.ts` | Improve `openingHook` and `discoveryQuestions` field descriptions to ban generic patterns |

