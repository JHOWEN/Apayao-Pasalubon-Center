export function isSidebarLinkActive(pathname: string, href: string): boolean {
  if (href === "/inventory") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
