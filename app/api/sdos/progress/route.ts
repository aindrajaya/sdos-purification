import { NextRequest, NextResponse } from "next/server";
import {
  AgentProgress,
  addListener,
  getSession,
  initializeSession,
  markAgentCompleted,
  markAgentError,
  markAgentRunning,
  removeListener,
} from "@/app/lib/progress-store";

/**
 * GET /api/sdos/progress?sessionId=xxx
 * Server-Sent Events endpoint for real-time progress updates
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId query parameter is required" },
      { status: 400 }
    );
  }

  // Initialize session if it doesn't exist
  let session = getSession(sessionId);
  if (!session) {
    session = initializeSession(sessionId);
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let listenerCallback: ((data: AgentProgress) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state for all agents
      for (const agent of session!.agents) {
        const data = `data: ${JSON.stringify(agent)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      // Add listener for future updates
      listenerCallback = (agentProgress: AgentProgress) => {
        try {
          const data = `data: ${JSON.stringify(agentProgress)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream might be closed
        }
      };

      addListener(sessionId!, listenerCallback);

      // Send keep-alive every 15 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15000);

      // Cleanup on close (this won't be called in all environments)
      request.signal.addEventListener("abort", () => {
        clearInterval(keepAliveInterval);
        if (listenerCallback) {
          removeListener(sessionId!, listenerCallback);
        }
      });
    },
    cancel() {
      if (listenerCallback) {
        removeListener(sessionId!, listenerCallback);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

interface ProgressUpdatePayload {
  sessionId: string;
  step: number;
  status: "running" | "completed" | "error";
  detail?: string;
  data?: any; // Phase-specific data from n8n
}

/**
 * POST /api/sdos/progress
 * Called by n8n workflow to update agent progress
 */
export async function POST(request: NextRequest) {
  let body: ProgressUpdatePayload;

  try {
    body = (await request.json()) as ProgressUpdatePayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const { sessionId, step, status, detail, data } = body;

  if (!sessionId || typeof step !== "number" || !status) {
    return NextResponse.json(
      { error: "sessionId, step, and status are required" },
      { status: 400 }
    );
  }

  // Get or create session
  let session = getSession(sessionId);
  if (!session) {
    session = initializeSession(sessionId);
  }

  let result: AgentProgress | null = null;

  switch (status) {
    case "running":
      result = markAgentRunning(sessionId, step, detail, data);
      break;
    case "completed":
      result = markAgentCompleted(sessionId, step, detail, data);
      break;
    case "error":
      result = markAgentError(sessionId, step, detail);
      break;
    default:
      return NextResponse.json(
        { error: "Invalid status. Must be: running, completed, or error" },
        { status: 400 }
      );
  }

  if (!result) {
    return NextResponse.json(
      { error: "Failed to update progress. Invalid step or session." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    updated: result,
  });
}
