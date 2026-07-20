import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Hermes",
  description: "Homelab observability + journaling on one causal timeline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Hermes", statusBarStyle: "black-translucent" as const },
};

export const viewport = {
  themeColor: "#0e1116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
