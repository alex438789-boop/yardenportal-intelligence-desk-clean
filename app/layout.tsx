import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "YardenPORTAL Intelligence Desk",
  description: "International issue radar and draft generator for YardenPORTAL.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
          <Sidebar />
          <main className="p-5 sm:p-8 lg:p-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
