export function getAppBaseUrl(override?: string) {
  const configuredUrl = override?.trim() || process.env.APP_URL?.trim();
  if (!configuredUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL must be configured in production.");
    }
    return "http://localhost:3000";
  }

  const parsedUrl = new URL(configuredUrl);
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("APP_URL must not contain credentials.");
  }
  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }

  return parsedUrl.origin;
}
