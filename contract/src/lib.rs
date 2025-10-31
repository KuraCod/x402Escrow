#![deny(clippy::all)]
#![deny(missing_docs)]
//! Escrow program enabling OTC token listings backed by program-owned vaults.

use borsh::{BorshDeserialize, BorshSerialize};
use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    declare_id,
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    system_program,
};
use spl_associated_token_account::get_associated_token_address;
use spl_token::state::{Account as TokenAccount, Mint};
use thiserror::Error;

declare_id!("8DbZKwhFKq1Zi7HGSKfs6AsqS5CLWNCPZkQFuMKsntVt");

entrypoint!(process_instruction);

/// Program entrypoint implementation.
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = EscrowInstruction::try_from_slice(instruction_data)
        .map_err(|_| EscrowError::InvalidInstructionData)?;

    match instruction {
        EscrowInstruction::InitializeListing {
            listing_id,
            price_per_token,
            quantity,
            allow_partial,
            fee_payment_method,
            x402_payload,
        } => initialize_listing(
            program_id,
            accounts,
            listing_id,
            price_per_token,
            quantity,
            allow_partial,
            fee_payment_method,
            x402_payload,
        ),
        EscrowInstruction::DepositTokens => deposit_tokens(program_id, accounts),
        EscrowInstruction::Purchase { quantity } => purchase_tokens(program_id, accounts, quantity),
        EscrowInstruction::CancelListing => cancel_listing(program_id, accounts),
    }
}

/// Instructions supported by the escrow program.
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum EscrowInstruction {
    /// Initialize a new listing. Expects the listing account to be already created.
    InitializeListing {
        /// External identifier supplied by the client (e.g. auto increment, timestamp).
        listing_id: u64,
        /// Price per base token in quote token units.
        price_per_token: u64,
        /// Total amount of base tokens available for sale.
        quantity: u64,
        /// Whether the listing can be partially filled.
        allow_partial: bool,
        /// Fee payment method (0 = NativeSol, 1 = X402).
        fee_payment_method: u8,
        /// x402 payment proof payload (base64-encoded, optional).
        x402_payload: Option<String>,
    },
    /// Move seller tokens into the escrow vault, activating the listing.
    DepositTokens,
    /// Allow a buyer to take `quantity` tokens from the listing.
    Purchase {
        /// Number of base tokens to purchase.
        quantity: u64,
    },
    /// Seller cancels the listing, retrieving any remaining tokens.
    CancelListing,
}

/// Fee payment method for listing creation.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, FromPrimitive, BorshSerialize, BorshDeserialize)]
pub enum FeePaymentMethod {
    /// Pay fee in native SOL (default, backward compatible).
    NativeSol = 0,
    /// Pay fee via x402 payment protocol.
    X402 = 1,
}

impl FeePaymentMethod {
    fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Possible execution states of a listing.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, FromPrimitive, BorshSerialize, BorshDeserialize)]
pub enum ListingStatus {
    /// Listing metadata has been initialized, tokens not yet deposited.
    AwaitingDeposit = 0,
    /// Listing is live and can be purchased.
    Active = 1,
    /// Listing has been completely filled.
    Completed = 2,
    /// Listing was cancelled by the seller.
    Cancelled = 3,
}

impl ListingStatus {
    fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Persistent listing state stored on-chain.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Listing {
    /// Seller wallet that initialized the listing.
    pub seller: Pubkey,
    /// Mint of the base asset being sold.
    pub base_mint: Pubkey,
    /// Mint of the quote asset expected from buyers.
    pub quote_mint: Pubkey,
    /// PDA responsible for authorising vault transfers.
    pub vault_authority: Pubkey,
    /// Price per base token in quote units.
    pub price_per_token: u64,
    /// Total base tokens available (initial quantity).
    pub quantity: u64,
    /// Total base tokens already purchased.
    pub filled: u64,
    /// Arbitrary identifier supplied by client.
    pub listing_id: u64,
    /// Listing configuration flags stored as bitset.
    pub flags: u8,
    /// PDA bump used for vault authority derivation.
    pub vault_bump: u8,
    /// Current status.
    pub status: u8,
    /// Number of decimals for the base mint, captured at initialization.
    pub base_decimals: u8,
    /// Fee payment method used for listing creation (NativeSol or X402).
    pub fee_payment_method: u8,
    /// Amount paid as listing fee (1% of trade value).
    pub fee_amount_paid: u64,
    /// SHA256 hash of x402 payment proof (if X402 method used).
    pub x402_payload_hash: [u8; 32],
}

impl Listing {
    /// Number of bytes required to store the listing.
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1 + 8 + 32;

    /// Whether partial fills are allowed.
    pub fn allow_partial(&self) -> bool {
        self.flags & 0b0000_0001 == 1
    }

    /// Convenience for remaining base tokens still available.
    pub fn remaining(&self) -> u64 {
        self.quantity.saturating_sub(self.filled)
    }

    /// Current status as enum.
    pub fn status(&self) -> ListingStatus {
        ListingStatus::from_u8(self.status).unwrap_or(ListingStatus::Cancelled)
    }

    /// Update status.
    pub fn set_status(&mut self, status: ListingStatus) {
        self.status = status.as_u8();
    }
}

/// Escrow program specific errors.
#[derive(Debug, Error)]
pub enum EscrowError {
    /// Supplied instruction data could not be parsed.
    #[error("Invalid instruction data")]
    InvalidInstructionData,
    /// Account data length was unexpected.
    #[error("Account length mismatch")]
    AccountLengthMismatch,
    /// Listing already initialised.
    #[error("Listing already initialised")]
    AlreadyInitialized,
    /// Caller does not match expected authority.
    #[error("Incorrect authority provided")]
    IncorrectAuthority,
    /// Listing not ready for this operation.
    #[error("Invalid listing status for action")]
    InvalidListingStatus,
    /// Math overflow or invalid quantity.
    #[error("Amount overflow or invalid quantity")]
    AmountOverflow,
    /// Provided accounts do not match expected mints.
    #[error("Token mint mismatch")]
    MintMismatch,
    /// Not enough tokens remain to satisfy the purchase.
    #[error("Insufficient remaining quantity")]
    InsufficientQuantity,
    /// Partial fills are disabled.
    #[error("Partial fills disabled")]
    PartialFillDisabled,
    /// x402 payment proof missing or invalid.
    #[error("x402 payment proof missing or invalid")]
    InvalidX402Proof,
    /// x402 payment amount mismatch.
    #[error("x402 payment amount mismatch")]
    X402AmountMismatch,
}

impl From<EscrowError> for ProgramError {
    fn from(value: EscrowError) -> Self {
        ProgramError::Custom(value as u32)
    }
}

fn deserialize_listing<'a>(
    program_id: &Pubkey,
    listing_info: &'a AccountInfo,
) -> Result<Listing, ProgramError> {
    if listing_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    if listing_info.data_len() < Listing::LEN {
        return Err(EscrowError::AccountLengthMismatch.into());
    }
    Listing::try_from_slice(&listing_info.data.borrow())
        .map_err(|_| EscrowError::InvalidInstructionData.into())
}

fn serialize_listing(listing_info: &AccountInfo, listing: &Listing) -> ProgramResult {
    if listing_info.data_len() < Listing::LEN {
        return Err(EscrowError::AccountLengthMismatch.into());
    }
    listing
        .serialize(&mut &mut listing_info.data.borrow_mut()[..])
        .map_err(|_| EscrowError::InvalidInstructionData.into())
}

fn assert_token_account_owner(account: &TokenAccount, owner: &Pubkey) -> ProgramResult {
    if &account.owner != owner {
        return Err(EscrowError::IncorrectAuthority.into());
    }
    Ok(())
}

fn assert_token_account_mint(account: &TokenAccount, mint: &Pubkey) -> ProgramResult {
    if &account.mint != mint {
        return Err(EscrowError::MintMismatch.into());
    }
    Ok(())
}

/// Verify x402 payment proof and return the hash for storage.
/// This is a stub implementation that accepts any non-empty payload.
/// TODO: Replace with oracle integration or on-chain proof verification.
fn verify_x402_payment(payload: &str, _expected_amount: u64) -> Result<[u8; 32], ProgramError> {
    if payload.is_empty() {
        return Err(EscrowError::InvalidX402Proof.into());
    }

    // Compute SHA256 hash of payload using Solana's native hash function
    use solana_program::keccak;
    let hash_result = keccak::hash(payload.as_bytes());
    
    Ok(hash_result.to_bytes())
}

fn initialize_listing(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    listing_id: u64,
    price_per_token: u64,
    quantity: u64,
    allow_partial: bool,
    fee_payment_method: u8,
    x402_payload: Option<String>,
) -> ProgramResult {
    if quantity == 0 || price_per_token == 0 {
        return Err(EscrowError::AmountOverflow.into());
    }

    let account_info_iter = &mut accounts.iter();
    let seller_info = next_account_info(account_info_iter)?;
    let listing_info = next_account_info(account_info_iter)?;
    let vault_authority_info = next_account_info(account_info_iter)?;
    let vault_token_account_info = next_account_info(account_info_iter)?;
    let base_mint_info = next_account_info(account_info_iter)?;
    let quote_mint_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;

    if !seller_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if listing_info.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    if listing_info.data.borrow().iter().any(|b| *b != 0) {
        return Err(EscrowError::AlreadyInitialized.into());
    }

    if system_program_info.key != &system_program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: [&[u8]; 3] = [b"vault", seller_info.key.as_ref(), listing_id_bytes.as_ref()];
    let (expected_vault_authority, bump) = Pubkey::find_program_address(&seeds, program_id);
    if vault_authority_info.key != &expected_vault_authority {
        return Err(EscrowError::IncorrectAuthority.into());
    }

    let expected_vault_ata =
        get_associated_token_address(vault_authority_info.key, base_mint_info.key);
    if vault_token_account_info.key != &expected_vault_ata {
        return Err(EscrowError::MintMismatch.into());
    }

    let base_mint = Mint::unpack(&base_mint_info.data.borrow())?;

    // Calculate 1% listing fee from total trade value
    let trade_value = u128::from(price_per_token)
        .checked_mul(u128::from(quantity))
        .ok_or(EscrowError::AmountOverflow)?;
    let fee_amount = trade_value
        .checked_div(100)
        .ok_or(EscrowError::AmountOverflow)?;
    let fee_amount_u64 = u64::try_from(fee_amount).map_err(|_| EscrowError::AmountOverflow)?;

    // Process fee payment based on method
    let x402_payload_hash = match fee_payment_method {
        1 => {
            // X402 payment method
            let payload = x402_payload.ok_or(EscrowError::InvalidX402Proof)?;
            verify_x402_payment(&payload, fee_amount_u64)?
        }
        0 => {
            // NativeSol payment method (default, backward compatible)
            // No SOL fee transfer implemented yet, maintain compatibility
            [0u8; 32]
        }
        _ => {
            // Invalid fee payment method
            return Err(EscrowError::InvalidInstructionData.into());
        }
    };

    let flags = if allow_partial { 1 } else { 0 };

    let listing = Listing {
        seller: *seller_info.key,
        base_mint: *base_mint_info.key,
        quote_mint: *quote_mint_info.key,
        vault_authority: *vault_authority_info.key,
        price_per_token,
        quantity,
        filled: 0,
        listing_id,
        flags,
        vault_bump: bump,
        status: ListingStatus::AwaitingDeposit.as_u8(),
        base_decimals: base_mint.decimals,
        fee_payment_method,
        fee_amount_paid: fee_amount_u64,
        x402_payload_hash,
    };

    serialize_listing(listing_info, &listing)
}

fn deposit_tokens(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let seller_info = next_account_info(account_info_iter)?;
    let listing_info = next_account_info(account_info_iter)?;
    let seller_token_account_info = next_account_info(account_info_iter)?;
    let vault_authority_info = next_account_info(account_info_iter)?;
    let vault_token_account_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    if !seller_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut listing = deserialize_listing(program_id, listing_info)?;

    if listing.status() != ListingStatus::AwaitingDeposit {
        return Err(EscrowError::InvalidListingStatus.into());
    }
    if seller_info.key != &listing.seller {
        return Err(EscrowError::IncorrectAuthority.into());
    }

    let seller_token_account = TokenAccount::unpack(&seller_token_account_info.data.borrow())?;
    assert_token_account_owner(&seller_token_account, seller_info.key)?;
    assert_token_account_mint(&seller_token_account, &listing.base_mint)?;

    let vault_token_account = TokenAccount::unpack(&vault_token_account_info.data.borrow())?;
    assert_token_account_owner(&vault_token_account, vault_authority_info.key)?;
    assert_token_account_mint(&vault_token_account, &listing.base_mint)?;

    if vault_authority_info.key != &listing.vault_authority {
        return Err(EscrowError::IncorrectAuthority.into());
    }

    let amount = listing.quantity;
    if seller_token_account.amount < amount {
        return Err(ProgramError::InsufficientFunds);
    }

    let ix = spl_token::instruction::transfer(
        token_program_info.key,
        seller_token_account_info.key,
        vault_token_account_info.key,
        seller_info.key,
        &[],
        amount,
    )?;

    invoke(
        &ix,
        &[
            seller_token_account_info.clone(),
            vault_token_account_info.clone(),
            seller_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    listing.set_status(ListingStatus::Active);
    serialize_listing(listing_info, &listing)
}

fn purchase_tokens(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    quantity: u64,
) -> ProgramResult {
    if quantity == 0 {
        return Err(EscrowError::AmountOverflow.into());
    }

    let account_info_iter = &mut accounts.iter();
    let buyer_info = next_account_info(account_info_iter)?;
    let listing_info = next_account_info(account_info_iter)?;
    let seller_quote_account_info = next_account_info(account_info_iter)?;
    let buyer_quote_account_info = next_account_info(account_info_iter)?;
    let buyer_base_account_info = next_account_info(account_info_iter)?;
    let vault_authority_info = next_account_info(account_info_iter)?;
    let vault_token_account_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    if !buyer_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut listing = deserialize_listing(program_id, listing_info)?;
    if listing.status() != ListingStatus::Active {
        return Err(EscrowError::InvalidListingStatus.into());
    }

    if vault_authority_info.key != &listing.vault_authority {
        return Err(EscrowError::IncorrectAuthority.into());
    }

    let remaining = listing.remaining();
    if quantity > remaining {
        return Err(EscrowError::InsufficientQuantity.into());
    }
    if quantity < remaining && !listing.allow_partial() {
        return Err(EscrowError::PartialFillDisabled.into());
    }

    let decimals_factor = 10u128
        .checked_pow(u32::from(listing.base_decimals))
        .ok_or(EscrowError::AmountOverflow)?;
    let quote_amount_u128 = u128::from(quantity)
        .checked_mul(u128::from(listing.price_per_token))
        .ok_or(EscrowError::AmountOverflow)?;
    let quote_amount_u128 = quote_amount_u128
        .checked_div(decimals_factor.max(1))
        .ok_or(EscrowError::AmountOverflow)?;
    if quote_amount_u128 == 0 {
        return Err(EscrowError::AmountOverflow.into());
    }
    let quote_amount = u64::try_from(quote_amount_u128).map_err(|_| EscrowError::AmountOverflow)?;

    // Validate token accounts
    let seller_quote_account = TokenAccount::unpack(&seller_quote_account_info.data.borrow())?;
    assert_token_account_owner(&seller_quote_account, &listing.seller)?;
    assert_token_account_mint(&seller_quote_account, &listing.quote_mint)?;

    let buyer_quote_account = TokenAccount::unpack(&buyer_quote_account_info.data.borrow())?;
    assert_token_account_owner(&buyer_quote_account, buyer_info.key)?;
    assert_token_account_mint(&buyer_quote_account, &listing.quote_mint)?;
    if buyer_quote_account.amount < quote_amount {
        return Err(ProgramError::InsufficientFunds);
    }

    let buyer_base_account = TokenAccount::unpack(&buyer_base_account_info.data.borrow())?;
    assert_token_account_owner(&buyer_base_account, buyer_info.key)?;
    assert_token_account_mint(&buyer_base_account, &listing.base_mint)?;

    let vault_token_account = TokenAccount::unpack(&vault_token_account_info.data.borrow())?;
    assert_token_account_owner(&vault_token_account, vault_authority_info.key)?;
    assert_token_account_mint(&vault_token_account, &listing.base_mint)?;
    if vault_token_account.amount < quantity {
        return Err(ProgramError::InsufficientFunds);
    }

    // Transfer quote tokens from buyer to seller
    let transfer_quote_ix = spl_token::instruction::transfer(
        token_program_info.key,
        buyer_quote_account_info.key,
        seller_quote_account_info.key,
        buyer_info.key,
        &[],
        quote_amount,
    )?;
    invoke(
        &transfer_quote_ix,
        &[
            buyer_quote_account_info.clone(),
            seller_quote_account_info.clone(),
            buyer_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Transfer base tokens from vault to buyer
    let transfer_base_ix = spl_token::instruction::transfer(
        token_program_info.key,
        vault_token_account_info.key,
        buyer_base_account_info.key,
        vault_authority_info.key,
        &[],
        quantity,
    )?;
    let listing_id_bytes = listing.listing_id.to_le_bytes();
    let bump_seed = [listing.vault_bump];
    let signer_seeds: &[&[u8]] = &[
        b"vault",
        listing.seller.as_ref(),
        listing_id_bytes.as_ref(),
        &bump_seed,
    ];

    invoke_signed(
        &transfer_base_ix,
        &[
            vault_token_account_info.clone(),
            buyer_base_account_info.clone(),
            vault_authority_info.clone(),
            token_program_info.clone(),
        ],
        &[signer_seeds],
    )?;

    listing.filled = listing
        .filled
        .checked_add(quantity)
        .ok_or(EscrowError::AmountOverflow)?;

    if listing.filled >= listing.quantity {
        listing.set_status(ListingStatus::Completed);
    }

    serialize_listing(listing_info, &listing)
}

fn cancel_listing(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let seller_info = next_account_info(account_info_iter)?;
    let listing_info = next_account_info(account_info_iter)?;
    let vault_authority_info = next_account_info(account_info_iter)?;
    let vault_token_account_info = next_account_info(account_info_iter)?;
    let seller_token_account_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    if !seller_info.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut listing = deserialize_listing(program_id, listing_info)?;

    if &listing.seller != seller_info.key {
        return Err(EscrowError::IncorrectAuthority.into());
    }

    match listing.status() {
        ListingStatus::AwaitingDeposit => {
            listing.set_status(ListingStatus::Cancelled);
            return serialize_listing(listing_info, &listing);
        }
        ListingStatus::Active => {}
        _ => return Err(EscrowError::InvalidListingStatus.into()),
    }

    let remaining = listing.remaining();
    if remaining > 0 {
        let vault_token_account = TokenAccount::unpack(&vault_token_account_info.data.borrow())?;
        assert_token_account_owner(&vault_token_account, vault_authority_info.key)?;
        assert_token_account_mint(&vault_token_account, &listing.base_mint)?;

        let seller_base_account = TokenAccount::unpack(&seller_token_account_info.data.borrow())?;
        assert_token_account_owner(&seller_base_account, seller_info.key)?;
        assert_token_account_mint(&seller_base_account, &listing.base_mint)?;

        let transfer_ix = spl_token::instruction::transfer(
            token_program_info.key,
            vault_token_account_info.key,
            seller_token_account_info.key,
            vault_authority_info.key,
            &[],
            remaining,
        )?;
        let listing_id_bytes = listing.listing_id.to_le_bytes();
        let bump_seed = [listing.vault_bump];
        let signer_seeds: &[&[u8]] = &[
            b"vault",
            listing.seller.as_ref(),
            listing_id_bytes.as_ref(),
            &bump_seed,
        ];

        invoke_signed(
            &transfer_ix,
            &[
                vault_token_account_info.clone(),
                seller_token_account_info.clone(),
                vault_authority_info.clone(),
                token_program_info.clone(),
            ],
            &[signer_seeds],
        )?;
    }

    listing.set_status(ListingStatus::Cancelled);
    serialize_listing(listing_info, &listing)
}
