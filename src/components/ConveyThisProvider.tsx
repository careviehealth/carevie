import Script from "next/script";

const conveyThisKey = process.env.NEXT_PUBLIC_CONVEYTHIS_API_KEY;

export default function ConveyThisProvider() {
  if (!conveyThisKey) return null;

  return (
    <Script
      src={`https://cdn.conveythis.com/javascript/conveythis.js?api_key=${conveyThisKey}`}
      strategy="beforeInteractive"
    />
  );
}
