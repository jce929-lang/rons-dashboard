import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ron's Dashboard",
  description: "Ron's business dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
