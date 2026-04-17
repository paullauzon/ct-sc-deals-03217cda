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

interface HybridProps {
  label: string;
  manual?: string;
  derived: DerivedValue;
  onSave: (v: string) => void;
}

export function HybridText({
  label, manual, derived, onSave, type = "text",
}: HybridProps & { type?: "text" | "number" | "date" }) {
  if (manual && manual.trim()) {
    return <InlineTextField label={label} value={manual} onSave={onSave} type={type} />;
  }
  if (!derived.value) {
    return <InlineTextField label={label} value="" onSave={onSave} type={type} />;
  }
  return (
    <div className="relative group/hybrid">
      <InlineTextField label={label} value={derived.value} onSave={onSave} type={type} />
      <DerivedAffordance derived={derived} onConfirm={() => onSave(derived.value)} />
    </div>
  );
}

export function HybridSelect({
  label, manual, derived, options, onSave, allowEmpty,
}: HybridProps & { options: string[]; allowEmpty?: boolean }) {
  if (manual && manual.trim()) {
    return <InlineSelectField label={label} value={manual} options={options} onSave={onSave} allowEmpty={allowEmpty} />;
  }
  if (!derived.value) {
    return <InlineSelectField label={label} value="" options={options} onSave={onSave} allowEmpty={allowEmpty} />;
  }
  return (
    <div className="relative group/hybrid">
      <InlineSelectField
        label={label}
        value={derived.value}
        options={Array.from(new Set([derived.value, ...options]))}
        onSave={onSave}
        allowEmpty={allowEmpty}
      />
      <DerivedAffordance derived={derived} onConfirm={() => onSave(derived.value)} />
    </div>
  );
}

/** Read-only derived row — used for transcript-only fields (e.g. Stakeholders, Champion). */
export function DerivedRow({ label, derived }: { label: string; derived: DerivedValue }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
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

/**
 * Sparkles + Confirm button overlay positioned to the right of the row's
 * value. The Confirm button is hover-revealed on the row to keep the resting
 * state clean.
 */
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
