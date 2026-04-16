import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Hover-to-edit row used in HubSpot-style left rail.
 * - Click anywhere on the row → enters edit mode
 * - Enter saves, Escape cancels
 * - Blur saves (so you can tab away)
 * - Monochrome, no traffic-light colors
 */

interface BaseRowProps {
  label: string;
  display: React.ReactNode;
  onEnterEdit?: () => void;
  editing: boolean;
  editor: React.ReactNode;
}

function RowShell({ label, display, editing, editor, onEnterEdit }: BaseRowProps) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0",
        !editing && "cursor-pointer hover:bg-secondary/40 -mx-2 px-2 rounded"
      )}
      onClick={!editing ? onEnterEdit : undefined}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      {editing ? (
        <div className="flex-1 max-w-[55%]">{editor}</div>
      ) : (
        <span className="text-foreground text-right truncate font-medium flex items-center gap-1.5 max-w-[60%]">
          <span className="truncate">{display}</span>
          <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        </span>
      )}
    </div>
  );
}

export function InlineTextField({ label, value, onSave, placeholder, type = "text" }: {
  label: string;
  value: string | number;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setDraft(String(value ?? "")); inputRef.current?.focus(); inputRef.current?.select?.(); } }, [editing, value]);

  const commit = () => {
    if (draft !== String(value ?? "")) onSave(draft);
    setEditing(false);
  };
  const cancel = () => { setDraft(String(value ?? "")); setEditing(false); };

  const display =
    !value && value !== 0 ? <span className="text-muted-foreground/50">—</span> :
    type === "number" && label.toLowerCase().includes("value") ? `$${Number(value).toLocaleString()}` :
    String(value);

  return (
    <RowShell
      label={label}
      display={display}
      editing={editing}
      onEnterEdit={() => setEditing(true)}
      editor={
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") cancel(); }}
            onBlur={commit}
            placeholder={placeholder}
            className="h-7 text-xs"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      }
    />
  );
}

export function InlineSelectField({ label, value, options, onSave, allowEmpty }: {
  label: string;
  value: string;
  options: readonly string[] | string[];
  onSave: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const display = value || <span className="text-muted-foreground/50">—</span>;

  return (
    <RowShell
      label={label}
      display={display}
      editing={editing}
      onEnterEdit={() => setEditing(true)}
      editor={
        <Select
          value={value || (allowEmpty ? "__none__" : value)}
          onValueChange={(v) => { onSave(v === "__none__" ? "" : v); setEditing(false); }}
          open
          onOpenChange={(o) => { if (!o) setEditing(false); }}
        >
          <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowEmpty && <SelectItem value="__none__">— None —</SelectItem>}
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    />
  );
}

export function InlineToggleField({ label, value, onSave, onLabel = "Yes", offLabel = "No" }: {
  label: string;
  value: boolean;
  onSave: (v: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <div
      className="group flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0 cursor-pointer hover:bg-secondary/40 -mx-2 px-2 rounded"
      onClick={() => onSave(!value)}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn(
        "text-[10px] px-2 py-0.5 rounded inline-flex items-center gap-1 font-medium",
        value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
      )}>
        {value ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        {value ? onLabel : offLabel}
      </span>
    </div>
  );
}
