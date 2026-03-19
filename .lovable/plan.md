

# Fix: Deal Value CRM Suggestion Pulling Wrong Number

## Problem
The AI is suggesting `dealValue = 1,000,000` based on the prospect's **acquisition target range** (750K–1M EBITDA targets), when `dealValue` should represent the value of the **Captarget/SourceCo service engagement** (i.e., subscription pricing for origination services). These are completely different numbers.

## Fix

### `supabase/functions/process-meeting/index.ts`
Update two places:

1. **Tool schema description** (line 209): Change from the vague "Estimated deal value in dollars" to explicitly state this is the Captarget/SourceCo engagement value — NOT the prospect's acquisition target size.

2. **System prompt section** (lines 334-335): Replace the "Deal Value" guidance with explicit instructions:
   - Deal Value = the revenue Captarget/SourceCo earns from this client's subscription/retainer
   - NOT the prospect's M&A target size, acquisition range, or EBITDA criteria
   - Only suggest if actual service pricing or package cost was discussed
   - Typical values are service subscription amounts (e.g., $5K–$25K/month), not millions

### Files Changed
- `supabase/functions/process-meeting/index.ts` — Fix dealValue description in tool schema + system prompt

