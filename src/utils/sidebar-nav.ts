export function isSidebarLinkActive(pathname: string, href: string): boolean {
  const normalizedPathname = normalizeSidebarPathname(pathname);

  if (href === "/inventory") {
    return normalizedPathname === href;
  }

  return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}

export function normalizeSidebarPathname(pathname: string): string {
  // Admin routes can be prefixed by the configured non-guessable route key.
  return pathname.replace(/^\/[A-Za-z0-9_-]{32,}(?=\/|$)/, "") || "/";
}
