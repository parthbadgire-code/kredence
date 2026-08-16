import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import SolanaProviders from "@/components/SolanaProviders";
import NavBar from "@/components/NavBar";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Kredence — Prove Content Originality on Solana",
  description: "Commit-Reveal scheme with Compressed NFTs to prove content originality on-chain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="antialiased">
        <SolanaProviders>
          <NavBar />
          {children}
        </SolanaProviders>
      </body>
    </html>
  );
}
