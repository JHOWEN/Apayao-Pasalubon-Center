import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ensureAuthenticatedAdmin } from "@/lib/auth";
import { addAdminRealtimeClient, removeAdminRealtimeClient } from "@/lib/realtime";
import { enforceAuthenticatedRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminId = await ensureAuthenticatedAdmin();
  if (!adminId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const rateLimitResponse = await enforceAuthenticatedRateLimit(request, "admin:live:connect", "admin");
  if (rateLimitResponse) return rateLimitResponse;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const clientId = addAdminRealtimeClient(
        (message: string) => {
          controller.enqueue(encoder.encode(message));
        },
        () => {
          try {
            controller.close();
          } catch {
            // no-op
          }
        },
      );

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: ${JSON.stringify({ sentAt: new Date().toISOString() })}\n\n`),
          );
        } catch {
          clearInterval(keepAlive);
          removeAdminRealtimeClient(clientId);
        }
      }, 15000);

      const closeStream = () => {
        clearInterval(keepAlive);
        removeAdminRealtimeClient(clientId);
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener("abort", closeStream, { once: true });
    },
    cancel() {
      // cleanup handled by abort signal; no-op
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
