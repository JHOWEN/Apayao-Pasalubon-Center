import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getUserForToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCustomerRealtimeClient, removeAdminRealtimeClient } from "@/lib/realtime";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = (await cookies()).get("token")?.value;
  const payload = token ? await getUserForToken(token) : null;
  if (!payload?.sub) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, isBlocked: true },
  });
  if (!user || user.isBlocked || user.role !== "CUSTOMER") {
    return NextResponse.json({ success: false, message: "Customer account required." }, { status: 403 });
  }

  const rateLimitResponse = await enforceRateLimit(request, "user:live:connect", {
    group: "user",
    accountId: user.id,
    message: "Too many live connections. Please try again in a moment.",
  });
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
      clientId = addCustomerRealtimeClient(
        user.id,
        (message) => {
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
          controller.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify({ sentAt: new Date().toISOString() })}\n\n`));
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
