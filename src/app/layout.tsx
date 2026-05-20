import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Pandora OS",
  description: "Sistema operacional da Pandora Tech",
  icons: { icon: "/pandora_ico.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`h-full ${chakraPetch.variable} ${sora.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
