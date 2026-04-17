import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "A", label: "Activity tab" },
  { keys: "C", label: "Actions tab" },
  { keys: "M", label: "Meetings tab" },
  { keys: "E", label: "Emails tab" },
  { keys: "I", label: "Intelligence tab" },
  { keys: "F", label: "Files tab" },
  { keys: "N", label: "Notes tab" },
  { keys: "⌘ [", label: "Previous deal" },
  { keys: "⌘ ]", label: "Next deal" },
  { keys: "⌘ K", label: "Global search" },
  { keys: "Esc", label: "Close panel" },
  { keys: "?", label: "Show this help" },
];

export function KeyboardCheatsheet({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex items-center justify-between border-b border-border/40 py-1.5 last:border-0">
              <span className="text-xs text-foreground/80">{s.label}</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground/80 tabular-nums">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
          Shortcuts are disabled while typing.
        </p>
      </DialogContent>
    </Dialog>
  );
}
