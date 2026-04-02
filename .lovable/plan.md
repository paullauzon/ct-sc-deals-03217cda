

# Fix: "Research Prospect" Data Is Lost + Wrong Payload

## The Problem

Two bugs in `PrepIntelTab.tsx` when clicking "Research Prospect" for 0-meeting leads:

### Bug 1: Wrong payload sent to `enrich-lead`
PrepIntelTab sends:
```json
{ "record": { "id": "...", "name": "Cody Mauri", "company_url": "..." } }
```
But `enrich-lead` expects flat fields:
```json
{ "companyUrl": "...", "leadName": "Cody Mauri", "leadCompany": "Dillarddoor", ... }
```
The edge function destructures `companyUrl`, `leadName`, `leadCompany` etc. from the top level — so it gets `undefined` for everything. The AI runs with almost no context and returns weak/generic data.

### Bug 2: Enrichment response is never saved to the database
The `enrich-lead` function returns `{ enrichment: { companyDossier, prospectProfile, preMeetingAmmo, ... } }` but PrepIntelTab only does:
```js
setEnrichmentUpdated(true); // local boolean
toast({ title: "Prospect researched" }); // misleading
```
It never writes to the database. Compare with `LeadsTable.tsx` line 200 which correctly calls:
```js
save({ enrichment: data.enrichment, enrichmentStatus: "complete" });
```

So the enrichment data is **generated, returned, and thrown away**. The toast "Enrichment data updated" is false — nothing is persisted.

---

## Fix

### File: `src/components/command-center/PrepIntelTab.tsx`

**Change 1** — Fix the payload to match what `enrich-lead` expects (same format as `LeadsTable.tsx`):
```js
: {
    companyUrl: lead.companyUrl,
    leadName: lead.name,
    leadMessage: lead.message,
    leadRole: lead.role,
    leadCompany: lead.company,
    leadStage: lead.stage,
    leadPriority: lead.priority,
    leadDealValue: lead.dealValue,
    leadServiceInterest: lead.serviceInterest,
    leadBuyerType: lead.buyerType,
    leadTargetCriteria: lead.targetCriteria,
    leadTargetRevenue: lead.targetRevenue,
    leadGeography: lead.geography,
    leadAcquisitionStrategy: lead.acquisitionStrategy,
    leadNotes: lead.notes,
  };
```

**Change 2** — After receiving enrichment data, save it to the database:
```js
} else if (!hasMeetings && data?.enrichment) {
  // Persist to database
  await supabase.from("leads").update({
    enrichment: data.enrichment,
    enrichment_status: "complete",
  }).eq("id", lead.id);
  setEnrichmentUpdated(true);
  toast({ title: "Prospect researched", description: `Research saved for ${lead.name}` });
}
```

This ensures the enrichment data (company dossier, prospect profile, pre-meeting ammo, competitive positioning, CRM suggestions, key insights) is actually persisted and visible when the user opens the lead detail panel or refreshes.

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Fix payload format to match enrich-lead API; save enrichment response to database |

