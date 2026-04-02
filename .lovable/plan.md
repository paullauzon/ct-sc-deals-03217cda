

# Fix: AI Email Copy Still Reads Like a Pitch

## What's Wrong With This Email

```
Subject: Leveraging Shore's $850M for Growth

Cody — Shore Capital's $850M fund closure primes Dillard Door
for aggressive acquisitions. Our pipeline includes five
tech-enhanced security firms...Can we discuss alignment
opportunities next Tuesday?
```

5 specific failures despite the prompt overhaul:

1. **"Leveraging"** — corporate buzzword. A PE partner would never write this word in a peer email.
2. **"primes Dillard Door for aggressive acquisitions"** — telling the prospect what their own strategy is. Patronizing. They know what the fund means.
3. **"Our pipeline includes"** — vendor language. "Our pipeline" = "our products." A peer would say "tracking 5 targets" not "our pipeline includes."
4. **"tech-enhanced security firms"** — vague. Which firms? What size? What geography?
5. **"Can we discuss alignment opportunities"** — "alignment opportunities" is meaningless corporate filler. What specific outcome would a call produce?

## Root Cause

The prompt has the right rules but lacks:
- A **banned corporate jargon** list (leveraging, synergies, alignment, opportunities, solutions, offerings, capabilities)
- An explicit rule: **never explain to the prospect what their own situation means** — they know. Just state what YOU have.
- The BAD/GOOD examples don't cover initial outreach specifically enough
- No instruction to **name specific things** (EBITDA ranges, geographies, sectors) instead of vague descriptors

## Changes to `generate-follow-up-action/index.ts`

### 1. Expand banned phrases with corporate jargon

Add to `BANNED_PHRASES`:
```
"leveraging", "synergies", "alignment", "opportunities", "solutions", "offerings",
"capabilities", "value proposition", "strategic fit", "growth trajectory",
"aggressive acquisitions", "primes you for", "positions you to",
"our pipeline includes", "our team can", "our services"
```

### 2. Add explicit anti-patterns to base prompt

Add these rules:
```
- NEVER explain to the prospect what their own situation means.
  They know their fund size, their strategy, their portfolio.
  BAD: "Your $850M fund primes you for aggressive acquisitions."
  GOOD: "We're tracking 3 targets in your core sector, $8-15M EBITDA."
- NEVER use "our pipeline", "our team", "our services" — these are vendor phrases.
  Say what you HAVE, not what you ARE. "3 off-market targets" not "our pipeline includes targets."
- Every noun must be specific. Not "security firms" but "$8-12M commercial security companies in the Southeast."
- The CTA must name a specific deliverable, not a vague conversation. Not "discuss opportunities" but "send you 3 profiles" or "compare target lists."
```

### 3. Tighten the initial-outreach prompt

Replace the current initial-outreach case with a sharper version that includes a purpose-built BAD/GOOD example:

```
BAD: "Cody — Shore Capital's $850M fund closure primes Dillard Door for
aggressive acquisitions. Our pipeline includes five tech-enhanced security
firms. Can we discuss alignment opportunities next Tuesday?"

GOOD: "Cody — 3 commercial security companies in TX, $8-12M revenue,
all off-market. One overlaps with Dillard Door's locksmith vertical.
Profiles by Thursday if useful. — Mike"
```

### 4. Apply same jargon ban to `draft-followup/index.ts`

Add the corporate jargon list to the draft-followup system prompt as well.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-follow-up-action/index.ts` | Expand BANNED_PHRASES with corporate jargon; add anti-patronizing rules; add specific-noun requirement; rewrite initial-outreach prompt with better BAD/GOOD example; tighten CTA specificity rule |
| `supabase/functions/draft-followup/index.ts` | Add same corporate jargon ban and anti-patronizing rules |

