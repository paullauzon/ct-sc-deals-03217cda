

# Reprocess Failed LinkedIn Leads

## What needs to happen

Reset all failed leads (where `linkedin_url = ''`) back to `NULL`, then run the backfill-linkedin function which will process them through the new two-pass approach (Gemini Flash → GPT-4o retry).

## Steps

1. **Reset failed leads**: Run `UPDATE leads SET linkedin_url = NULL WHERE linkedin_url = '';` to mark them for reprocessing
2. **Run backfill-linkedin**: Invoke the edge function, which will pick up all leads with `linkedin_url IS NULL` and run them through Pass 1 (Flash, 5 turns) then Pass 2 (GPT-4o, 8 turns) for failures
3. **Report results**: Check the response for match counts across both passes

