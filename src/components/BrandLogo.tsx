interface BrandLogoProps {
  brand: string;
  size?: "xs" | "sm" | "md";
}

const DIMS: Record<string, string> = {
  xxs: "h-3 max-w-[56px]",
  xs: "h-3.5 max-w-[72px]",
  sm: "h-4 max-w-[80px]",
  md: "h-5 max-w-[96px]",
};

export function BrandLogo({ brand, size = "sm" }: BrandLogoProps) {
  if (!brand) return null;

  const isCaptarget = brand === "Captarget";
  const src = isCaptarget ? "/captarget-logo.png" : "/sourceco-logo.png";
  const alt = isCaptarget ? "Captarget" : "SourceCo";

  return (
    <img
      src={src}
      alt={alt}
      className={`${DIMS[size]} object-contain shrink-0`}
      draggable={false}
    />
  );
}
