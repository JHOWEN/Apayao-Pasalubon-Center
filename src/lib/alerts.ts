import { logError, logWarn } from "@/lib/logger";

export async function notifyOperationalAlert(event: string, context: Record<string, unknown> = {}) {
  const webhookUrl = process.env.OPERATIONAL_ALERT_WEBHOOK_URL?.trim();
  const payload = { event, timestamp: new Date().toISOString(), ...context };

  logWarn(event, context);

  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logWarn("operational.alert_webhook_failed", { event, status: response.status });
    }
  } catch (error) {
    logError("operational.alert_webhook_error", error, { event });
  }
}
