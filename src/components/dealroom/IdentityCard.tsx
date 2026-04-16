import { Lead } from "@/types/lead";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import { Linkedin, Mail, Phone, Globe, Building2, Copy } from "lucide-react";
import { toast } from "sonner";

interface IdentityCardProps {
  lead: Lead;
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function IdentityCard({ lead }: IdentityCardProps) {
  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex flex-col items-center text-center">
        <CompanyAvatar
          companyUrl={lead.companyUrl}
          email={lead.email}
          companyName={lead.company}
          size="lg"
        />
        <h2 className="mt-2.5 text-base font-semibold leading-tight">{lead.name}</h2>
        {lead.role && (
          <p className="text-xs text-muted-foreground mt-0.5">{lead.role}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <BrandLogo brand={lead.brand} size="sm" />
          {lead.company && (
            <span className="text-xs text-muted-foreground">· {lead.company}</span>
          )}
        </div>
      </div>

      <div className="space-y-1 pt-1">
        {lead.email && (
          <button
            onClick={() => copy(lead.email, "Email")}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors group"
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1 text-left">{lead.email}</span>
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0" />
          </button>
        )}
        {lead.phone && (
          <button
            onClick={() => copy(lead.phone, "Phone")}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors group"
          >
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate flex-1 text-left">{lead.phone}</span>
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0" />
          </button>
        )}
        {lead.companyUrl && (
          <a
            href={lead.companyUrl.startsWith("http") ? lead.companyUrl : `https://${lead.companyUrl}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
          >
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.companyUrl.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
        {lead.linkedinUrl && (
          <a
            href={lead.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
            style={{ color: "#0A66C2" }}
          >
            <Linkedin className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.linkedinTitle || "LinkedIn Profile"}</span>
          </a>
        )}
        {lead.googleDriveLink && (
          <a
            href={lead.googleDriveLink}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded px-2 py-1.5 transition-colors"
          >
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">Drive folder</span>
          </a>
        )}
      </div>
    </div>
  );
}
