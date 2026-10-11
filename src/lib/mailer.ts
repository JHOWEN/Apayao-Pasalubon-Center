import nodemailer from "nodemailer";

function isPlaceholderValue(value: string | undefined) {
  if (!value) return true;

  const normalized = value.trim().toLowerCase();
  return normalized === "example@123" || normalized === "replace-with-gmail-app-password" || normalized === "your-gmail-app-password" || normalized.includes("your-") || normalized.includes("yourdomain") || normalized.includes("yourverifieddomain") || normalized.includes("example") || normalized.includes("placeholder") || normalized === "changeme";
}

export function getConfiguredEmailProvider(env: Record<string, string | undefined> = process.env) {
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const resendFrom = env.RESEND_FROM?.trim();
  const smtpUser = env.SMTP_USER?.trim();
  const smtpPass = env.SMTP_PASS?.trim();
  const smtpHost = env.SMTP_HOST?.trim();

  if (resendApiKey && resendFrom && !isPlaceholderValue(resendApiKey) && !isPlaceholderValue(resendFrom)) {
    return "Resend" as const;
  }

  if (smtpUser && smtpPass && !isPlaceholderValue(smtpUser) && !isPlaceholderValue(smtpPass) && (smtpHost || env.SMTP_SERVICE)) {
    return "SMTP" as const;
  }

  return null;
}

function hasRealProviderConfig(env: Record<string, string | undefined>) {
  return getConfiguredEmailProvider(env) !== null;
}

type PaymentDecisionEmailInput = {
  to: string;
  customerName: string;
  orderNumber: string;
  paymentMethod: string;
  decision: "approved" | "declined";
  decisionAt: Date;
  totalAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    subtotal: number;
    variantDetails?: string | null;
  }>;
};

type PaymentDecisionEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "delivery_failed" };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPaymentEmailAmount(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return `PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function sendPaymentDecisionEmail(
  input: PaymentDecisionEmailInput,
): Promise<PaymentDecisionEmailResult> {
  const provider = getConfiguredEmailProvider();
  if (!provider) return { sent: false, reason: "not_configured" };

  const isApproved = input.decision === "approved";
  const paymentMethod = input.paymentMethod === "GCASH"
    ? "GCash"
    : input.paymentMethod === "PAYMAYA"
      ? "Maya"
      : input.paymentMethod === "CASH"
        ? "Cash"
        : input.paymentMethod;
  const subject = isApproved
    ? `Payment approved for order ${input.orderNumber}`
    : `Payment update for order ${input.orderNumber}`;
  const heading = isApproved ? "Payment approved" : "Payment not approved";
  const summary = isApproved
    ? "Your payment has been approved and your order is confirmed. Keep this email as your payment confirmation."
    : "We could not verify the payment proof for this order, so the order has been cancelled. If you believe this is a mistake, contact the store and include your order number.";
  const receiptHeading = isApproved ? "Payment receipt" : "Order summary";
  const paymentDate = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(input.decisionAt);
  const itemRows = input.items.map((item) => {
    const itemName = escapeHtml(item.name);
    const variant = item.variantDetails?.trim()
      ? `<div style="margin-top:3px;color:#64748b;font-size:12px;">${escapeHtml(item.variantDetails.trim())}</div>`
      : "";
    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;">${itemName}${variant}</td><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td><td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatPaymentEmailAmount(item.subtotal)}</td></tr>`;
  }).join("");
  const paymentStatus = isApproved ? "Approved" : "Declined";
  const safeOrderNumber = escapeHtml(input.orderNumber);
  const safeCustomerName = escapeHtml(input.customerName || "Customer");
  const safePaymentMethod = escapeHtml(paymentMethod);
  const totalAmount = formatPaymentEmailAmount(input.totalAmount);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
        <p style="margin:0 0 8px;color:#047857;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Apayao Pasalubong Center</p>
        <h1 style="margin:0 0 12px;font-size:24px;">${heading}</h1>
        <p style="margin:0 0 20px;">Hello ${safeCustomerName}, ${summary}</p>
        <h2 style="margin:24px 0 8px;font-size:16px;">${receiptHeading}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tbody>
            <tr><td style="padding:5px 0;color:#64748b;">Order number</td><td style="padding:5px 0;text-align:right;font-weight:600;">${safeOrderNumber}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Payment method</td><td style="padding:5px 0;text-align:right;font-weight:600;">${safePaymentMethod}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Payment status</td><td style="padding:5px 0;text-align:right;font-weight:600;">${paymentStatus}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Reviewed</td><td style="padding:5px 0;text-align:right;">${escapeHtml(paymentDate)}</td></tr>
          </tbody>
        </table>
        <table style="width:100%;margin-top:18px;border-collapse:collapse;font-size:14px;">
          <thead><tr><th style="padding:8px;text-align:left;background:#f1f5f9;">Item</th><th style="padding:8px;text-align:center;background:#f1f5f9;">Qty</th><th style="padding:8px;text-align:right;background:#f1f5f9;">Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:12px 8px;text-align:right;font-weight:700;">Order total</td><td style="padding:12px 8px;text-align:right;font-weight:700;">${totalAmount}</td></tr></tfoot>
        </table>
        <p style="margin:24px 0 0;color:#64748b;font-size:12px;">Please keep this email for your records. For help, contact the store and provide your order number.</p>
      </div>
    </div>
  `;
  const textItems = input.items.map((item) =>
    `- ${item.name}${item.variantDetails ? ` (${item.variantDetails})` : ""} x ${item.quantity}: ${formatPaymentEmailAmount(item.subtotal)}`,
  ).join("\n");
  const text = [
    "Apayao Pasalubong Center",
    heading,
    `Hello ${input.customerName || "Customer"}, ${summary}`,
    "",
    receiptHeading,
    `Order number: ${input.orderNumber}`,
    `Payment method: ${paymentMethod}`,
    `Payment status: ${paymentStatus}`,
    `Reviewed: ${paymentDate}`,
    "",
    textItems,
    `Order total: ${totalAmount}`,
    "",
    "For help, contact the store and provide your order number.",
  ].join("\n");

  try {
    if (provider === "Resend") {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from = process.env.RESEND_FROM?.trim();
      if (!apiKey || !from) return { sent: false, reason: "not_configured" };

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [input.to], subject, html, text }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) throw new Error(`Resend returned ${response.status}`);
      return { sent: true };
    }

    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const service = process.env.SMTP_SERVICE?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || user || "apc-inventory@example.com";
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    if (!user || !pass || (!host && !service)) return { sent: false, reason: "not_configured" };

    const transporter = nodemailer.createTransport(
      service
        ? { service, auth: { user, pass } }
        : { host, port, secure, auth: { user, pass } },
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        transporter.sendMail({ from, to: input.to, subject, html, text }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("SMTP delivery timed out.")), 8_000);
        }),
      ]);
      return { sent: true };
    } finally {
      if (timeout) clearTimeout(timeout);
      (transporter as unknown as { close?: () => void }).close?.();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MAILER] Failed to send payment decision email:", errorMessage);
    return { sent: false, reason: "delivery_failed" };
  }
}

function shouldUseDevelopmentPreview(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return process.env.NODE_ENV !== "production" && ["invalid login", "bad credentials", "authentication failed", "535", "auth", "smtp"].some((fragment) => normalized.includes(fragment));
}

export async function sendVerificationEmail(to: string, verificationUrl: string, subject = "Verify your APC Inventory account") {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const service = process.env.SMTP_SERVICE?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "apc-inventory@example.com";
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim();

  if (resendApiKey && resendFrom && !isPlaceholderValue(resendApiKey) && !isPlaceholderValue(resendFrom)) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [to],
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
              <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #111827;">Apayao Pasalubong Center</h2>
                <p style="margin: 0 0 12px; font-size: 16px;">Hello,</p>
                <p style="margin: 0 0 16px; font-size: 16px;">We received a request to help you reset your account password. Please use the button below to continue.</p>
                <p style="margin: 0 0 20px;">
                  <a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#f59e0b;color:#111827;text-decoration:none;border-radius:8px;font-weight:600;">Reset my password</a>
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; color: #475569;">If the button does not work, copy and open this link in your browser:</p>
                <p style="margin: 0; font-size: 14px; color: #475569; word-break: break-all;">${verificationUrl}</p>
                <p style="margin: 20px 0 0; font-size: 12px; color: #64748b;">If you did not request this change, you can safely ignore this message. For assistance, please contact our support team.</p>
              </div>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Resend returned ${response.status}`);
      }

      return { sent: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MAILER] Failed to send email via Resend:", errorMessage);

      return {
        sent: false,
        previewUrl: verificationUrl,
        message: `Email delivery failed: ${errorMessage}`,
      };
    }
  }

  if (!hasRealProviderConfig(process.env)) {
    const previewUrl = verificationUrl;
    console.info(`[DEV] Email delivery skipped. Preview link for ${to}: ${previewUrl}`);

    return {
      sent: false,
      previewUrl,
      message: "Email delivery is not configured. Set a real SMTP or Resend provider and restart the app.",
    };
  }

  const transporter = nodemailer.createTransport(
    service
      ? {
          service,
          auth: {
            user,
            pass,
          },
        }
      : {
          host,
          port,
          secure,
          auth: {
            user,
            pass,
          },
        }
  );

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <h2 style="margin: 0 0 12px; font-size: 24px; color: #111827;">Apayao Pasalubong Center</h2>
            <p style="margin: 0 0 12px; font-size: 16px;">Hello,</p>
            <p style="margin: 0 0 16px; font-size: 16px;">We received a request to help you reset your account password. Please use the button below to continue.</p>
            <p style="margin: 0 0 20px;">
              <a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#f59e0b;color:#111827;text-decoration:none;border-radius:8px;font-weight:600;">Reset my password</a>
            </p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #475569;">If the button does not work, copy and open this link in your browser:</p>
            <p style="margin: 0; font-size: 14px; color: #475569; word-break: break-all;">${verificationUrl}</p>
            <p style="margin: 20px 0 0; font-size: 12px; color: #64748b;">If you did not request this change, you can safely ignore this message. For assistance, please contact our support team.</p>
          </div>
        </div>
      `,
    });

    return { sent: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MAILER] Failed to send email:", errorMessage);

    if (shouldUseDevelopmentPreview(errorMessage)) {
      return {
        sent: false,
        previewUrl: verificationUrl,
        message: `Email delivery failed: ${errorMessage}. Using a preview link in development.`,
      };
    }

    return {
      sent: false,
      previewUrl: verificationUrl,
      message: `Email delivery failed: ${errorMessage}`,
    };
  }
}
