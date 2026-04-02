

# Mega Copywriting Refinement — Structural Prompt Overhaul

## Why the Current Prompts Fail

The email in the screenshot violates at least 7 rules that are already in the prompt:

1. **"Emmanuel —"** — em dash (banned)
2. **"you mentioned budget constraints limit your lead generation"** — telling them what they already know (banned pattern)
3. **"As agreed"** — literally in the banned phrases list
4. **"low-cost resources"** — vague noun, no specificity
5. **"to support your current efforts"** — pure filler
6. **"Expect introductions and details on next steps"** — two CTAs, both vague
7. **"Resource Introductions for Canadian Leads"** — generic subject, reads like a newsletter header

The rules are correct but the model ignores them because: (a) the prompt is a wall of text with rules buried in paragraphs, (b) the GOOD examples still have subtle violations the model copies, (c) there's no "self-check" forcing the model to validate before returning, and (d) the prompt uses the same em dashes it bans (line 28: "Wall Street veteran — direct").

## The Fix — Three Structural Changes

### 1. Rewrite prompts with hierarchy, not walls

Replace paragraph-style rules with a numbered priority system. The model needs to know what matters MOST:

```text
PRIORITY 1 (violating these = unusable):
- No em dashes, en dashes, or double hyphens. Period.
- No banned phrases. If "As agreed", "As discussed", etc. appear, the email is trash.
- Never tell them what they already know about themselves.
- Maximum 80 words. Count them.

PRIORITY 2 (violating these = mediocre):
- First sentence: what YOU have, not what THEY said.
- One CTA naming a specific deliverable with a date.
- Every noun is specific (dollar amounts, geographies, company count).

PRIORITY 3 (polish):
- Subject: 4-6 words, specific to this deal, not a newsletter title.
- Sign off: first name, own line, no dash prefix.
```

### 2. Add a self-check instruction

After the writing rules, add:

```text
BEFORE RETURNING: Re-read your draft and check:
1. Does it contain any em dash, en dash, or "--"? If yes, rewrite.
2. Does it contain ANY phrase from the banned list? If yes, rewrite.
3. Does any sentence explain to the prospect what their own situation is? If yes, delete it.
4. Is the word count over 80? If yes, cut.
5. Does the subject line sound like a newsletter? If yes, make it specific.
6. Does the CTA name a specific deliverable with a date? If not, fix it.
```

### 3. Rewrite ALL examples — remove every last violation

The current "GOOD" examples still contain em dashes in the base prompt text itself (line 28, 41, 43, 70). The model reads these and mimics them. Every single dash in the entire prompt string must be replaced.

More critically, add **post-meeting specific** GOOD examples for `draft-followup` and the `post-meeting` action type, since the screenshot is a post-meeting email:

```text
BAD post-meeting: "Emmanuel, you mentioned budget constraints 
limit your lead generation. As agreed, I'll introduce you to 
two additional low-cost resources by Friday to support your 
current efforts."

GOOD post-meeting: "Emmanuel, sending 2 Canadian healthcare 
sourcing contacts by Friday. Both work sub-$5K retainers, 
one specializes in Ontario med-tech. Names and intros 
Thursday.\n\nMike"
```

The difference: BAD tells Emmanuel what he said. GOOD tells Emmanuel what he's getting.

### 4. Remove em dashes from the prompt prose itself

The base prompt on line 28 says `"Wall Street veteran — direct, specific"`. Line 42 says `"They know their fund size, their strategy, their portfolio."` with em dashes elsewhere. The model reads these dashes in its own instructions and reproduces them. Every `—` in the prompt text (not just the banned list) must become a comma or period.

### 5. Tighten the post-meeting prompt specifically

The current post-meeting instructions say "Reference ONE specific thing they said or decided." This causes the model to parrot back what the prospect said ("you mentioned budget constraints..."). Change to:

```text
- Do NOT repeat what they said back to them. They were there.
- Instead: state what YOU are delivering, with specifics (names, 
  count, dollar ranges, dates).
- The email should answer one question: "What am I getting, and when?"
```

### 6. Apply same overhaul to `draft-followup/index.ts`

This function has its own separate system prompt (not shared with `generate-follow-up-action`). Apply identical structural changes: priority hierarchy, self-check, dash-free prose, rewritten examples.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-follow-up-action/index.ts` | Restructure base prompt with priority hierarchy; add self-check instruction; remove all em dashes from prompt prose; rewrite all BAD/GOOD examples with post-meeting specific pairs; tighten post-meeting task instructions to ban parroting |
| `supabase/functions/draft-followup/index.ts` | Same structural overhaul: priority hierarchy, self-check, dash-free prose, better examples, anti-parrot rules |

