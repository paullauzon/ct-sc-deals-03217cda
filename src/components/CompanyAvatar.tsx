import { useState } from "react";
import { getCompanyLogoUrl } from "@/lib/companyLogo";
import { cn } from "@/lib/utils";

interface CompanyAvatarProps {
  companyUrl?: string;
  email?: string;
  companyName?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<string, string> = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[9px]",
  md: "h-6 w-6 text-[10px]",
  lg: "h-8 w-8 text-xs",
};

export function CompanyAvatar({ companyUrl, email, companyName, size = "sm", className }: CompanyAvatarProps) {
  const logoUrl = getCompanyLogoUrl(companyUrl, email);
  const [imgError, setImgError] = useState(false);
  const letter = (companyName || email || "?")[0].toUpperCase();

  if (!logoUrl || imgError) {
    return (
      <div
        className={cn(
          "rounded-sm bg-secondary text-muted-foreground flex items-center justify-center font-medium shrink-0 ring-1 ring-border",
          SIZES[size],
          className
        )}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={companyName || ""}
      className={cn("rounded-sm shrink-0 ring-1 ring-border object-contain", SIZES[size], className)}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}
