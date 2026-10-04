import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Archivo with its width axis: body copy runs at 100%, display type at ~118%
// (see `type-display` / `type-title` in globals.css). Same pairing as the
// marketing site in www/.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SqFt", template: "%s | SqFt" },
  description: "Flooring contractor estimating, invoicing and scheduling",
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SqFt",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The theme script below sets data-theme before hydration.
      suppressHydrationWarning
      className={`h-full antialiased ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      {/* Inline script prevents a flash of the wrong theme. No stored choice
          means "follow the OS", which the CSS handles on its own. */}
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: intentional inline script for no-flash theme
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full overflow-x-hidden">{children}</body>
    </html>
  );
}
