import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SECTIONS: { heading: string; items: { keys: string; label: string }[] }[] = [
  {
    heading: "Tabs",
    items: [
      { keys: "A", label: "Activity" },
      { keys: "C", label: "Actions" },
      { keys: "M", label: "Meetings" },
      { keys: "E", label: "Emails" },
      { keys: "I", label: "Intelligence" },
      { keys: "F", label: "Files" },
      { keys: "N", label: "Notes" },
    ],
  },
  {
    heading: "Navigation",
    items: [
      { keys: "⌘ [", label: "Previous deal" },
      { keys: "⌘ ]", label: "Next deal" },
      { keys: "⌘ K", label: "Global search" },
      { keys: "Esc", label: "Close panel" },
    ],
  },
  {
    heading: "View",
    items: [
      { keys: "[", label: "Toggle left rail" },
      { keys: "]", label: "Toggle right rail" },
      { keys: "D", label: "Toggle density (compact / comfortable)" },
      { keys: "?", label: "Show this help" },
    ],
  },
];

export function KeyboardCheatsheet({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {SECTIONS.map(section => (
            <div key={section.heading}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {section.heading}
              </p>
              <div className="space-y-0">
                {section.items.map(s => (
                  <div key={s.keys} className="flex items-center justify-between border-b border-border/40 py-1.5 last:border-0">
                    <span className="text-xs text-foreground/80">{s.label}</span>
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground/80 tabular-nums">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
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
