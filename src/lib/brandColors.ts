import type { Brand } from "@/types/lead";

/** Returns a Tailwind border-l color class for brand differentiation */
export function getBrandBorderClass(brand?: string): string {
  if (!brand) return "";
  if (brand === "Captarget") return "border-l-2 border-l-red-500";
  if (brand === "SourceCo") return "border-l-2 border-l-amber-500";
  return "";
}

/** Returns a small colored dot element for inline brand indication */
export function getBrandDotClass(brand?: string): string {
  if (!brand) return "";
  if (brand === "Captarget") return "bg-red-500";
  if (brand === "SourceCo") return "bg-amber-500";
  return "";
}
