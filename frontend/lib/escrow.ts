import { PublicKey } from "@solana/web3.js";

export const ESCROW_PROGRAM_ID = new PublicKey("8DbZKwhFKq1Zi7HGSKfs6AsqS5CLWNCPZkQFuMKsntVt");
export const LISTING_ACCOUNT_SIZE = 205;

export type ListingStatusLabel = "Awaiting Deposit" | "Active" | "Completed" | "Cancelled" | "Unknown";
export type FeeMethodLabel = "SOL" | "x402" | "Unknown";

export interface ListingAccount {
  pubkey: PublicKey;
  seller: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  vaultAuthority: PublicKey;
  pricePerToken: bigint;
  quantity: bigint;
  filled: bigint;
  listingId: bigint;
  allowPartial: boolean;
  vaultBump: number;
  status: ListingStatusLabel;
  baseDecimals: number;
  feePaymentMethod: FeeMethodLabel;
  feeAmountPaid: bigint;
  x402PayloadHash: string;
}

const statusFromByte = (value: number): ListingStatusLabel => {
  switch (value) {
    case 0:
      return "Awaiting Deposit";
    case 1:
      return "Active";
    case 2:
      return "Completed";
    case 3:
      return "Cancelled";
    default:
      return "Unknown";
  }
};

const feeMethodFromByte = (value: number): FeeMethodLabel => {
  switch (value) {
    case 0:
      return "SOL";
    case 1:
      return "x402";
    default:
      return "Unknown";
  }
};

const readBigUInt64LE = (view: DataView, offset: number): bigint => {
  return view.getBigUint64(offset, true);
};

export const decodeListingAccount = (data: Uint8Array, pubkey: PublicKey): ListingAccount | null => {
  if (data.length < LISTING_ACCOUNT_SIZE) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const seller = new PublicKey(data.subarray(0, 32));
  const baseMint = new PublicKey(data.subarray(32, 64));
  const quoteMint = new PublicKey(data.subarray(64, 96));
  const vaultAuthority = new PublicKey(data.subarray(96, 128));

  const pricePerToken = readBigUInt64LE(view, 128);
  const quantity = readBigUInt64LE(view, 136);
  const filled = readBigUInt64LE(view, 144);
  const listingId = readBigUInt64LE(view, 152);

  const flags = data[160];
  const vaultBump = data[161];
  const statusByte = data[162];
  const baseDecimals = data[163];
  const feeMethodByte = data[164];
  const feeAmountPaid = readBigUInt64LE(view, 165);
  const hashBytes = Array.from(data.subarray(173, 205));
  const x402PayloadHash = hashBytes.map((value) => value.toString(16).padStart(2, "0")).join("");

  return {
    pubkey,
    seller,
    baseMint,
    quoteMint,
    vaultAuthority,
    pricePerToken,
    quantity,
    filled,
    listingId,
    allowPartial: (flags & 0b0000_0001) === 1,
    vaultBump,
    status: statusFromByte(statusByte),
    baseDecimals,
    feePaymentMethod: feeMethodFromByte(feeMethodByte),
    feeAmountPaid,
    x402PayloadHash,
  };
};

export const formatPublicKey = (key: PublicKey, start = 4, end = 4) => {
  const base58 = key.toBase58();
  if (base58.length <= start + end) {
    return base58;
  }
  return `${base58.slice(0, start)}…${base58.slice(-end)}`;
};
