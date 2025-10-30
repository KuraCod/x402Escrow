# Escrow Program

This workspace contains the on-chain Solana program that secures OTC token listings by holding seller assets in a PDA-controlled vault and mediating swaps.

## Structure
- `Cargo.toml` – workspace definition (Solana 1.18.x, Rust 2024 edition)
- `src/` – program source base


## Prerequisites
- Solana CLI 1.18.x [solana docs](https://docs.solana.com/cli/install-solana-cli-tools)
- Rust stable toolchain


## Build
Build the SBF shared object that will be deployed on-chain:
```
cargo build-sbf
```
Artifacts land in `target/deploy/<file>.so` and `target/deploy/<file>-keypair.json`.

## Deploy
1. Configure your CLI to the target cluster (e.g. devnet):
   ```
   solana config set --url https://api.devnet.solana.com
   ```
2. Deploy the program:
   ```
   solana program deploy target/deploy/<file>.so
   ```
3. Record the resulting program id. Update the frontend environment (`VITE_ESCROW_PROGRAM_ID`) and any other services that reference it.

## Program interface
- **InitializeListing**
  - Accounts: seller, listing account (PDA owned), vault authority PDA, vault ATA, base mint, quote mint, system program
  - Writes listing metadata (`Listing` struct).
  - Parameters: listing_id, price_per_token, quantity, allow_partial, fee_payment_method, x402_payload
- **DepositTokens**
  - Moves seller base tokens into the vault ATA.
- **Purchase**
  - Transfers quote tokens from buyer to seller,
  - Transfers base tokens from vault to buyer using the PDA signer seeds,
  - Updates the filled amount and status.

## Fee Payment Methods

The escrow program supports two fee payment methods for listing creation:

### NativeSol (default)
- Traditional SOL-based fee payment
- Maintains full backward compatibility with existing integrations
- Fee payment method value: `0`
- No x402 payload required

### X402
- Pay listing fee through the x402 payment protocol (https://www.x402.org)
- Fee is calculated as 1% of total trade value (asking_price × quantity)
- Seller must initiate off-chain payment via x402 facilitator before listing creation
- x402 proof payload must be included in InitializeListing instruction
- Contract validates proof and stores hash on-chain for auditability
- Fee payment method value: `1`

**Usage:**
When creating a listing with x402 fee:
1. Calculate fee: `fee_amount = (price_per_token * quantity) / 100`
2. Initiate x402 payment session off-chain for `fee_amount`
3. Obtain payment proof from x402 facilitator
4. Include proof in `InitializeListing` instruction with `fee_payment_method = 1`
5. Contract will verify proof, calculate hash, and store in listing account

**Important Notes:**
- x402 verification is currently implemented as a stub that accepts any non-empty payload
- Production deployments should replace the stub with proper oracle integration or on-chain proof verification
- Fee amount is calculated in atomic units of the quote token
- Empty or missing x402 payload will cause transaction to fail when X402 method is selected
- All existing listings using NativeSol method remain fully compatible

-----------------------------------------------------

## Best Deployment Strategy
It is best to build and deploy in solana playground

check playground here: [solana playground](https://beta.solpg.io/)

Copy Code, Build program and Deploy
Use Test Account there or connect wallet

Obtain the program Id to be used in frontend.

