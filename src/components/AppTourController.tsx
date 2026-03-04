"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { useAppProfile } from "@/components/AppProfileProvider";

type TourStep = {
  route: string;
  target: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right";
  disableBeacon?: boolean;
};

type TooltipPosition = {
  top: number;
  left: number;
  transformOrigin: string;
};

const TOUR_QUERY_KEY = "tour";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const TOOLTIP_GAP = 12;
const VIEWPORT_PADDING = 12;

const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST204" ||
  error?.message?.toLowerCase().includes("has_seen_onboarding_tour");

const isDesktopViewport = () =>
  typeof window !== "undefined" && window.matchMedia(DESKTOP_MEDIA_QUERY).matches;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getTooltipPosition = (
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  placement: TourStep["placement"]
): TooltipPosition => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = targetRect.bottom + TOOLTIP_GAP;
  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  let transformOrigin = "50% 0%";

  if (placement === "top") {
    top = targetRect.top - tooltipRect.height - TOOLTIP_GAP;
    transformOrigin = "50% 100%";
  } else if (placement === "left") {
    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
    left = targetRect.left - tooltipRect.width - TOOLTIP_GAP;
    transformOrigin = "100% 50%";
  } else if (placement === "right") {
    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
    left = targetRect.right + TOOLTIP_GAP;
    transformOrigin = "0% 50%";
  }

  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - tooltipRect.width - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - tooltipRect.height - VIEWPORT_PADDING);

  return {
    top: clamp(top, VIEWPORT_PADDING, maxTop),
    left: clamp(left, VIEWPORT_PADDING, maxLeft),
    transformOrigin,
  };
};

const TOUR_STEPS: TourStep[] = [
  {
    route: "/app/homepage",
    target: '[data-tour="nav-home"]',
    content: "Use Home anytime to come back to your main dashboard.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="nav-switch-profile"]',
    content: "Switch Profile lets you quickly move between family members.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="home-get-summary"]',
    content: "Get Summary generates a quick overview from your uploaded reports.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="home-sos"]',
    content: "SOS instantly alerts your emergency contacts.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="home-notifications-desktop"]',
    content: "This notifications and activity panel shows updates and recent logs.",
    placement: "left",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="home-notifications-mobile"]',
    content: "Open Notifications to review alerts and recent activity logs.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/homepage",
    target: '[data-tour="home-quick-cards"]',
    content: "These cards open appointments, emergency contacts, medical team, and medications.",
    placement: "top",
    disableBeacon: true,
  },
  {
    route: "/app/profilepage",
    target: '[data-tour="nav-profile"]',
    content: "Profile is where your full health information lives.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/profilepage",
    target: '[data-tour="profile-overview"]',
    content: "Review and update personal details, vitals, and medical history here.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/vaultpage",
    target: '[data-tour="nav-vault"]',
    content: "Vault stores your medical documents in one place.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/vaultpage",
    target: '[data-tour="vault-upload"]',
    content: "Upload lab reports, prescriptions, insurance docs, and bills here.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/carecircle",
    target: '[data-tour="nav-care-circle"]',
    content: "Care Circle helps you coordinate with trusted family or friends.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/carecircle",
    target: '[data-tour="care-invite-member"]',
    content: "Invite members to collaborate on care and emergency readiness.",
    placement: "bottom",
    disableBeacon: true,
  },
  {
    route: "/app/carecircle",
    target: '[data-tour="care-view-access"]',
    content: "Use this action to open shared details or the emergency card.",
    placement: "left",
    disableBeacon: true,
  },
  {
    route: "/app/settings",
    target: '[data-tour="nav-settings"]',
    content: "Settings manages account controls, legal docs, and safety actions.",
    placement: "right",
    disableBeacon: true,
  },
  {
    route: "/app/settings",
    target: '[data-tour="settings-replay-tour"]',
    content: "You can replay this walkthrough anytime from here.",
    placement: "top",
    disableBeacon: true,
  },
];

export default function AppTourController() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { userId } = useAppProfile();

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  const processedQueryRef = useRef<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const currentStep = TOUR_STEPS[stepIndex];

  const markTourSeen = useCallback(async () => {
    if (!userId) return;

    const now = new Date().toISOString();
    const { error } = await supabase.from("user_profile_preferences").upsert(
      {
        user_id: userId,
        has_seen_onboarding_tour: true,
        onboarding_tour_seen_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

    if (error && process.env.NODE_ENV !== "production") {
      console.error("Failed to persist onboarding tour state:", error);
    }
  }, [userId]);

  const stopTour = useCallback(
    (markSeen: boolean) => {
      setRun(false);
      setPendingRoute(null);
      setTargetRect(null);
      setTooltipPosition(null);

      if (markSeen) {
        void markTourSeen();
      }
    },
    [markTourSeen]
  );

  const navigateToStep = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0) return;
      if (nextIndex >= TOUR_STEPS.length) {
        stopTour(true);
        return;
      }

      const nextStep = TOUR_STEPS[nextIndex];
      setStepIndex(nextIndex);

      if (nextStep.route !== pathname) {
        setRun(false);
        setPendingRoute(nextStep.route);
        setTargetRect(null);
        setTooltipPosition(null);
        router.push(nextStep.route);
        return;
      }

      setPendingRoute(null);
      setRun(true);
    },
    [pathname, router, stopTour]
  );

  useEffect(() => {
    if (!pendingRoute) return;
    if (pathname !== pendingRoute) return;

    const timer = window.setTimeout(() => {
      setRun(true);
      setPendingRoute(null);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pathname, pendingRoute]);

  useEffect(() => {
    const mode = searchParams.get(TOUR_QUERY_KEY);
    if (mode !== "autostart" && mode !== "replay") {
      processedQueryRef.current = null;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!userId) return;

    const rawSearch = searchParams.toString();
    const params = new URLSearchParams(rawSearch);
    const tourMode = params.get(TOUR_QUERY_KEY);

    if (tourMode !== "autostart" && tourMode !== "replay") return;

    const dedupeKey = `${pathname}?${rawSearch}`;
    if (processedQueryRef.current === dedupeKey) return;
    processedQueryRef.current = dedupeKey;

    params.delete(TOUR_QUERY_KEY);
    const nextPath = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextPath, { scroll: false });

    let cancelled = false;

    const startTour = async () => {
      if (tourMode === "autostart") {
        if (!isDesktopViewport()) return;

        const { data, error } = await supabase
          .from("user_profile_preferences")
          .select("has_seen_onboarding_tour")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error && !isMissingColumnError(error) && error.code !== "PGRST116") {
          if (process.env.NODE_ENV !== "production") {
            console.error("Unable to load onboarding tour state:", error);
          }
        }

        const hasSeen = Boolean(data?.has_seen_onboarding_tour);
        if (hasSeen) return;
      }

      navigateToStep(0);
    };

    void startTour();

    return () => {
      cancelled = true;
    };
  }, [navigateToStep, pathname, router, searchParams, userId]);

  useEffect(() => {
    if (!run) return;
    if (!currentStep) return;
    if (currentStep.route !== pathname) return;

    let rafId: number | null = null;
    const findStepTarget = () => document.querySelector(currentStep.target) as HTMLElement | null;

    const updateTargetRect = () => {
      const target = findStepTarget();
      if (!target) {
        setTargetRect(null);
        return;
      }

      setTargetRect(target.getBoundingClientRect());
    };

    const scheduleUpdate = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(updateTargetRect);
    };

    const initialTimer = window.setTimeout(() => {
      const target = findStepTarget();

      if (!target) {
        navigateToStep(stepIndex + 1);
        return;
      }

      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      window.setTimeout(updateTargetRect, 120);
    }, 180);

    const onResize = () => scheduleUpdate();
    const onScroll = () => scheduleUpdate();

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [currentStep, navigateToStep, pathname, run, stepIndex]);

  useEffect(() => {
    if (!run || !targetRect || !currentStep || !tooltipRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setTooltipPosition(getTooltipPosition(targetRect, tooltipRect, currentStep.placement));
  }, [currentStep, run, targetRect]);

  useEffect(() => {
    if (!run) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopTour(true);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [run, stopTour]);

  const handleSkip = useCallback(() => {
    stopTour(true);
  }, [stopTour]);

  const handleNext = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      stopTour(true);
      return;
    }
    navigateToStep(stepIndex + 1);
  }, [navigateToStep, stepIndex, stopTour]);

  const handleBack = useCallback(() => {
    if (stepIndex === 0) return;
    navigateToStep(stepIndex - 1);
  }, [navigateToStep, stepIndex]);

  if (
    typeof document === "undefined" ||
    !run ||
    !currentStep ||
    currentStep.route !== pathname ||
    !targetRect
  ) {
    return null;
  }

  const highlightTop = Math.max(0, targetRect.top - 8);
  const highlightLeft = Math.max(0, targetRect.left - 8);
  const highlightWidth = targetRect.width + 16;
  const highlightHeight = targetRect.height + 16;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[12000]">
      <button
        type="button"
        aria-label="Close onboarding tour"
        className="pointer-events-auto absolute inset-0 bg-slate-950/45"
        onClick={handleSkip}
      />

      <div
        className="pointer-events-none absolute rounded-xl border-2 border-teal-600 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] transition-all duration-150"
        style={{
          top: highlightTop,
          left: highlightLeft,
          width: highlightWidth,
          height: highlightHeight,
        }}
      />

      <div
        ref={tooltipRef}
        className="pointer-events-auto absolute w-[min(24rem,calc(100vw-1.5rem))] rounded-xl bg-white p-4 shadow-2xl ring-1 ring-slate-200"
        role="dialog"
        aria-live="polite"
        style={
          tooltipPosition
            ? {
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transformOrigin: tooltipPosition.transformOrigin,
              }
            : { top: VIEWPORT_PADDING, left: VIEWPORT_PADDING }
        }
      >
        <button
          type="button"
          onClick={handleSkip}
          className="absolute right-3 top-3 text-lg leading-none text-slate-400 hover:text-slate-600"
          aria-label="Close onboarding tour"
        >
          ×
        </button>

        <p className="mb-4 pr-6 text-sm leading-6 text-slate-700">{currentStep.content}</p>

        <div className="mb-3 text-xs font-medium text-slate-500">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
