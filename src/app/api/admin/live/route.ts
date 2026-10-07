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
  let cancelStream = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let clientId: string | null = null;
      let keepAlive: ReturnType<typeof setInterval> | null = null;

      const cleanup = (closeController: boolean) => {
        if (isClosed) return;
        isClosed = true;

        if (keepAlive) clearInterval(keepAlive);
        request.signal.removeEventListener("abort", handleAbort);

        if (clientId) {
          const activeClientId = clientId;
          clientId = null;
          removeAdminRealtimeClient(activeClientId);
        }

        if (closeController) {
          try {
            controller.close();
          } catch {
            // The consumer may already have canceled the stream.
          }
        }
      };

      const handleAbort = () => cleanup(true);
      cancelStream = () => cleanup(false);

      clientId = addAdminRealtimeClient(
        (message: string) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(message));
          } catch {
            cleanup(false);
          }
        },
        () => cleanup(false),
      );

      keepAlive = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: ${JSON.stringify({ sentAt: new Date().toISOString() })}\n\n`),
          );
        } catch {
          cleanup(false);
        }
      }, 15000);

      request.signal.addEventListener("abort", handleAbort, { once: true });
      if (request.signal.aborted) cleanup(true);
    },
    cancel() {
      cancelStream();
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
