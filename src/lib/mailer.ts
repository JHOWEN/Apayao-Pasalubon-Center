import nodemailer from "nodemailer";

function isPlaceholderValue(value: string | undefined) {
  if (!value) return true;

  const normalized = value.trim().toLowerCase();
  return normalized === "example@123" || normalized === "replace-with-gmail-app-password" || normalized === "your-gmail-app-password" || normalized.includes("your-") || normalized.includes("yourdomain") || normalized.includes("yourverifieddomain") || normalized.includes("example") || normalized.includes("placeholder") || normalized === "changeme";
}

function hasRealProviderConfig(env: Record<string, string | undefined>) {
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const resendFrom = env.RESEND_FROM?.trim();
  const smtpUser = env.SMTP_USER?.trim();
  const smtpPass = env.SMTP_PASS?.trim();
  const smtpHost = env.SMTP_HOST?.trim();

  if (resendApiKey && resendFrom && !isPlaceholderValue(resendApiKey) && !isPlaceholderValue(resendFrom)) {
    return true;
  }

  if (smtpUser && smtpPass && !isPlaceholderValue(smtpUser) && !isPlaceholderValue(smtpPass) && (smtpHost || env.SMTP_SERVICE)) {
    return true;
  }

  return false;
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
