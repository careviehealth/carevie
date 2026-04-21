import Image from "next/image";

type BrandLogoProps = {
  width?: number;
  priority?: boolean;
  variant?: "full" | "wordmark" | "mark";
  surface?: "plain" | "light" | "dark";
  className?: string;
};

const logoAssetMap = {
  full: {
    src: "/carevie-logo.png",
    width: 1023,
    height: 351,
  },
  wordmark: {
    src: "/carevie-wordmark.png",
    width: 720,
    height: 240,
  },
  mark: {
    src: "/carevie-mark.png",
    width: 315,
    height: 340,
  },
} as const;

const surfaceClassMap: Record<NonNullable<BrandLogoProps["surface"]>, string> = {
  plain: "",
  light:
    "drop-shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
  dark:
    "drop-shadow-[0_14px_28px_rgba(2,6,23,0.26)]",
};

export default function BrandLogo({
  width = 180,
  priority = false,
  variant = "full",
  surface = "plain",
  className = "",
}: BrandLogoProps) {
  const asset = logoAssetMap[variant];
  const height = Math.round((asset.height / asset.width) * width);

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
        src={asset.src}
        alt="Carevie"
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto max-w-full object-contain"
      />
    </div>
  );
}
