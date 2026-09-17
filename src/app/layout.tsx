import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { CapacitorProvider } from "@/components/capacitor-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jùlaba - Votre assistant marché",
  description: "Application marchande vocale et hors-ligne pour les marchés ivoiriens. Gérez votre caisse, stock et dépenses à la voix.",
  keywords: ["Jùlaba", "marché", "Côte d'Ivoire", "caisse", "vocal", "marchand"],
  icons: {
    icon: "/icon-only.png",
    apple: "/icon-background.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-to-zoom stays available (up to 5x) instead of being disabled —
  // locking zoom out entirely fails WCAG 1.4.4 and hurts low-vision users.
  maximumScale: 5,
  userScalable: true,
  themeColor: "#C66A2C",
  // Lets safe-area-inset-* env() variables resolve to real values on
  // notched/rounded-corner devices (iPhone, and the Android equivalent)
  // instead of always reading 0 — needed once this runs as a native shell.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overflow-x-hidden`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CapacitorProvider />
          {children}
        </ThemeProvider>
        <Toaster />
        {/* Toaster du système de notifications in-app (Task 28) — sonner :
            position haute pour ne jamais couvrir les boutons d'action du
            bas d'écran ; les 5 écrans identificateur continuent d'utiliser
            l'ancien Toaster Radix ci-dessus (aucune régression). */}
        <SonnerToaster position="top-center" closeButton visibleToasts={2} />
      </body>
    </html>
  );
}