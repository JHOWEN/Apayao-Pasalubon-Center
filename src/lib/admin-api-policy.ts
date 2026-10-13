const staffAllowedMethods: Record<string, readonly string[]> = {
  "/api/admin/categories": ["GET"],
  "/api/admin/live": ["GET"],
  "/api/admin/orders": ["GET", "POST", "PUT"],
  "/api/admin/payments/approve": ["POST"],
  "/api/admin/payments/decline": ["POST"],
  "/api/admin/products": ["GET", "POST", "PUT"],
  "/api/admin/products/upload": ["POST"],
  "/api/admin/profile": ["GET", "PUT"],
  "/api/admin/profile/password": ["POST"],
  "/api/admin/profile/upload": ["POST"],
  "/api/admin/receipt-settings": ["GET"],
};

export function staffMayAccessAdminApi(pathname: string, method: string) {
  const normalizedPath = pathname.replace(/\/$/, "");
  const normalizedMethod = method.toUpperCase();
  const allowedMethods = staffAllowedMethods[normalizedPath];

  if (allowedMethods) return allowedMethods.includes(normalizedMethod);
  if (/^\/api\/admin\/variants\/[^/]+$/.test(normalizedPath)) {
    return normalizedMethod === "PUT";
  }

  // Unknown admin APIs and unlisted methods are ADMIN-only by default.
  return false;
}
