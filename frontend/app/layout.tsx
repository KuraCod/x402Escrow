import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import SolanaProvider from "@/components/solana-provider";
import WalletButton from "@/components/wallet-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Peer402 - Secure P2P Token Trading",
  description: "A Solana-based escrow platform integrating the x402 payment protocol for listing fees",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SolanaProvider>
          <nav className="border-b border-white/10">
            <div className="container mx-auto px-4 py-3 md:py-4">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 text-lg md:text-xl font-bold">
                  <Image src="/logo.png" alt="Peer402" width={28} height={28} className="md:w-8 md:h-8" />
                  <span className="hidden sm:inline">Peer402</span>
                </Link>
                <div className="flex items-center gap-4 md:gap-6">
                  <Link href="/" className="text-xs md:text-sm hover:text-white/60 transition-colors">
                    Home
                  </Link>
                  <Link href="/market" className="text-xs md:text-sm hover:text-white/60 transition-colors">
                    Market
                  </Link>
                  <WalletButton />
                </div>
              </div>
            </div>
          </nav>
          {children}
        </SolanaProvider>
      </body>
    </html>
  );
}
