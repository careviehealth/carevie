"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Joyride, {
  ACTIONS,
  EVENTS,
  STATUS,
  type CallBackProps,
  type Step,
} from "react-joyride";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { useAppProfile } from "@/components/AppProfileProvider";

type TourStep = Step & {
  route: string;
};

const TOUR_QUERY_KEY = "tour";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST204" ||
  error?.message?.toLowerCase().includes("has_seen_onboarding_tour");

const isDesktopViewport = () =>
  typeof window !== "undefined" && window.matchMedia(DESKTOP_MEDIA_QUERY).matches;

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

  const processedQueryRef = useRef<string | null>(null);

  const steps = TOUR_STEPS as Step[];

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

  const navigateToStep = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS.length) {
        setRun(false);
        setPendingRoute(null);
        return;
      }

      const nextStep = TOUR_STEPS[nextIndex];
      setStepIndex(nextIndex);

      if (nextStep.route !== pathname) {
        setRun(false);
        setPendingRoute(nextStep.route);
        router.push(nextStep.route);
        return;
      }

      setPendingRoute(null);
      setRun(true);
    },
    [pathname, router]
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

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if (
        status === STATUS.FINISHED ||
        status === STATUS.SKIPPED ||
        action === ACTIONS.CLOSE
      ) {
        setRun(false);
        setPendingRoute(null);
        void markTourSeen();
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const direction = action === ACTIONS.PREV ? -1 : 1;
        navigateToStep(index + direction);
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        const direction = action === ACTIONS.PREV ? -1 : 1;
        navigateToStep(index + direction);
      }
    },
    [markTourSeen, navigateToStep]
  );

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      disableCloseOnEsc={false}
      disableOverlayClose={false}
      hideCloseButton={false}
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      stepIndex={stepIndex}
      steps={steps}
      styles={{
        options: {
          zIndex: 12000,
          primaryColor: "#0f766e",
        },
      }}
    />
  );
}
