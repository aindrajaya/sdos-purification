import { NextResponse } from "next/server";
import { initializeSession, markAgentRunning } from "@/app/lib/progress-store";

const WEBHOOK_URL =
  process.env.SDOS_WEBHOOK ?? process.env.NEXT_PUBLIC_SDOS_WEBHOOK ?? "";

// The URL n8n should call back to for progress updates
const PROGRESS_CALLBACK_URL =
  process.env.PROGRESS_CALLBACK_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

interface WorkflowPayload {
  file_data?: string;
  autonomy_level?: string;
  filename?: string;
  session_id?: string;
}

export async function POST(request: Request) {
  if (!WEBHOOK_URL) {
    return NextResponse.json(
      {
        error:
          "SDOS webhook is not configured. Set SDOS_WEBHOOK in your environment.",
      },
      { status: 500 },
    );
  }

  let body: WorkflowPayload;
  try {
    body = (await request.json()) as WorkflowPayload;
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload.", detail: String(error) },
      { status: 400 },
    );
  }

  // If no file_data, assume this is a callback from n8n (not initial submission)
  // Just return 200 to acknowledge
  if (!body.file_data) {
    console.log("Received callback (no file_data), acknowledging:", body);
    return NextResponse.json({ acknowledged: true }, { status: 200 });
  }

  if (typeof body.file_data !== "string") {
    return NextResponse.json(
      { error: "file_data must be a base64 string." },
      { status: 400 },
    );
  }

  // Initialize progress tracking if sessionId provided
  const sessionId = body.session_id;
  if (sessionId) {
    initializeSession(sessionId);
    // Mark agent 1 as running immediately
    markAgentRunning(sessionId, 1, "Starting blueprint extraction...");
  }

  const payload = {
    file_data: body.file_data,
    autonomy_level: body.autonomy_level ?? "human_approval",
    filename: body.filename ?? "blueprint.pdf",
    // Pass session info to n8n so it can call back with progress
    session_id: sessionId,
    progress_callback_url: sessionId
      ? `${PROGRESS_CALLBACK_URL}/api/sdos/progress`
      : undefined,
    completion_callback_url: sessionId
      ? `${PROGRESS_CALLBACK_URL}/api/sdos/complete`
      : undefined,
  };

  // Fire and forget - don't wait for n8n to complete
  // n8n will send progress updates to /api/sdos/progress
  // and final result to /api/sdos/complete
  fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error("Failed to trigger n8n workflow:", error);
  });

  console.log("✅ Workflow triggered for session:", sessionId);

  // Return immediately
  return NextResponse.json(
    {
      message: "Analysis started. Results will stream via progress updates.",
      sessionId: sessionId,
      status: "processing",
    },
    { status: 200 },
  );
}