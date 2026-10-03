import type { Metadata } from "next";
import "./globals.css";

const themeInitScript = `
  (() => {
    try {
      const preference = localStorage.getItem("apc-theme");
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = preference === "dark" || (preference !== "light" && preference !== "dark" && systemPrefersDark);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: "APC Inventory",
  description: "Inventory and sales management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
