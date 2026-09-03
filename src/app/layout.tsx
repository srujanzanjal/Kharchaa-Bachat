import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Nav } from "@/components/layout/nav";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Track discretionary food spending for two.",
};

export const viewport: Viewport = {
  themeColor: "#131211",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} h-full`}>
      <body className="flex min-h-[100dvh] flex-col font-sans bg-bg-primary text-text-primary antialiased">
        <Nav />
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </body>
    </html>
  );
}
