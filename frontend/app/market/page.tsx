"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";

interface Listing {
  id: string;
  seller: string;
  baseMint: string;
  quoteMint: string;
  pricePerToken: number;
  quantity: number;
  filled: number;
  allowPartial: boolean;
  feeMethod: "SOL" | "x402";
  status: "Active" | "Completed" | "Awaiting Deposit";
}

const mockListings: Listing[] = [
  {
    id: "1",
    seller: "8PxH...3kLm",
    baseMint: "USDC",
    quoteMint: "SOL",
    pricePerToken: 0.0062,
    quantity: 10000,
    filled: 2500,
    allowPartial: true,
    feeMethod: "x402",
    status: "Active",
  },
  {
    id: "2",
    seller: "9QyJ...4mNp",
    baseMint: "RAY",
    quoteMint: "USDC",
    pricePerToken: 2.45,
    quantity: 5000,
    filled: 0,
    allowPartial: false,
    feeMethod: "SOL",
    status: "Active",
  },
  {
    id: "3",
    seller: "7RxK...5nOq",
    baseMint: "SRM",
    quoteMint: "USDC",
    pricePerToken: 0.85,
    quantity: 15000,
    filled: 15000,
    allowPartial: true,
    feeMethod: "x402",
    status: "Completed",
  },
  {
    id: "4",
    seller: "6SwL...6pRs",
    baseMint: "MNGO",
    quoteMint: "SOL",
    pricePerToken: 0.00034,
    quantity: 50000,
    filled: 12000,
    allowPartial: true,
    feeMethod: "SOL",
    status: "Active",
  },
];

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("active");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredListings = mockListings.filter((listing) => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return listing.status === "Active";
    if (activeTab === "completed") return listing.status === "Completed";
    return true;
  });

  return (
    <main className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Market</h1>
            <p className="text-white/60">Browse and trade P2P token listings</p>
          </div>
          <Button className="gap-2" onClick={() => setShowCreateModal(!showCreateModal)}>
            <Plus className="h-4 w-4" />
            Create Listing
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Volume</CardDescription>
              <CardTitle className="text-2xl">$1.2M</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active Listings</CardDescription>
              <CardTitle className="text-2xl">
                {mockListings.filter((l) => l.status === "Active").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Trades</CardDescription>
              <CardTitle className="text-2xl">847</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>x402 Fees Paid</CardDescription>
              <CardTitle className="text-2xl">$12.4K</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-white/10">
          <button
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "all"
                ? "border-b-2 border-white"
                : "text-white/60 hover:text-white"
            }`}
            onClick={() => setActiveTab("all")}
          >
            All Listings
          </button>
          <button
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "border-b-2 border-white"
                : "text-white/60 hover:text-white"
            }`}
            onClick={() => setActiveTab("active")}
          >
            Active
          </button>
          <button
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "completed"
                ? "border-b-2 border-white"
                : "text-white/60 hover:text-white"
            }`}
            onClick={() => setActiveTab("completed")}
          >
            Completed
          </button>
        </div>

        {/* Listings Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {filteredListings.map((listing) => (
            <Card key={listing.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl mb-1">
                      {listing.baseMint} / {listing.quoteMint}
                    </CardTitle>
                    <CardDescription>Seller: {listing.seller}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        listing.status === "Active"
                          ? "bg-white/10 text-white"
                          : "bg-white/5 text-white/60"
                      }`}
                    >
                      {listing.status}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        listing.feeMethod === "x402"
                          ? "bg-white text-black font-medium"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      {listing.feeMethod}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Price</div>
                    <div className="text-lg font-semibold">
                      {listing.pricePerToken} {listing.quoteMint}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Available</div>
                    <div className="text-lg font-semibold">
                      {(listing.quantity - listing.filled).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Total Quantity</div>
                    <div className="text-sm">{listing.quantity.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Filled</div>
                    <div className="text-sm">{listing.filled.toLocaleString()}</div>
                  </div>
                </div>

                {/* Progress bar */}
                {listing.filled > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                      <span>Progress</span>
                      <span>{Math.round((listing.filled / listing.quantity) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${(listing.filled / listing.quantity) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4 text-xs text-white/60">
                  {listing.allowPartial && (
                    <span className="px-2 py-1 bg-white/5 rounded">Partial Fills</span>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full gap-2"
                  disabled={listing.status !== "Active"}
                  variant={listing.status === "Active" ? "default" : "outline"}
                >
                  {listing.status === "Active" ? "Buy Now" : listing.status}
                  {listing.status === "Active" && <ArrowRight className="h-4 w-4" />}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Create Listing Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl">
              <CardHeader>
                <CardTitle>Create New Listing</CardTitle>
                <CardDescription>
                  Set up your P2P token listing with escrow protection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-white/60 mb-2 block">Base Token</label>
                    <input
                      type="text"
                      placeholder="Token mint address"
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/60 mb-2 block">Quote Token</label>
                    <input
                      type="text"
                      placeholder="Token mint address"
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/60 mb-2 block">Price per Token</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/60 mb-2 block">Quantity</label>
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-white/60 mb-2 block">Fee Payment Method</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="fee" value="sol" defaultChecked />
                      <span className="text-sm">Native SOL</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="fee" value="x402" />
                      <span className="text-sm">x402 Protocol</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="partial" />
                  <label htmlFor="partial" className="text-sm">
                    Allow partial fills
                  </label>
                </div>

                <div className="p-4 bg-white/5 rounded-md border border-white/10">
                  <div className="text-sm text-white/60 mb-2">Listing Fee (1%)</div>
                  <div className="text-lg font-semibold">Calculated automatically</div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1">Create Listing</Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
