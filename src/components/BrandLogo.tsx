interface BrandLogoProps {
  brand: string;
  size?: "xs" | "sm" | "md";
}

const DIMS: Record<string, string> = {
  xs: "h-3",
  sm: "h-3.5",
  md: "h-4",
};

export function BrandLogo({ brand, size = "sm" }: BrandLogoProps) {
  const isCaptarget = brand === "Captarget";
  const src = isCaptarget ? "/captarget-logo.png" : "/sourceco-logo.svg";
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
