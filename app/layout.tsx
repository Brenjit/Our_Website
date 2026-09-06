import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "./premium-dashboard.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  applicationName: "Twogether",
  title: "Twogether — A shared rhythm for two",
  description: "Private routines, live focus status, shared progress, and a little friendly competition for two people building better days together.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Twogether",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/icons/icon-32.png",
  },
  openGraph: {
    title: "Twogether — A little better, together",
    description: "Private routines, live focus, shared progress, and friendly competition for two.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Twogether — A little better, together" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Twogether — A little better, together",
    description: "Routines · Focus · Progress",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f6f4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geist.variable}>{children}</body></html>;
}
