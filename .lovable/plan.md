

# Update Service Interest Options & Enrich Pipeline Cards

## What Changes

### 1. Update ServiceInterest to match Captarget's actual offerings

Replace the current generic service names with the real services from captarget.com:

**Current**: "Deal Origination", "Managed Outreach", "Pipeline Building", "Add-on Sourcing", "Custom Campaign", "Other", "TBD"

**New**: "Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "Other", "TBD"

These are the three core services Captarget offers. "Full Platform" covers clients who want all three combined.

### 2. Enrich Pipeline Cards with all key details

Currently pipeline cards only show: name, role, deal value, days in stage. The user wants "all their details in the card." Update cards to show:

- Name + Company
- Role
- Service Interest
- Deal Value
- Priority
- Days in stage
- Meeting Outcome (if set)
- Next follow-up date (if set)

This gives a complete at-a-glance view without opening the modal.

---

## Technical Details

### Files to modify:

**`src/types/lead.ts`** -- Update the `ServiceInterest` type:
```
"Off-Market Email Origination" | "Direct Calling" | "Banker/Broker Coverage" | "Full Platform" | "Other" | "TBD"
```

**`src/components/LeadsTable.tsx`** -- Update the `SERVICES` array to match the new type values.

**`src/data/leadData.ts`** -- Update any default service interest values in the initial lead data to use the new names.

**`src/components/Pipeline.tsx`** -- Expand pipeline card content to show company, service interest, priority, meeting outcome, and next follow-up alongside the existing name/role/value/days fields. Keep the hyper-minimal B&W aesthetic -- just small text lines, no icons.

**`src/contexts/LeadContext.tsx`** -- Add migration mapping: old service names to new ones (e.g., "Deal Origination" maps to "Off-Market Email Origination", "Managed Outreach" to "Direct Calling", etc.) so existing localStorage data transitions cleanly.

