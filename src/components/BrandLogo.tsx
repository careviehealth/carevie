import Image from "next/image";

type BrandLogoProps = {
  width?: number;
  priority?: boolean;
  surface?: "plain" | "light" | "dark";
  className?: string;
};

const ASSET_WIDTH = 1023;
const ASSET_HEIGHT = 351;

const surfaceClassMap: Record<NonNullable<BrandLogoProps["surface"]>, string> = {
  plain: "",
  light:
    "rounded-[22px] border border-slate-200/80 bg-white px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)]",
  dark:
    "rounded-[22px] border border-white/15 bg-white/95 px-3 py-2 shadow-[0_20px_48px_rgba(2,6,23,0.28)] backdrop-blur-sm",
};

export default function BrandLogo({
  width = 180,
  priority = false,
  surface = "plain",
  className = "",
}: BrandLogoProps) {
  const height = Math.round((ASSET_HEIGHT / ASSET_WIDTH) * width);

  return (
    <div
      className={[
        "inline-flex items-center justify-center",
        surfaceClassMap[surface],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Image
        src="/carevie-logo.png"
        alt="Carevie"
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto max-w-full"
      />
    </div>
  );
}
