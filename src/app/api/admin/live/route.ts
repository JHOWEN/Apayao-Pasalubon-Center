import { NextRequest } from "next/server";
import { addAdminRealtimeClient, removeAdminRealtimeClient } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
