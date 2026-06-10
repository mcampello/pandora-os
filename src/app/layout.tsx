import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Sora } from "next/font/google";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7A1CB5",
};

export const metadata: Metadata = {
  title: "Pandora OS",
  description: "Sistema operacional da Pandora Tech",
  manifest: "/manifest.json",
  icons: {
    icon: "/pandora_ico.svg",
    apple: "/pandora_ico.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pandora OS",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`h-full ${chakraPetch.variable} ${sora.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
