import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/auth";

type FeedbackType = "general" | "bug" | "feature";

type AttachmentInput = {
  path?: unknown;
  name?: unknown;
  type?: unknown;
};

type FeedbackPayload = {
  type?: unknown;
  message?: unknown;
  context?: unknown;
  attachments?: unknown;
  stepsToReproduce?: unknown;
  useCase?: unknown;
};

type FeedbackContext = {
  page: string;
  userAgent: string;
  timestamp: string;
  feedbackId?: string;
};

const DEFAULT_TABLE = process.env.SUPABASE_FEEDBACK_TABLE || "feedback";

const createAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
};

const isFeedbackType = (value: unknown): value is FeedbackType =>
  value === "general" || value === "bug" || value === "feature";

const normalizeAttachments = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as Array<{ path: string; name: string; type: string }>;
  }

  return value.reduce<Array<{ path: string; name: string; type: string }>>((accumulator, item) => {
    const attachment = item as AttachmentInput;
    const path = typeof attachment?.path === "string" ? attachment.path.trim() : "";
    const name = typeof attachment?.name === "string" ? attachment.name.trim() : "";
    const type = typeof attachment?.type === "string" ? attachment.type.trim() : "";

    if (!path || !name || !type) {
      return accumulator;
    }

    accumulator.push({ path, name, type });
    return accumulator;
  }, []);
};

const normalizeContext = (value: unknown): FeedbackContext | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const page = typeof raw.page === "string" ? raw.page.trim() : "";
  const userAgent = typeof raw.userAgent === "string" ? raw.userAgent.trim() : "";
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp.trim() : "";
  const feedbackId = typeof raw.feedbackId === "string" ? raw.feedbackId.trim() : undefined;

  if (!page || !userAgent || !timestamp) {
    return null;
  }

  return {
    page,
    userAgent,
    timestamp,
    feedbackId,
  };
};

export async function POST(request: Request) {
  try {
    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: "Service role key is missing." }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as FeedbackPayload | null;
    const type = body?.type;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const context = normalizeContext(body?.context);
    const attachments = normalizeAttachments(body?.attachments);
    const stepsToReproduce =
      typeof body?.stepsToReproduce === "string" ? body.stepsToReproduce.trim() : "";
    const useCase = typeof body?.useCase === "string" ? body.useCase.trim() : "";

    if (!isFeedbackType(type)) {
      return NextResponse.json({ message: "A valid feedback type is required." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ message: "Message is required." }, { status: 400 });
    }

    if (!context) {
      return NextResponse.json({ message: "Feedback context is required." }, { status: 400 });
    }

    const user = await getAuthenticatedUser(request);

    const feedbackRow: Record<string, unknown> = {
      type,
      message,
      context,
      attachments,
      user_id: user?.id ?? null,
    };

    if (context.feedbackId) {
      feedbackRow.id = context.feedbackId;
    }

    if (stepsToReproduce) {
      feedbackRow.steps_to_reproduce = stepsToReproduce;
    }

    if (useCase) {
      feedbackRow.use_case = useCase;
    }

    const { data, error } = await adminClient
      .from(DEFAULT_TABLE)
      .insert(feedbackRow)
      .select("id")
      .single();

    if (error) {
      console.error("Feedback insert failed:", error);
      return NextResponse.json(
        {
          message:
            "Feedback storage is not configured for the current database schema. Set SUPABASE_FEEDBACK_TABLE to the correct table or add the expected feedback table.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id ?? context.feedbackId ?? null });
  } catch (error) {
    console.error("Unexpected feedback submission error:", error);
    return NextResponse.json({ message: "Failed to submit feedback." }, { status: 500 });
  }
}
