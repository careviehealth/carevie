"use client";

import { driver, type DriveStep, type Driver, type Side } from "driver.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { useAppProfile } from "@/components/AppProfileProvider";

type TourStep = {
  route: string;
  selector: string;
  content: string;
  side: Exclude<Side, "over">;
  viewport?: "all" | "desktop" | "mobile";
};

const TOUR_QUERY_KEY = "tour";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const ROUTE_RESUME_DELAY_MS = 120;
const TARGET_INITIAL_DELAY_MS = 150;
const TARGET_RETRY_MS = 120;
const TARGET_MAX_ATTEMPTS = 10;

const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST204" ||
  error?.message?.toLowerCase().includes("has_seen_onboarding_tour");

const isDesktopViewport = () =>
  typeof window !== "undefined" && window.matchMedia(DESKTOP_MEDIA_QUERY).matches;

const isElementVisible = (element: Element) => {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const findVisibleTarget = (selector: string) => {
  const candidates = Array.from(document.querySelectorAll(selector));
  const visibleTarget = candidates.find(isElementVisible) as HTMLElement | undefined;

  return {
    target: visibleTarget ?? null,
    hasCandidates: candidates.length > 0,
  };
};

const TOUR_STEPS: TourStep[] = [
  {
    route: "/app/homepage",
    selector: '[data-tour="nav-home"]',
    content: "Use Home anytime to come back to your main dashboard.",
    side: "right",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="nav-switch-profile"]',
    content: "Switch Profile lets you quickly move between family members.",
    side: "right",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="home-get-summary"]',
    content: "Get Summary generates a quick overview from your uploaded reports.",
    side: "bottom",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="home-sos"]',
    content: "SOS instantly alerts your emergency contacts.",
    side: "bottom",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="home-notifications-desktop"]',
    content: "This notifications and activity panel shows updates and recent logs.",
    side: "left",
    viewport: "desktop",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="home-notifications-mobile"]',
    content: "Open Notifications to review alerts and recent activity logs.",
    side: "bottom",
    viewport: "mobile",
  },
  {
    route: "/app/homepage",
    selector: '[data-tour="home-quick-cards"]',
    content: "These cards open appointments, emergency contacts, medical team, and medications.",
    side: "top",
  },
  {
    route: "/app/profilepage",
    selector: '[data-tour="nav-profile"]',
    content: "Profile is where your full health information lives.",
    side: "right",
  },
  {
    route: "/app/profilepage",
    selector: '[data-tour="profile-overview"]',
    content: "Review and update personal details, vitals, and medical history here.",
    side: "bottom",
  },
  {
    route: "/app/vaultpage",
    selector: '[data-tour="nav-vault"]',
    content: "Vault stores your medical documents in one place.",
    side: "right",
  },
  {
    route: "/app/vaultpage",
    selector: '[data-tour="vault-upload"]',
    content: "Upload lab reports, prescriptions, insurance docs, and bills here.",
    side: "bottom",
  },
  {
    route: "/app/carecircle",
    selector: '[data-tour="nav-care-circle"]',
    content: "Care Circle helps you coordinate with trusted family or friends.",
    side: "right",
  },
  {
    route: "/app/carecircle",
    selector: '[data-tour="care-invite-member"]',
    content: "Invite members to collaborate on care and emergency readiness.",
    side: "bottom",
  },
  {
    route: "/app/carecircle",
    selector: '[data-tour="care-view-access"]',
    content: "Use this action to open shared details or the emergency card.",
    side: "left",
  },
  {
    route: "/app/settings",
    selector: '[data-tour="nav-settings"]',
    content: "Settings manages account controls, legal docs, and safety actions.",
    side: "right",
  },
  {
    route: "/app/settings",
    selector: '[data-tour="settings-replay-tour"]',
    content: "You can replay this walkthrough anytime from here.",
    side: "top",
  },
];

const resolveTourStepsForViewport = () => {
  const desktop = isDesktopViewport();
  return TOUR_STEPS.filter((step) => {
    const viewport = step.viewport ?? "all";
    if (viewport === "all") return true;
    if (viewport === "desktop") return desktop;
    return !desktop;
  });
};

export default function AppTourController() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { userId } = useAppProfile();

  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  const processedQueryRef = useRef<string | null>(null);
  const activeStepsRef = useRef<TourStep[]>(TOUR_STEPS);
  const driverRef = useRef<Driver | null>(null);
  const isTourRunningRef = useRef(false);
  const currentStepRef = useRef(0);
  const pendingStepIndexRef = useRef<number | null>(null);
  const suppressDestroyHookRef = useRef(false);
  const targetCheckTimerRef = useRef<number | null>(null);
  const navigateToStepRef = useRef<(index: number, direction: 1 | -1) => void>(() => undefined);

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

  const clearTargetCheckTimer = useCallback(() => {
    if (targetCheckTimerRef.current !== null) {
      window.clearTimeout(targetCheckTimerRef.current);
      targetCheckTimerRef.current = null;
    }
  }, []);

  const destroyDriver = useCallback((suppressHooks = true) => {
    const instance = driverRef.current;
    if (!instance) return;

    try {
      suppressDestroyHookRef.current = suppressHooks;
      instance.destroy();
    } finally {
      suppressDestroyHookRef.current = false;
      driverRef.current = null;
    }
  }, []);

  const stopTour = useCallback(
    (markSeen: boolean) => {
      isTourRunningRef.current = false;
      pendingStepIndexRef.current = null;
      clearTargetCheckTimer();
      destroyDriver(true);
      setPendingRoute(null);
      currentStepRef.current = 0;

      if (markSeen) {
        void markTourSeen();
      }
    },
    [clearTargetCheckTimer, destroyDriver, markTourSeen]
  );

  const createDriver = useCallback(() => {
    const activeSteps = activeStepsRef.current;
    const driverSteps: DriveStep[] = activeSteps.map((step) => ({
      element: step.selector,
      popover: {
        description: step.content,
        side: step.side,
        align: "center",
      },
    }));

    const instance = driver({
      steps: driverSteps,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: "#020617",
      overlayOpacity: 0.45,
      stagePadding: 8,
      stageRadius: 12,
      disableActiveInteraction: true,
      showButtons: ["previous", "next", "close"],
      showProgress: true,
      progressText: "Step {{current}} of {{total}}",
      prevBtnText: "Back",
      nextBtnText: "Next",
      doneBtnText: "Finish",
      popoverClass: "vytara-driver-popover",
      onNextClick: (_element, _step, opts) => {
        const activeIndex = opts.driver.getActiveIndex() ?? currentStepRef.current;
        navigateToStepRef.current(activeIndex + 1, 1);
      },
      onPrevClick: (_element, _step, opts) => {
        const activeIndex = opts.driver.getActiveIndex() ?? currentStepRef.current;
        navigateToStepRef.current(activeIndex - 1, -1);
      },
      onCloseClick: () => {
        stopTour(true);
      },
      onDestroyStarted: () => {
        if (suppressDestroyHookRef.current) return;
        if (!isTourRunningRef.current) return;
        stopTour(true);
      },
      onPopoverRender: (popover, opts) => {
        const activeIndex = opts.driver.getActiveIndex() ?? currentStepRef.current;
        popover.nextButton.innerHTML = activeIndex >= activeSteps.length - 1 ? "Finish" : "Next";
        popover.previousButton.innerHTML = "Back";

        if (!popover.footerButtons.classList.contains("vytara-driver-nav-buttons")) {
          popover.footerButtons.classList.add("vytara-driver-nav-buttons");
        }

        let skipButton = popover.footer.querySelector(
          ".vytara-driver-skip-btn"
        ) as HTMLButtonElement | null;

        if (!skipButton) {
          skipButton = document.createElement("button");
          skipButton.type = "button";
          skipButton.className = "vytara-driver-skip-btn";
          skipButton.setAttribute("aria-label", "Skip onboarding tour");
          popover.footer.insertBefore(skipButton, popover.footerButtons);
        }

        skipButton.innerHTML = "Skip";
        skipButton.onclick = () => stopTour(true);
      },
    });

    return instance;
  }, [stopTour]);

  const ensureDriver = useCallback(() => {
    if (!driverRef.current) {
      driverRef.current = createDriver();
    }

    return driverRef.current;
  }, [createDriver]);

  const navigateToStep = useCallback(
    (nextIndex: number, direction: 1 | -1) => {
      if (!isTourRunningRef.current) return;
      if (nextIndex < 0) return;
      const activeSteps = activeStepsRef.current;

      if (nextIndex >= activeSteps.length) {
        stopTour(true);
        return;
      }

      const nextStep = activeSteps[nextIndex];
      currentStepRef.current = nextIndex;

      if (nextStep.route !== pathname) {
        pendingStepIndexRef.current = nextIndex;
        setPendingRoute(nextStep.route);
        clearTargetCheckTimer();
        destroyDriver(true);
        router.push(nextStep.route);
        return;
      }

      let attempts = 0;

      const focusStepTarget = () => {
        if (!isTourRunningRef.current) return;

        const { target, hasCandidates } = findVisibleTarget(nextStep.selector);
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });

          clearTargetCheckTimer();
          const instance = ensureDriver();
          if (instance.isActive()) {
            instance.moveTo(nextIndex);
          } else {
            instance.drive(nextIndex);
          }
          return;
        }

        // Responsive variants can leave hidden matches in the DOM; skip these quickly.
        if (hasCandidates) {
          navigateToStep(nextIndex + direction, direction);
          return;
        }

        attempts += 1;
        if (attempts >= TARGET_MAX_ATTEMPTS) {
          navigateToStep(nextIndex + direction, direction);
          return;
        }

        clearTargetCheckTimer();
        targetCheckTimerRef.current = window.setTimeout(focusStepTarget, TARGET_RETRY_MS);
      };

      clearTargetCheckTimer();
      targetCheckTimerRef.current = window.setTimeout(focusStepTarget, TARGET_INITIAL_DELAY_MS);
    },
    [clearTargetCheckTimer, destroyDriver, ensureDriver, pathname, router, stopTour]
  );

  useEffect(() => {
    navigateToStepRef.current = navigateToStep;
  }, [navigateToStep]);

  useEffect(() => {
    if (!isTourRunningRef.current) return;
    if (!pendingRoute) return;
    if (pathname !== pendingRoute) return;

    const resumeIndex = pendingStepIndexRef.current ?? currentStepRef.current;

    const timer = window.setTimeout(() => {
      setPendingRoute(null);
      navigateToStep(resumeIndex, 1);
    }, ROUTE_RESUME_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [navigateToStep, pathname, pendingRoute]);

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
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextPath);
    }
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

      isTourRunningRef.current = true;
      activeStepsRef.current = resolveTourStepsForViewport();
      pendingStepIndexRef.current = 0;
      navigateToStep(0, 1);
    };

    void startTour();

    return () => {
      cancelled = true;
    };
  }, [navigateToStep, pathname, router, searchParams, userId]);

  useEffect(() => {
    return () => {
      isTourRunningRef.current = false;
      pendingStepIndexRef.current = null;
      clearTargetCheckTimer();
      destroyDriver(true);
    };
  }, [clearTargetCheckTimer, destroyDriver]);

  return null;
}
