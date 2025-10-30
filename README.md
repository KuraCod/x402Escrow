# x402 Escrow Contract

A Solana-based escrow program that integrates the x402 payment protocol for listing fees. This contract enables over-the-counter token trading with flexible fee payment options, allowing sellers to pay listing fees either in native SOL or through x402.

## What is x402?

x402 is an open payment protocol based on HTTP 402 (Payment Required) that facilitates seamless micropayments and transaction fees. By integrating x402, this escrow contract allows users to pay their 1% listing fee through the x402 facilitator network instead of traditional SOL transfers. Learn more at https://www.x402.org

## Features

- Create token listings with escrow protection
- Two fee payment methods: Native SOL or x402 protocol
- Automatic 1% listing fee calculation based on trade value
- On-chain verification and hash storage of x402 payment proofs
- Full backward compatibility with existing SOL-based workflows
- Partial fill support for flexible trading
- Seller can cancel listings and retrieve tokens

## Architecture

The contract implements a standard escrow flow with enhanced fee payment options:

1. Seller creates a listing by calling `InitializeListing`
2. Contract calculates 1% fee from total trade value
3. If using x402: seller provides payment proof, contract verifies and stores hash
4. If using SOL: traditional fee path (currently stub for compatibility)
5. Seller deposits tokens into program-controlled vault
6. Buyers can purchase tokens, triggering atomic swap
7. Seller can cancel and withdraw unsold tokens at any time

## Fee Payment Methods

### Native SOL (Method 0)
Default method maintaining full backward compatibility. No additional payload required.

### x402 Protocol (Method 1)
Pay listing fee through x402 facilitator. Requires:
- Off-chain x402 payment session initialization
- Payment proof obtained from facilitator
- Proof included in `InitializeListing` instruction
- Contract verifies proof and stores hash on-chain

Fee calculation: `(price_per_token * quantity) / 100`

## Building

Prerequisites:
- Solana CLI 1.18.x
- Rust stable toolchain
- cargo-build-sbf (included with Solana CLI)

Build the program:
```bash
cd contract
cargo build-sbf
```

The compiled program will be in `target/deploy/escrow_program.so`

## Deployment

### Local Testing
```bash
# Start local validator
solana-test-validator

# Deploy program
solana program deploy target/deploy/escrow_program.so

# Note the program ID for client integration
```

### Devnet Deployment
```bash
# Configure CLI for devnet
solana config set --url https://api.devnet.solana.com

# Ensure your wallet has SOL
solana airdrop 2

# Deploy
solana program deploy target/deploy/escrow_program.so
```

### Mainnet Deployment
```bash
# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Deploy (ensure sufficient SOL for deployment)
solana program deploy target/deploy/escrow_program.so
```

## Testing

Run the test suite:
```bash
cd contract
cargo test
```

Tests include:
- Native SOL fee method verification
- x402 payment with valid proof
- x402 payment failure scenarios
- Fee calculation accuracy
- Full listing lifecycle

## Integration

### Creating a Listing with Native SOL

```rust
let instruction_data = EscrowInstruction::InitializeListing {
    listing_id: 12345,
    price_per_token: 1_000_000,  // in quote token units
    quantity: 100_000_000,        // in base token units
    allow_partial: true,
    fee_payment_method: 0,        // Native SOL
    x402_payload: None,
};
```

### Creating a Listing with x402

```rust
// 1. Calculate fee off-chain
let fee = (price_per_token * quantity) / 100;

// 2. Initialize x402 payment and get proof
let proof = x402_facilitator.create_payment(fee).await?;

// 3. Create listing with proof
let instruction_data = EscrowInstruction::InitializeListing {
    listing_id: 12345,
    price_per_token: 1_000_000,
    quantity: 100_000_000,
    allow_partial: true,
    fee_payment_method: 1,        // x402
    x402_payload: Some(proof),
};
```

## Program Instructions

### InitializeListing
Initialize a new token listing with fee payment.

Accounts:
- Seller (signer, writable)
- Listing account (writable)
- Vault authority PDA (read-only)
- Vault token account (read-only)
- Base mint (read-only)
- Quote mint (read-only)
- System program (read-only)

Parameters:
- `listing_id`: Unique identifier
- `price_per_token`: Price in quote token atomic units
- `quantity`: Amount of base tokens for sale
- `allow_partial`: Whether partial fills are allowed
- `fee_payment_method`: 0 for SOL, 1 for x402
- `x402_payload`: Payment proof (required if method is 1)

### DepositTokens
Transfer seller tokens into escrow vault, activating the listing.

### Purchase
Buy tokens from an active listing. Executes atomic swap between buyer and seller.

### CancelListing
Seller cancels listing and retrieves remaining tokens from vault.

## Account Structure

### Listing Account (206 bytes)
- seller: Pubkey (32 bytes)
- base_mint: Pubkey (32 bytes)
- quote_mint: Pubkey (32 bytes)
- vault_authority: Pubkey (32 bytes)
- price_per_token: u64 (8 bytes)
- quantity: u64 (8 bytes)
- filled: u64 (8 bytes)
- listing_id: u64 (8 bytes)
- flags: u8 (1 byte)
- vault_bump: u8 (1 byte)
- status: u8 (1 byte)
- base_decimals: u8 (1 byte)
- fee_payment_method: u8 (1 byte)
- fee_amount_paid: u64 (8 bytes)
- x402_payload_hash: [u8; 32] (32 bytes)

## Important Notes

### x402 Verification Stub
The current implementation includes a verification stub that accepts any non-empty x402 payload. For production use with real value, replace the `verify_x402_payment` function with:
- Oracle-based verification calling x402 facilitator API
- On-chain proof verification using cryptographic signatures
- Cross-program invocation to dedicated x402 verification program

### Security Considerations
- Always verify x402 payment completion before creating listings
- Monitor fee_amount_paid to ensure proper fee collection
- Use program upgrade authority carefully
- Test thoroughly on devnet before mainnet deployment

## Program ID

After deployment, update client applications with your program ID. The ID is returned by the deploy command and stored in `target/deploy/escrow_program-keypair.json`.

## License

MIT

## Contributing

Contributions welcome. Please test all changes thoroughly and maintain backward compatibility with existing listings.

