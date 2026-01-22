/**
 * /api/sdos/complete
 * 
 * Webhook endpoint to receive the final ERP execution confirmation from n8n
 * Called when the Mock ERP Execution node completes successfully
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const sessionId = body.session_id || body.sessionId || "unknown";
    const recommendation = body.final_recommendation || "UNKNOWN";
    const timestamp = body.timestamp || new Date().toISOString();

    console.log("✅ ERP Execution Complete:", {
      sessionId,
      recommendation,
      timestamp,
      reportId: body.report_id,
    });

    // Log the completion for demo purposes
    console.log("📊 S-DOS Workflow completed successfully:", {
      action: body.action,
      source: body.source,
      timestamp,
      sessionId,
      finalRecommendation: recommendation,
      success: body.success,
    });

    // Return success response to n8n immediately (avoid timeout)
    return NextResponse.json(
      {
        success: true,
        message: "ERP execution received and processed",
        sessionId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error processing ERP completion:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process ERP execution",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
