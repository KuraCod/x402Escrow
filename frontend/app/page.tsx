"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Shield, Zap, Lock, DollarSign, Coins, TrendingUp, CheckCircle2 } from "lucide-react";
import { RotatingText } from "@/components/rotating-text";
import { BentoCard } from "@/components/bento-card";
import { useState } from "react";

export default function Home() {
  const [demoPrice, setDemoPrice] = useState("1.5");
  const [demoQuantity, setDemoQuantity] = useState("1000");
  const [demoFeeMethod, setDemoFeeMethod] = useState<"SOL" | "x402">("SOL");

  const calculatedFee = ((parseFloat(demoPrice) * parseFloat(demoQuantity)) / 100).toFixed(2);
  const totalValue = (parseFloat(demoPrice) * parseFloat(demoQuantity)).toFixed(2);

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="text-white/60">Secure</span> <RotatingText />
              <br />
              <span className="text-white/60">on Solana</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto">
              Escrow-protected token listings with flexible fee payment via x402 protocol
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link href="/market">
              <Button size="lg" className="gap-2 transition-transform hover:scale-105">
                Browse Market
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="gap-2 transition-transform hover:scale-105">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="X logo">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X(Twitter)
              </Button>
            </a>
          </div>

          <div className="pt-8 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div className="transition-transform hover:scale-105">
              <div className="text-3xl font-bold">1%</div>
              <div className="text-sm text-white/60">Listing Fee</div>
            </div>
            <div className="transition-transform hover:scale-105">
              <div className="text-3xl font-bold">100%</div>
              <div className="text-sm text-white/60">Secure</div>
            </div>
            <div className="transition-transform hover:scale-105">
              <div className="text-3xl font-bold">2</div>
              <div className="text-sm text-white/60">Payment Methods</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid Section */}
      <section className="container mx-auto px-4 py-24 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">Why Peer402</h2>
            <p className="text-xl text-white/60">
              Built for security, designed for simplicity
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
            {/* Large card - Escrow Protection - spans 2 columns and 2 rows */}
            <BentoCard className="md:col-span-2 md:row-span-2">
              <div className="h-full flex flex-col justify-between p-6">
                <div>
                  <Shield className="h-12 w-12 mb-6 transition-transform group-hover:scale-110" />
                  <CardTitle className="text-3xl mb-4">Escrow Protection</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    Your tokens are held in program-controlled vaults with PDA security.
                    Multi-signature protection ensures that your assets remain safe until
                    the trade is completed or cancelled.
                  </CardDescription>
                </div>
              </div>
            </BentoCard>

            {/* Atomic Swaps */}
            <BentoCard>
              <div className="p-6">
                <Zap className="h-10 w-10 mb-4 transition-transform group-hover:scale-110" />
                <CardTitle className="text-xl mb-2">Atomic Swaps</CardTitle>
                <CardDescription>
                  Instant, simultaneous exchange
                </CardDescription>
              </div>
            </BentoCard>

            {/* Partial Fills */}
            <BentoCard>
              <div className="p-6">
                <Lock className="h-10 w-10 mb-4 transition-transform group-hover:scale-110" />
                <CardTitle className="text-xl mb-2">Partial Fills</CardTitle>
                <CardDescription>
                  Flexible purchase amounts
                </CardDescription>
              </div>
            </BentoCard>

            {/* x402 Protocol - spans 2 columns */}
            <BentoCard className="md:col-span-2">
              <div className="p-6">
                <DollarSign className="h-10 w-10 mb-4 transition-transform group-hover:scale-110" />
                <CardTitle className="text-xl mb-2">x402 Protocol</CardTitle>
                <CardDescription>
                  Pay listing fees through x402 facilitators or traditional SOL
                </CardDescription>
              </div>
            </BentoCard>

            {/* Low Fees */}
            <BentoCard>
              <div className="p-6">
                <Coins className="h-10 w-10 mb-4 transition-transform group-hover:scale-110" />
                <CardTitle className="text-xl mb-2">Low Fees</CardTitle>
                <CardDescription>
                  Only 1% listing fee
                </CardDescription>
              </div>
            </BentoCard>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="container mx-auto px-4 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-4xl font-bold">Try It Out</h2>
            <p className="text-xl text-white/60">
              Calculate your listing fee and see a preview
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Calculator Card */}
            <Card className="hover:border-white/20 transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Fee Calculator</CardTitle>
                <CardDescription>
                  Adjust values to see your listing details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Price per Token (USDC)</label>
                    <input
                      type="number"
                      value={demoPrice}
                      onChange={(e) => setDemoPrice(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-lg focus:border-white/30 focus:outline-none transition-colors"
                      placeholder="1.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity</label>
                    <input
                      type="number"
                      value={demoQuantity}
                      onChange={(e) => setDemoQuantity(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-lg focus:border-white/30 focus:outline-none transition-colors"
                      placeholder="1000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Fee Payment Method</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDemoFeeMethod("SOL")}
                      className={`py-3 px-4 rounded-md border transition-all ${
                        demoFeeMethod === "SOL"
                          ? "bg-white text-black border-white scale-105"
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:scale-105"
                      }`}
                    >
                      Native SOL
                    </button>
                    <button
                      onClick={() => setDemoFeeMethod("x402")}
                      className={`py-3 px-4 rounded-md border transition-all ${
                        demoFeeMethod === "x402"
                          ? "bg-white text-black border-white scale-105"
                          : "bg-white/5 border-white/10 hover:bg-white/10 hover:scale-105"
                      }`}
                    >
                      x402 Protocol
                    </button>
                  </div>
                </div>

                <Link href="/market">
                  <Button className="w-full gap-2 transition-transform hover:scale-105" size="lg">
                    <TrendingUp className="h-4 w-4" />
                    Create Real Listing
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Preview Card */}
            <Card className="hover:border-white/20 transition-all">
              <CardHeader>
                <CardTitle className="text-2xl">Listing Preview</CardTitle>
                <CardDescription>
                  How your listing will appear
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 bg-white/5 rounded-lg border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60 text-sm">Token Pair</span>
                    <span className="font-semibold">TOKEN / USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60 text-sm">Price per Token</span>
                    <span className="font-semibold">${demoPrice} USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60 text-sm">Quantity</span>
                    <span className="font-semibold">{parseFloat(demoQuantity).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <span className="text-white/60">Total Value</span>
                    <span className="text-xl font-bold">${totalValue}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Listing Fee (1%)</span>
                    <span className="text-2xl font-bold text-white">${calculatedFee}</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <span className="text-white/60">Fee Method</span>
                    <span className={`px-3 py-1 rounded text-sm font-medium ${
                      demoFeeMethod === "x402" ? "bg-white text-black" : "bg-white/10"
                    }`}>
                      {demoFeeMethod}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-white/60" />
                    <span className="text-white/60">Escrow protected</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-white/60" />
                    <span className="text-white/60">Atomic swaps enabled</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-white/60" />
                    <span className="text-white/60">Cancel anytime</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-24 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl font-bold">How It Works</h2>
            <p className="text-xl text-white/60">
              Simple steps to secure trading
            </p>
          </div>

          <div className="space-y-8">
            {[
              {
                number: 1,
                title: "Create Listing",
                description: "Set your price, quantity, and fee payment method (SOL or x402). The contract calculates a 1% listing fee automatically."
              },
              {
                number: 2,
                title: "Deposit Tokens",
                description: "Transfer your tokens into the escrow vault. They're now secured by the program until sold or cancelled."
              },
              {
                number: 3,
                title: "Buyers Purchase",
                description: "When a buyer purchases, the contract performs an atomic swap: their payment for your tokens, instantly and securely."
              },
              {
                number: 4,
                title: "Cancel Anytime",
                description: "As the seller, you can cancel your listing and retrieve any remaining tokens from the vault at any time."
              }
            ].map((step) => (
              <div key={step.number} className="flex gap-6 group hover:translate-x-2 transition-transform">
                <div className="flex-shrink-0 w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-xl font-bold group-hover:bg-white group-hover:text-black transition-colors">
                  {step.number}
                </div>
                <div className="space-y-2 pt-2">
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-white/60">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold">
            Ready to Start Trading?
          </h2>
          <p className="text-xl text-white/60">
            Connect your wallet and explore available listings
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/market">
              <Button size="lg" className="gap-2 transition-transform hover:scale-105">
                Go to Market
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-white/60">
            <div>Built on Solana with x402 protocol</div>
            <div className="flex items-center gap-6">
              <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                x402.org
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
