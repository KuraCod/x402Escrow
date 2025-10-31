"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Plus, RefreshCcw } from "lucide-react";
import {
  ESCROW_PROGRAM_ID,
  LISTING_ACCOUNT_SIZE,
  decodeListingAccount,
  formatPublicKey,
  type FeeMethodLabel,
  type ListingStatusLabel,
} from "@/lib/escrow";

if (typeof window !== "undefined") {
  const win = window as typeof window & { Buffer?: typeof Buffer };
  if (!win.Buffer) {
    win.Buffer = Buffer;
  }
}

const deriveAssociatedTokenAddress = (mint: PublicKey, owner: PublicKey): PublicKey => {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
};

interface ListingView {
  id: string;
  account: string;
  accountPubkey: PublicKey;
  seller: string;
  sellerPubkey: PublicKey;
  baseMint: string;
  baseMintPubkey: PublicKey;
  quoteMint: string;
  quoteMintPubkey: PublicKey;
  vaultAuthority: PublicKey;
  quantity: number;
  quantityRaw: bigint;
  filled: number;
  available: number;
  price: number;
  priceDisplay: string;
  quantityDisplay: string;
  filledDisplay: string;
  availableDisplay: string;
  feePaid: number;
  feeDisplay: string;
  status: ListingStatusLabel;
  feeMethod: FeeMethodLabel;
  allowPartial: boolean;
  progress: number;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

const volumeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const statsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const MAX_U64 = BigInt("18446744073709551615");
const textEncoder = new TextEncoder();

type FeeMethodInput = "SOL" | "x402";

interface CreateListingForm {
  listingId: string;
  baseMint: string;
  quoteMint: string;
  pricePerToken: string;
  quantity: string;
  allowPartial: boolean;
  feeMethod: FeeMethodInput;
  x402Payload: string;
}

const initialFormValues = (): CreateListingForm => ({
  listingId: Date.now().toString(),
  baseMint: "",
  quoteMint: "",
  pricePerToken: "",
  quantity: "",
  allowPartial: true,
  feeMethod: "SOL",
  x402Payload: "",
});

const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const encodeU64LE = (value: bigint): Uint8Array => {
  if (value < 0n || value > MAX_U64) {
    throw new Error("Value out of range for u64");
  }
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, value, true);
  return new Uint8Array(buffer);
};

const encodeU32LE = (value: number): Uint8Array => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("Value out of range for u32");
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value, true);
  return new Uint8Array(buffer);
};

const decimalToBigInt = (input: string, decimals: number): bigint => {
  const sanitized = input.trim();
  if (sanitized.length === 0) {
    throw new Error("Value is required");
  }
  if (!/^\d+(\.\d*)?$/.test(sanitized)) {
    throw new Error("Only numeric values allowed (use '.' for decimals)");
  }

  const [wholePart, fractionalPart = ""] = sanitized.split(".");
  const paddedFraction = fractionalPart.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${wholePart}${paddedFraction}`;
  const digits = combined.replace(/^0+/, "") || "0";
  return BigInt(digits);
};

const encodeInitializeListing = (
  params: {
    listingId: bigint;
    pricePerToken: bigint;
    quantity: bigint;
    allowPartial: boolean;
    feePaymentMethod: number;
    x402Payload?: string;
  }
): Uint8Array => {
  const variant = Uint8Array.of(0); // InitializeListing discriminant
  const listingIdBytes = encodeU64LE(params.listingId);
  const priceBytes = encodeU64LE(params.pricePerToken);
  const quantityBytes = encodeU64LE(params.quantity);
  const allowPartialByte = Uint8Array.of(params.allowPartial ? 1 : 0);
  const feeMethodByte = Uint8Array.of(params.feePaymentMethod);

  let optionBytes: Uint8Array;
  const payload = params.x402Payload?.trim();
  if (payload && payload.length > 0) {
    const payloadBytes = textEncoder.encode(payload);
    optionBytes = concatUint8Arrays([
      Uint8Array.of(1),
      encodeU32LE(payloadBytes.length),
      payloadBytes,
    ]);
  } else {
    optionBytes = Uint8Array.of(0);
  }

  return concatUint8Arrays([
    variant,
    listingIdBytes,
    priceBytes,
    quantityBytes,
    allowPartialByte,
    feeMethodByte,
    optionBytes,
  ]);
};

const encodeDepositTokens = (): Uint8Array => {
  return Uint8Array.of(1);
};

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("active");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listings, setListings] = useState<ListingView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [formValues, setFormValues] = useState<CreateListingForm>(initialFormValues);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [depositingListingId, setDepositingListingId] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<{ listingId: string; message: string } | null>(null);

  const openCreateModal = useCallback(() => {
    setFormValues(initialFormValues());
    setFormMessage(null);
    setLastSignature(null);
    setShowCreateModal(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setFormValues((prev) => ({
        ...prev,
        [name]: value,
      }));
    },
    []
  );

  const handleAllowPartialChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { checked } = event.target;
    setFormValues((prev) => ({
      ...prev,
      allowPartial: checked,
    }));
  }, []);

  const handleFeeMethodChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value as FeeMethodInput;
    setFormValues((prev) => ({
      ...prev,
      feeMethod: value,
    }));
  }, []);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accounts = await connection.getProgramAccounts(ESCROW_PROGRAM_ID, {
        filters: [{ dataSize: LISTING_ACCOUNT_SIZE }],
        commitment: "confirmed",
      });

      const parsed: ListingView[] = accounts
        .map(({ pubkey, account }) => decodeListingAccount(account.data, pubkey))
        .filter((value): value is NonNullable<typeof value> => value !== null)
        .map((listing) => {
          const baseDecimals = Math.max(0, listing.baseDecimals ?? 0);
          const divisor = Math.pow(10, baseDecimals) || 1;

          const price = Number(listing.pricePerToken) / divisor;
          const quantity = Number(listing.quantity) / divisor;
          const filled = Number(listing.filled) / divisor;
          const feePaid = Number(listing.feeAmountPaid) / divisor;
          const available = Math.max(quantity - filled, 0);
          const progress = quantity > 0 ? Math.min(filled / quantity, 1) : 0;

          return {
            id: listing.listingId.toString(),
            account: listing.pubkey.toBase58(),
            accountPubkey: listing.pubkey,
            seller: formatPublicKey(listing.seller),
            sellerPubkey: listing.seller,
            baseMint: formatPublicKey(listing.baseMint),
            baseMintPubkey: listing.baseMint,
            quoteMint: formatPublicKey(listing.quoteMint),
            quoteMintPubkey: listing.quoteMint,
            vaultAuthority: listing.vaultAuthority,
            price,
            quantity,
            quantityRaw: listing.quantity,
            filled,
            available,
            priceDisplay: numberFormatter.format(price),
            quantityDisplay: numberFormatter.format(quantity),
            filledDisplay: numberFormatter.format(filled),
            availableDisplay: numberFormatter.format(available),
            feePaid,
            feeDisplay: numberFormatter.format(feePaid),
            status: listing.status,
            feeMethod: listing.feePaymentMethod,
            allowPartial: listing.allowPartial,
            progress,
          };
        })
        .sort((a, b) => Number(b.id) - Number(a.id));

      setListings(parsed);
      setLastUpdated(new Date());
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Unable to fetch listings from devnet.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  const handleCreateListing = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!connected || !publicKey) {
        setFormMessage({ type: "error", text: "Connect a devnet wallet before creating a listing." });
        return;
      }

      try {
        setFormSubmitting(true);
        setFormMessage(null);
        setLastSignature(null);

        if (!/^\d+$/.test(formValues.listingId.trim())) {
          throw new Error("Listing ID must be a positive integer.");
        }

        const listingId = BigInt(formValues.listingId.trim());
        
        let baseMintKey: PublicKey;
        let quoteMintKey: PublicKey;
        try {
          baseMintKey = new PublicKey(formValues.baseMint.trim());
        } catch {
          throw new Error("Invalid base mint address. Check the format.");
        }
        try {
          quoteMintKey = new PublicKey(formValues.quoteMint.trim());
        } catch {
          throw new Error("Invalid quote mint address. Check the format.");
        }

        let baseMint;
        let quoteMint;
        try {
          baseMint = await getMint(connection, baseMintKey);
        } catch {
          throw new Error("Base mint not found on devnet. Verify the address exists.");
        }
        try {
          quoteMint = await getMint(connection, quoteMintKey);
        } catch {
          throw new Error("Quote mint not found on devnet. Verify the address exists.");
        }

        const quantity = decimalToBigInt(formValues.quantity, baseMint.decimals);
        const pricePerToken = decimalToBigInt(formValues.pricePerToken, quoteMint.decimals);

        if (quantity <= 0n) {
          throw new Error("Quantity must be greater than zero.");
        }
        if (pricePerToken <= 0n) {
          throw new Error("Price per token must be greater than zero.");
        }

        const feeMethod = formValues.feeMethod === "SOL" ? 0 : 1;
        const x402Payload =
          feeMethod === 1 ? formValues.x402Payload.trim() || undefined : undefined;

        if (feeMethod === 1 && !x402Payload) {
          throw new Error("x402 fee method requires a payment proof payload.");
        }

        const rentLamports = await connection.getMinimumBalanceForRentExemption(
          LISTING_ACCOUNT_SIZE
        );
        const listingAccount = Keypair.generate();
        const listingIdSeed = encodeU64LE(listingId);

        const [vaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), publicKey.toBuffer(), Buffer.from(listingIdSeed)],
          ESCROW_PROGRAM_ID
        );

        const vaultTokenAccount = deriveAssociatedTokenAddress(baseMintKey, vaultAuthority);

        const instructionData = encodeInitializeListing({
          listingId,
          pricePerToken,
          quantity,
          allowPartial: formValues.allowPartial,
          feePaymentMethod: feeMethod,
          x402Payload,
        });

        const createListingAccountIx = SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: listingAccount.publicKey,
          lamports: rentLamports,
          space: LISTING_ACCOUNT_SIZE,
          programId: ESCROW_PROGRAM_ID,
        });

        const initializeIx = new TransactionInstruction({
          programId: ESCROW_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: listingAccount.publicKey, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: false },
            { pubkey: baseMintKey, isSigner: false, isWritable: false },
            { pubkey: quoteMintKey, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(instructionData),
        });

        const transaction = new Transaction().add(createListingAccountIx, initializeIx);
        transaction.feePayer = publicKey;
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;

        const signature = await sendTransaction(transaction, connection, {
          signers: [listingAccount],
        });

        await connection.confirmTransaction(
          {
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            signature,
          },
          "confirmed"
        );

        setLastSignature(signature);
        setFormMessage({
          type: "success",
          text: "Listing initialized. Deposit your base tokens to activate it.",
        });
        setFormValues((prev) => ({
          ...initialFormValues(),
          feeMethod: prev.feeMethod,
        }));

        await loadListings();
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "Failed to create listing.";
        setFormMessage({ type: "error", text: message });
      } finally {
        setFormSubmitting(false);
      }
    },
    [
      connected,
      publicKey,
      formValues,
      connection,
      sendTransaction,
      loadListings,
    ]
  );

  const handleDepositTokens = useCallback(
    async (listing: ListingView) => {
      if (!connected || !publicKey) {
        return;
      }

      if (publicKey.toBase58() !== listing.sellerPubkey.toBase58()) {
        setDepositError({ listingId: listing.id, message: "Only the seller can deposit tokens for this listing." });
        return;
      }

      try {
        setDepositingListingId(listing.id);
        setDepositError(null);

        const sellerTokenAddress = getAssociatedTokenAddressSync(
          listing.baseMintPubkey,
          publicKey
        );

        const vaultTokenAddress = getAssociatedTokenAddressSync(
          listing.baseMintPubkey,
          listing.vaultAuthority
        );

        let sellerTokenAccount;
        try {
          sellerTokenAccount = await getAccount(connection, sellerTokenAddress);
        } catch {
          throw new Error("Seller token account not found. Make sure you hold the base tokens.");
        }

        const baseMint = await getMint(connection, listing.baseMintPubkey);
        const requiredAmount = listing.quantityRaw;
        const humanReadableQuantity = listing.quantity;
        const sellerBalanceRaw = BigInt(sellerTokenAccount.amount.toString());
        const sellerBalance = Number(sellerTokenAccount.amount) / (10 ** baseMint.decimals);
        
        if (sellerBalanceRaw < requiredAmount) {
          throw new Error(`Insufficient tokens. You have ${sellerBalance.toFixed(baseMint.decimals)} but need ${humanReadableQuantity} base tokens.`);
        }

        let vaultAccountInfo;
        try {
          vaultAccountInfo = await connection.getAccountInfo(vaultTokenAddress);
        } catch {
          vaultAccountInfo = null;
        }

        const instructions: TransactionInstruction[] = [];

        if (!vaultAccountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              publicKey,
              vaultTokenAddress,
              listing.vaultAuthority,
              listing.baseMintPubkey
            )
          );
        }

        const depositIx = new TransactionInstruction({
          programId: ESCROW_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: listing.accountPubkey, isSigner: false, isWritable: true },
            { pubkey: sellerTokenAddress, isSigner: false, isWritable: true },
            { pubkey: listing.vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: vaultTokenAddress, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(encodeDepositTokens()),
        });

        instructions.push(depositIx);

        const transaction = new Transaction().add(...instructions);
        transaction.feePayer = publicKey;
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;

        let signature: string;
        try {
          signature = await sendTransaction(transaction, connection);
        } catch (sendError) {
          const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
          if (errorMsg.includes("User rejected") || errorMsg.includes("user rejected")) {
            throw new Error("Transaction cancelled by user.");
          }
          throw new Error(`Failed to send transaction: ${errorMsg}`);
        }

        let confirmation;
        try {
          confirmation = await connection.confirmTransaction(
            {
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
              signature,
            },
            "confirmed"
          );
        } catch (confirmError) {
          throw new Error(`Failed to confirm transaction: ${confirmError instanceof Error ? confirmError.message : String(confirmError)}`);
        }

        if (confirmation.value.err) {
          const errorObj = confirmation.value.err;
          let errorMsg = "Transaction failed on-chain.";
          
          if (typeof errorObj === "object") {
            if ("InstructionError" in errorObj) {
              const instructionError = errorObj.InstructionError as [number, any];
              if (Array.isArray(instructionError) && instructionError[1]) {
                const errorCode = instructionError[1];
                if (typeof errorCode === "object") {
                  if ("Custom" in errorCode) {
                    errorMsg = `Program error: ${errorCode.Custom}`;
                  } else if ("Err" in errorCode) {
                    errorMsg = `Program error: ${JSON.stringify(errorCode.Err)}`;
                  } else {
                    errorMsg = `Transaction failed: ${JSON.stringify(errorObj)}`;
                  }
                }
              }
            } else {
              errorMsg = `Transaction failed: ${JSON.stringify(errorObj)}`;
            }
          } else {
            errorMsg = `Transaction failed: ${String(errorObj)}`;
          }
          
          throw new Error(errorMsg);
        }

        await loadListings();
        setDepositError(null);
      } catch (depositError) {
        let message = "Failed to deposit tokens.";
        
        if (depositError instanceof Error) {
          message = depositError.message;
          
          if (message.includes("user rejected")) {
            message = "Transaction cancelled by user.";
          } else if (message.includes("InsufficientFunds") || message.includes("insufficient funds")) {
            message = "Insufficient funds. Make sure you have enough base tokens and SOL for fees.";
          } else if (message.includes("AccountNotFound") || message.includes("account not found")) {
            message = "Token account not found. Make sure you hold the base tokens.";
          } else if (message.includes("IncorrectAuthority") || message.includes("incorrect authority")) {
            message = "Authority mismatch. Make sure you're the seller for this listing.";
          } else if (message.includes("InvalidListingStatus") || message.includes("invalid listing status")) {
            message = "Invalid listing status. Listing may have already been activated or cancelled.";
          }
        }
        
        setDepositError({ listingId: listing.id, message });
      } finally {
        setDepositingListingId(null);
      }
    },
    [connected, publicKey, connection, sendTransaction, loadListings]
  );

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const filteredListings = useMemo(() => {
    if (activeTab === "all") return listings;
    if (activeTab === "active") return listings.filter((listing) => listing.status === "Active");
    if (activeTab === "completed") {
      return listings.filter((listing) => listing.status === "Completed");
    }
    return listings;
  }, [activeTab, listings]);

  const stats = useMemo(() => {
    const active = listings.filter((listing) => listing.status === "Active");
    const awaiting = listings.filter((listing) => listing.status === "Awaiting Deposit");
    const completed = listings.filter((listing) => listing.status === "Completed");

    const totalVolume = listings.reduce((acc, listing) => acc + listing.price * listing.quantity, 0);
    const totalX402Fees = listings
      .filter((listing) => listing.feeMethod === "x402")
      .reduce((acc, listing) => acc + listing.feePaid, 0);

    return {
      totalVolume,
      activeCount: active.length,
      awaitingCount: awaiting.length,
      completedCount: completed.length,
      x402Fees: totalX402Fees,
      totalCount: listings.length,
    };
  }, [listings]);

  return (
    <main className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Market</h1>
            <p className="text-white/60">
              Live listings sourced from devnet using program{" "}
              <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded">
                {ESCROW_PROGRAM_ID.toBase58()}
              </span>
            </p>
            {lastUpdated && (
              <p className="text-xs text-white/40 mt-1">
                Last updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void loadListings()}
              disabled={loading}
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {/* Create Listing button hidden - web version coming soon */}
            {/* <Button className="gap-2" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Create Listing
            </Button> */}
          </div>
        </div>

        <Card className="mb-8 border-yellow-500/40 bg-yellow-500/10">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-200 flex items-center gap-2">
              <span>⚠️</span>
              Important Notice
            </CardTitle>
            <CardContent className="text-yellow-100/80 space-y-2 pt-0">
              <p>
                This market page is a <strong>read-only display</strong> of listings on devnet. The web interface for creating listings is <strong>coming soon</strong>.
              </p>
              <p>
                To create a listing now, you'll need to <strong>fork the repository</strong> and interact with the smart contract directly. Check out the repository at{" "}
                <a 
                  href="https://github.com/KuraCod/x402Escrow" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow-100 transition-colors"
                >
                  github.com/KuraCod/x402Escrow
                </a>
              </p>
            </CardContent>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Estimated Total Volume</CardDescription>
              <CardTitle className="text-2xl">
                {stats.totalVolume > 0 ? `≈ ${volumeFormatter.format(stats.totalVolume)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active Listings</CardDescription>
              <CardTitle className="text-2xl">{statsFormatter.format(stats.activeCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Awaiting Deposit</CardDescription>
              <CardTitle className="text-2xl">{statsFormatter.format(stats.awaitingCount)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>x402 Fees Paid (est)</CardDescription>
              <CardTitle className="text-2xl">
                {stats.x402Fees > 0 ? `≈ ${volumeFormatter.format(stats.x402Fees)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="flex items-center gap-4 mb-6 border-b border-white/10">
          <button
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "all" ? "border-b-2 border-white" : "text-white/60 hover:text-white"
            }`}
            onClick={() => setActiveTab("all")}
          >
            All Listings ({statsFormatter.format(stats.totalCount)})
          </button>
          <button
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "active" ? "border-b-2 border-white" : "text-white/60 hover:text-white"
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

        {error && (
          <Card className="mb-6 border-red-500/40 bg-red-500/10">
            <CardHeader>
              <CardTitle className="text-lg text-red-200">Unable to load listings</CardTitle>
              <CardDescription className="text-sm text-red-100/80">{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && filteredListings.length === 0 && (
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-lg">No listings found</CardTitle>
              <CardDescription>
                Deploy new listings on devnet or switch to &ldquo;All Listings&rdquo; to see every
                status.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {filteredListings.map((listing) => (
            <Card key={listing.account}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl mb-1">
                      {listing.baseMint} / {listing.quoteMint}
                    </CardTitle>
                    <CardDescription>
                      Seller: <span className="font-mono">{listing.seller}</span>
                    </CardDescription>
                    <CardDescription className="mt-1">
                      Account: <span className="font-mono text-xs">{listing.account}</span>
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        listing.status === "Active"
                          ? "bg-white/10 text-white"
                          : listing.status === "Completed"
                          ? "bg-emerald-500/10 text-emerald-200"
                          : "bg-white/5 text-white/60"
                      }`}
                    >
                      {listing.status}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        listing.feeMethod === "x402"
                          ? "bg-white text-black font-medium"
                          : "bg-white/10 text-white/70"
                      }`}
                    >
                      {listing.feeMethod}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Price / Token</div>
                    <div className="text-lg font-semibold">{listing.priceDisplay}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Available</div>
                    <div className="text-lg font-semibold">{listing.availableDisplay}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Total Quantity</div>
                    <div className="text-sm text-white">{listing.quantityDisplay}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/60 mb-1">Filled</div>
                    <div className="text-sm text-white/80">{listing.filledDisplay}</div>
                  </div>
                </div>

                {listing.progress > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                      <span>Progress</span>
                      <span>{Math.round(listing.progress * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${Math.round(listing.progress * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-white/50">Not yet filled</div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                  <span className="px-2 py-1 bg-white/5 rounded">
                    Fee Paid: {listing.feeDisplay} ({listing.feeMethod})
                  </span>
                  {listing.allowPartial && (
                    <span className="px-2 py-1 bg-white/5 rounded">Partial fills enabled</span>
                  )}
                </div>

                {depositError && depositError.listingId === listing.id && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    <p>{depositError.message}</p>
                  </div>
                )}

                {listing.status === "Awaiting Deposit" && (
                  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                    <p className="font-medium mb-1">⚠️ Deposit Feature Coming Soon</p>
                    <p className="text-yellow-200/80">
                      Token deposit functionality will be available in the next version. Please check back soon!
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                {listing.status === "Awaiting Deposit" ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => void handleDepositTokens(listing)}
                    disabled={true}
                    variant="outline"
                  >
                    Deposit Tokens (Coming Soon)
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2"
                    disabled={listing.status !== "Active"}
                    variant={listing.status === "Active" ? "default" : "outline"}
                  >
                    {listing.status === "Active" ? "Buy Now" : listing.status}
                    {listing.status === "Active" && <ArrowRight className="h-4 w-4" />}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-3xl bg-black border-white/15 shadow-2xl">
              <CardHeader>
                <CardTitle>Create New Listing</CardTitle>
                <CardDescription>
                  Initialize a listing on devnet. After creation, deposit the base tokens into the
                  escrow vault to activate it.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateListing}>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Listing ID (u64)
                      </label>
                      <input
                        name="listingId"
                        value={formValues.listingId}
                        onChange={handleInputChange}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Quantity (human-readable)
                      </label>
                      <input
                        name="quantity"
                        value={formValues.quantity}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g. 100.5"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Base Mint Address
                      </label>
                      <input
                        name="baseMint"
                        value={formValues.baseMint}
                        onChange={handleInputChange}
                        required
                        placeholder="Public key of base token mint"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Quote Mint Address
                      </label>
                      <input
                        name="quoteMint"
                        value={formValues.quoteMint}
                        onChange={handleInputChange}
                        required
                        placeholder="Public key of quote token mint"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Price per Token (quote)
                      </label>
                      <input
                        name="pricePerToken"
                        value={formValues.pricePerToken}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g. 2.5"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        Fee Payment Method
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="feeMethod"
                            value="SOL"
                            checked={formValues.feeMethod === "SOL"}
                            onChange={handleFeeMethodChange}
                          />
                          Native SOL
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="feeMethod"
                            value="x402"
                            checked={formValues.feeMethod === "x402"}
                            onChange={handleFeeMethodChange}
                          />
                          x402 Protocol
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="allowPartial"
                          checked={formValues.allowPartial}
                          onChange={handleAllowPartialChange}
                        />
                        Allow partial fills
                      </label>
                      <p className="text-xs text-white/50 mt-1">
                        When enabled, buyers can purchase less than the full quantity.
                      </p>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-white/60 mb-2 block">
                        x402 Payment Proof (only when using x402)
                      </label>
                      <textarea
                        name="x402Payload"
                        value={formValues.x402Payload}
                        onChange={handleInputChange}
                        placeholder="Paste x402 facilitator payload"
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-white/30 focus:outline-none min-h-[80px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                    <p>
                      The listing account and vault PDA will be derived automatically. Make sure you
                      hold enough base tokens in your wallet to deposit in the next step.
                    </p>
                  </div>

                  {formMessage && (
                    <div
                      className={`rounded-md border px-3 py-2 text-sm ${
                        formMessage.type === "success"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                          : "border-red-500/40 bg-red-500/10 text-red-100"
                      }`}
                    >
                      <p>{formMessage.text}</p>
                      {lastSignature && formMessage.type === "success" && (
                        <a
                          href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-2 text-xs underline decoration-dotted"
                        >
                          View transaction {lastSignature.slice(0, 8)}…{lastSignature.slice(-6)}
                        </a>
                      )}
                    </div>
                  )}

                  {!connected && (
                    <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                      Connect a wallet to submit transactions.
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col md:flex-row gap-3 md:gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={closeCreateModal}
                    disabled={formSubmitting}
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={formSubmitting || !connected}
                  >
                    {formSubmitting ? "Submitting..." : "Create Listing"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        )}

        {loading && (
          <div className="fixed bottom-6 right-6 text-xs text-white/60 bg-white/5 px-3 py-2 rounded-md border border-white/10 shadow-lg">
            Fetching devnet listings…
          </div>
        )}
      </div>
    </main>
  );
}
