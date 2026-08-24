import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "./premium-dashboard.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Twogether — A shared rhythm for two",
  description: "Private routines, live focus status, shared progress, and a little friendly competition for two people building better days together.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geist.variable}>{children}</body></html>;
}
