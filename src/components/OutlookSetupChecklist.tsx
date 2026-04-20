import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ADMIN_CONSENT_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenant}/adminconsent?client_id={client_id}&redirect_uri={redirect_uri}";

const REQUIRED_SCOPES = [
  "Mail.Read",
  "Mail.Send",
  "offline_access",
  "User.Read",
];

export function OutlookSetupChecklist() {
  const [open, setOpen] = useState(false);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <div className="text-sm font-medium">Outlook / M365 setup checklist</div>
            <div className="text-[11px] text-muted-foreground">Two external steps unblock SourceCo email sync</div>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground">
          Pending
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border bg-secondary/10">
          {/* Step 1 */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-semibold">1</span>
              <span className="text-sm font-medium">Add the Microsoft Outlook API key</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7 mb-2">
              Once your Azure app registration is approved, set the secret <span className="font-mono text-foreground">MICROSOFT_OUTLOOK_API_KEY</span> in backend secrets. The sync code path is already deployed.
            </p>
            <div className="ml-7 flex items-center gap-2">
              <code className="text-[11px] font-mono bg-secondary px-2 py-1 rounded">MICROSOFT_OUTLOOK_API_KEY</code>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy("MICROSOFT_OUTLOOK_API_KEY", "Secret name")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-semibold">2</span>
              <span className="text-sm font-medium">Request M365 tenant admin consent</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7 mb-2">
              The SourceCo M365 tenant admin must grant consent for the app's delegated permissions. Send them this consent URL (replace placeholders with the values from your Azure app registration):
            </p>
            <div className="ml-7 space-y-2">
              <div className="flex items-start gap-2">
                <code className="flex-1 text-[10px] font-mono bg-secondary px-2 py-1.5 rounded break-all leading-relaxed">
                  {ADMIN_CONSENT_URL_TEMPLATE}
                </code>
                <Button variant="ghost" size="sm" className="h-6 px-2 shrink-0" onClick={() => copy(ADMIN_CONSENT_URL_TEMPLATE, "Consent URL")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Required delegated scopes:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REQUIRED_SCOPES.map(s => (
                  <code key={s} className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">{s}</code>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-semibold">3</span>
              <span className="text-sm font-medium">Reach out to Microsoft App Registrations</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              Open Azure portal to verify redirect URIs and download the client secret if needed.
            </p>
            <div className="ml-7 mt-2">
              <Button variant="outline" size="sm" className="h-7" asChild>
                <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Open Azure portal
                </a>
              </Button>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground border-t border-border pt-3 ml-7 -mx-7 px-7">
            <Check className="h-3 w-3 inline mr-1" />
            Once both blockers are cleared, Connect Outlook becomes available in the mailbox table above and SourceCo emails will start syncing automatically.
          </div>
        </div>
      )}
    </div>
  );
}
