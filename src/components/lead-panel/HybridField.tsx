import { Sparkles, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InlineTextField, InlineSelectField } from "./InlineEditFields";
import type { DerivedValue } from "@/lib/dealDossier";

/**
 * Shared "manual ⊕ derived" row used by Buyer Profile / M&A Mandate / Sales
 * Process. When `manual` is set, behaves exactly like an InlineTextField. When
 * empty, falls back to the derived value and:
 *   • renders a Sparkles glyph with a tooltip explaining the source
 *   • renders a one-click ✓ "Confirm" button that promotes the derived value
 *     into the manual column (clears the Sparkles, ends the AI badge)
 *
 * `onSave(value, meta)` — meta.confirmed is true when triggered by the ✓ button,
 * letting cards write an audit-log entry distinguishing user typing vs AI confirm.
 */

const SOURCE_LABEL: Record<DerivedValue["source"], string> = {
  ai: "AI suggestion",
  research: "AI research",
  submission: "Form submission",
  transcript: "Meeting transcript",
  "": "",
};

function sourceTooltip(d: DerivedValue): string {
  const base = SOURCE_LABEL[d.source] || "Inferred";
  return d.detail ? `${base} · ${d.detail}` : base;
}

export interface HybridSaveMeta {
  confirmed?: boolean;
  source?: DerivedValue["source"];
  detail?: string;
  label?: string;
}

interface HybridProps {
  label: string;
  manual?: string;
  derived: DerivedValue;
  onSave: (v: string, meta?: HybridSaveMeta) => void;
  /** Stable identifier used by the Dossier-completeness scroller. */
  fieldKey?: string;
}

export function HybridText({
  label, manual, derived, onSave, type = "text", fieldKey,
}: HybridProps & { type?: "text" | "number" | "date" }) {
  const wrap = (v: string) => onSave(v);
  const filled = !!(manual && manual.trim()) || !!derived.value;
  const dataAttr = fieldKey ? { "data-dossier-row": fieldKey, "data-dossier-filled": String(filled) } : {};
  if (manual && manual.trim()) {
    return (
      <div {...dataAttr}>
        <InlineTextField label={label} value={manual} onSave={wrap} type={type} />
      </div>
    );
  }
  if (!derived.value) {
    return (
      <div {...dataAttr}>
        <InlineTextField label={label} value="" onSave={wrap} type={type} />
      </div>
    );
  }
  return (
    <div className="relative group/hybrid" {...dataAttr}>
      <InlineTextField label={label} value={derived.value} onSave={wrap} type={type} />
      <DerivedAffordance
        derived={derived}
        onConfirm={() => onSave(derived.value, { confirmed: true, source: derived.source, detail: derived.detail, label })}
      />
    </div>
  );
}

export function HybridSelect({
  label, manual, derived, options, onSave, allowEmpty, fieldKey,
}: HybridProps & { options: string[]; allowEmpty?: boolean }) {
  const wrap = (v: string) => onSave(v);
  const filled = !!(manual && manual.trim()) || !!derived.value;
  const dataAttr = fieldKey ? { "data-dossier-row": fieldKey, "data-dossier-filled": String(filled) } : {};
  if (manual && manual.trim()) {
    return (
      <div {...dataAttr}>
        <InlineSelectField label={label} value={manual} options={options} onSave={wrap} allowEmpty={allowEmpty} />
      </div>
    );
  }
  if (!derived.value) {
    return (
      <div {...dataAttr}>
        <InlineSelectField label={label} value="" options={options} onSave={wrap} allowEmpty={allowEmpty} />
      </div>
    );
  }
  return (
    <div className="relative group/hybrid" {...dataAttr}>
      <InlineSelectField
        label={label}
        value={derived.value}
        options={Array.from(new Set([derived.value, ...options]))}
        onSave={wrap}
        allowEmpty={allowEmpty}
      />
      <DerivedAffordance
        derived={derived}
        onConfirm={() => onSave(derived.value, { confirmed: true, source: derived.source, detail: derived.detail, label })}
      />
    </div>
  );
}

/** Read-only derived row — used for transcript-only fields (e.g. Stakeholders, Champion). */
export function DerivedRow({ label, derived, fieldKey }: { label: string; derived: DerivedValue; fieldKey?: string }) {
  const filled = !!derived.value;
  const dataAttr = fieldKey ? { "data-dossier-row": fieldKey, "data-dossier-filled": String(filled) } : {};
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0" {...dataAttr}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate font-medium flex items-center gap-1.5 max-w-[60%]">
        {derived.value ? (
          <>
            <span className="truncate">{derived.value}</span>
            <SourceGlyph derived={derived} />
          </>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
    </div>
  );
}

/* ───────────── Internals ───────────── */

function SourceGlyph({ derived }: { derived: DerivedValue }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0 inline-flex">
            <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-[11px] py-1 px-2">
          {sourceTooltip(derived)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DerivedAffordance({ derived, onConfirm }: { derived: DerivedValue; onConfirm: () => void }) {
  return (
    <div className="absolute right-7 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex pointer-events-auto">
              <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-[11px] py-1 px-2">
            {sourceTooltip(derived)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirm(); }}
              className="opacity-0 group-hover/hybrid:opacity-100 pointer-events-auto h-3.5 w-3.5 inline-flex items-center justify-center rounded-sm border border-border/60 bg-background hover:bg-foreground hover:text-background hover:border-foreground transition-colors"
              aria-label="Confirm value"
            >
              <Check className="h-2 w-2" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-[11px] py-1 px-2">
            Confirm — promote to manual value
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
