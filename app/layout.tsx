import type { Metadata, Viewport } from "next";
import { Playfair_Display, Azeret_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SqFt — Estimate Book",
  description: "Flooring contractor estimating and scheduling",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SqFt",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3d3228",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${azeretMono.variable} ${fraunces.variable} h-full antialiased`}
      style={
        {
          "--font-display": "var(--font-playfair), serif",
          "--font-mono": "var(--font-azeret), monospace",
          "--font-label": "var(--font-fraunces), serif",
        } as React.CSSProperties
      }
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
