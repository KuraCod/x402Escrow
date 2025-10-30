//! Tests for x402 fee payment integration in the escrow program.

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};
use solana_program_test::{processor, ProgramTest};
use solana_sdk::{
    account::Account,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

// Re-export the program module
use escrow_program::{EscrowInstruction, Listing, ListingStatus};

/// Helper function to create a program test environment
fn program_test() -> ProgramTest {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "escrow_program",
        program_id,
        processor!(escrow_program::process_instruction),
    );
    program_test
}

/// Test initializing a listing with NativeSol fee payment (backward compatibility)
#[tokio::test]
async fn test_initialize_listing_native_sol_fee() {
    let program_test = program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let seller = Keypair::new();
    let listing = Keypair::new();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    
    let listing_id = 12345u64;
    let price_per_token = 1_000_000u64; // 1 USDC per token
    let quantity = 100_000_000u64; // 100 tokens
    let allow_partial = true;
    let fee_payment_method = 0u8; // NativeSol
    let x402_payload: Option<String> = None;

    // Create the instruction data
    let instruction_data = EscrowInstruction::InitializeListing {
        listing_id,
        price_per_token,
        quantity,
        allow_partial,
        fee_payment_method,
        x402_payload,
    };

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", seller.pubkey().as_ref(), &listing_id_bytes];
    let (vault_authority, _bump) = Pubkey::find_program_address(seeds, &program_test.program_id);
    
    let vault_token_account = Pubkey::new_unique();

    let accounts = vec![
        AccountMeta::new(seller.pubkey(), true),
        AccountMeta::new(listing.pubkey(), false),
        AccountMeta::new_readonly(vault_authority, false),
        AccountMeta::new_readonly(vault_token_account, false),
        AccountMeta::new_readonly(base_mint, false),
        AccountMeta::new_readonly(quote_mint, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let instruction = Instruction {
        program_id: program_test.program_id,
        accounts,
        data: instruction_data.try_to_vec().unwrap(),
    };

    // Fund seller account
    let seller_account = Account {
        lamports: 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&seller.pubkey(), &seller_account)
        .await
        .unwrap();

    // Create listing account with required space
    let listing_account = Account {
        lamports: 1_000_000,
        data: vec![0; Listing::LEN],
        owner: program_test.program_id,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&listing.pubkey(), &listing_account)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &seller],
        recent_blockhash,
    );

    // Process transaction
    let result = banks_client.process_transaction(transaction).await;
    
    // Verify the transaction succeeded
    assert!(result.is_ok(), "Transaction should succeed with NativeSol fee");

    // Fetch and verify the listing account
    let listing_account = banks_client
        .get_account(listing.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let listing_data = Listing::try_from_slice(&listing_account.data).unwrap();
    
    assert_eq!(listing_data.seller, seller.pubkey());
    assert_eq!(listing_data.status(), ListingStatus::AwaitingDeposit);
    assert_eq!(listing_data.fee_payment_method, 0); // NativeSol
    
    // Fee should be 1% of trade value
    let expected_fee = (price_per_token as u128 * quantity as u128 / 100) as u64;
    assert_eq!(listing_data.fee_amount_paid, expected_fee);
    assert_eq!(listing_data.x402_payload_hash, [0u8; 32]); // Empty for NativeSol
}

/// Test initializing a listing with X402 fee payment and valid payload
#[tokio::test]
async fn test_initialize_listing_x402_fee_valid_payload() {
    let program_test = program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let seller = Keypair::new();
    let listing = Keypair::new();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    
    let listing_id = 67890u64;
    let price_per_token = 2_000_000u64; // 2 USDC per token
    let quantity = 50_000_000u64; // 50 tokens
    let allow_partial = false;
    let fee_payment_method = 1u8; // X402
    let x402_payload = Some("x402-payment-proof-base64-encoded-data-12345".to_string());

    // Create the instruction data
    let instruction_data = EscrowInstruction::InitializeListing {
        listing_id,
        price_per_token,
        quantity,
        allow_partial,
        fee_payment_method,
        x402_payload,
    };

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", seller.pubkey().as_ref(), &listing_id_bytes];
    let (vault_authority, _bump) = Pubkey::find_program_address(seeds, &program_test.program_id);
    
    let vault_token_account = Pubkey::new_unique();

    let accounts = vec![
        AccountMeta::new(seller.pubkey(), true),
        AccountMeta::new(listing.pubkey(), false),
        AccountMeta::new_readonly(vault_authority, false),
        AccountMeta::new_readonly(vault_token_account, false),
        AccountMeta::new_readonly(base_mint, false),
        AccountMeta::new_readonly(quote_mint, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let instruction = Instruction {
        program_id: program_test.program_id,
        accounts,
        data: instruction_data.try_to_vec().unwrap(),
    };

    // Fund seller account
    let seller_account = Account {
        lamports: 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&seller.pubkey(), &seller_account)
        .await
        .unwrap();

    // Create listing account with required space
    let listing_account = Account {
        lamports: 1_000_000,
        data: vec![0; Listing::LEN],
        owner: program_test.program_id,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&listing.pubkey(), &listing_account)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &seller],
        recent_blockhash,
    );

    // Process transaction
    let result = banks_client.process_transaction(transaction).await;
    
    // Verify the transaction succeeded
    assert!(result.is_ok(), "Transaction should succeed with valid X402 payload");

    // Fetch and verify the listing account
    let listing_account = banks_client
        .get_account(listing.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let listing_data = Listing::try_from_slice(&listing_account.data).unwrap();
    
    assert_eq!(listing_data.seller, seller.pubkey());
    assert_eq!(listing_data.status(), ListingStatus::AwaitingDeposit);
    assert_eq!(listing_data.fee_payment_method, 1); // X402
    
    // Fee should be 1% of trade value
    let expected_fee = (price_per_token as u128 * quantity as u128 / 100) as u64;
    assert_eq!(listing_data.fee_amount_paid, expected_fee);
    
    // x402_payload_hash should NOT be empty (it's the hash of the payload)
    assert_ne!(listing_data.x402_payload_hash, [0u8; 32]);
}

/// Test initializing a listing with X402 fee payment but missing payload (should fail)
#[tokio::test]
async fn test_initialize_listing_x402_fee_missing_payload() {
    let program_test = program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let seller = Keypair::new();
    let listing = Keypair::new();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    
    let listing_id = 11111u64;
    let price_per_token = 1_500_000u64;
    let quantity = 75_000_000u64;
    let allow_partial = true;
    let fee_payment_method = 1u8; // X402
    let x402_payload: Option<String> = None; // Missing payload!

    // Create the instruction data
    let instruction_data = EscrowInstruction::InitializeListing {
        listing_id,
        price_per_token,
        quantity,
        allow_partial,
        fee_payment_method,
        x402_payload,
    };

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", seller.pubkey().as_ref(), &listing_id_bytes];
    let (vault_authority, _bump) = Pubkey::find_program_address(seeds, &program_test.program_id);
    
    let vault_token_account = Pubkey::new_unique();

    let accounts = vec![
        AccountMeta::new(seller.pubkey(), true),
        AccountMeta::new(listing.pubkey(), false),
        AccountMeta::new_readonly(vault_authority, false),
        AccountMeta::new_readonly(vault_token_account, false),
        AccountMeta::new_readonly(base_mint, false),
        AccountMeta::new_readonly(quote_mint, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let instruction = Instruction {
        program_id: program_test.program_id,
        accounts,
        data: instruction_data.try_to_vec().unwrap(),
    };

    // Fund seller account
    let seller_account = Account {
        lamports: 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&seller.pubkey(), &seller_account)
        .await
        .unwrap();

    // Create listing account with required space
    let listing_account = Account {
        lamports: 1_000_000,
        data: vec![0; Listing::LEN],
        owner: program_test.program_id,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&listing.pubkey(), &listing_account)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &seller],
        recent_blockhash,
    );

    // Process transaction
    let result = banks_client.process_transaction(transaction).await;
    
    // Verify the transaction FAILED with InvalidX402Proof error
    assert!(result.is_err(), "Transaction should fail with missing X402 payload");
}

/// Test initializing a listing with X402 fee and empty payload string (should fail)
#[tokio::test]
async fn test_initialize_listing_x402_fee_empty_payload() {
    let program_test = program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let seller = Keypair::new();
    let listing = Keypair::new();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    
    let listing_id = 22222u64;
    let price_per_token = 3_000_000u64;
    let quantity = 25_000_000u64;
    let allow_partial = true;
    let fee_payment_method = 1u8; // X402
    let x402_payload = Some("".to_string()); // Empty payload string!

    // Create the instruction data
    let instruction_data = EscrowInstruction::InitializeListing {
        listing_id,
        price_per_token,
        quantity,
        allow_partial,
        fee_payment_method,
        x402_payload,
    };

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", seller.pubkey().as_ref(), &listing_id_bytes];
    let (vault_authority, _bump) = Pubkey::find_program_address(seeds, &program_test.program_id);
    
    let vault_token_account = Pubkey::new_unique();

    let accounts = vec![
        AccountMeta::new(seller.pubkey(), true),
        AccountMeta::new(listing.pubkey(), false),
        AccountMeta::new_readonly(vault_authority, false),
        AccountMeta::new_readonly(vault_token_account, false),
        AccountMeta::new_readonly(base_mint, false),
        AccountMeta::new_readonly(quote_mint, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let instruction = Instruction {
        program_id: program_test.program_id,
        accounts,
        data: instruction_data.try_to_vec().unwrap(),
    };

    // Fund seller account
    let seller_account = Account {
        lamports: 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&seller.pubkey(), &seller_account)
        .await
        .unwrap();

    // Create listing account with required space
    let listing_account = Account {
        lamports: 1_000_000,
        data: vec![0; Listing::LEN],
        owner: program_test.program_id,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&listing.pubkey(), &listing_account)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &seller],
        recent_blockhash,
    );

    // Process transaction
    let result = banks_client.process_transaction(transaction).await;
    
    // Verify the transaction FAILED
    assert!(result.is_err(), "Transaction should fail with empty X402 payload");
}

/// Test that fee calculation is correct (1% of trade value)
#[tokio::test]
async fn test_x402_fee_calculation() {
    let program_test = program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let seller = Keypair::new();
    let listing = Keypair::new();
    let base_mint = Pubkey::new_unique();
    let quote_mint = Pubkey::new_unique();
    
    let listing_id = 99999u64;
    let price_per_token = 10_000_000u64; // 10 USDC per token
    let quantity = 1_000_000_000u64; // 1000 tokens
    // Trade value = 10 * 1000 = 10,000 USDC
    // Expected fee = 1% = 100 USDC
    
    let allow_partial = true;
    let fee_payment_method = 1u8; // X402
    let x402_payload = Some("valid-x402-proof-for-fee-test".to_string());

    // Create the instruction data
    let instruction_data = EscrowInstruction::InitializeListing {
        listing_id,
        price_per_token,
        quantity,
        allow_partial,
        fee_payment_method,
        x402_payload,
    };

    let listing_id_bytes = listing_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"vault", seller.pubkey().as_ref(), &listing_id_bytes];
    let (vault_authority, _bump) = Pubkey::find_program_address(seeds, &program_test.program_id);
    
    let vault_token_account = Pubkey::new_unique();

    let accounts = vec![
        AccountMeta::new(seller.pubkey(), true),
        AccountMeta::new(listing.pubkey(), false),
        AccountMeta::new_readonly(vault_authority, false),
        AccountMeta::new_readonly(vault_token_account, false),
        AccountMeta::new_readonly(base_mint, false),
        AccountMeta::new_readonly(quote_mint, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let instruction = Instruction {
        program_id: program_test.program_id,
        accounts,
        data: instruction_data.try_to_vec().unwrap(),
    };

    // Fund seller account
    let seller_account = Account {
        lamports: 1_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&seller.pubkey(), &seller_account)
        .await
        .unwrap();

    // Create listing account with required space
    let listing_account = Account {
        lamports: 1_000_000,
        data: vec![0; Listing::LEN],
        owner: program_test.program_id,
        executable: false,
        rent_epoch: 0,
    };
    banks_client
        .set_account(&listing.pubkey(), &listing_account)
        .await
        .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &seller],
        recent_blockhash,
    );

    // Process transaction
    banks_client.process_transaction(transaction).await.unwrap();

    // Fetch and verify the listing account
    let listing_account = banks_client
        .get_account(listing.pubkey())
        .await
        .unwrap()
        .unwrap();
    
    let listing_data = Listing::try_from_slice(&listing_account.data).unwrap();
    
    // Verify fee calculation: (10_000_000 * 1_000_000_000) / 100 = 100_000_000_000
    let expected_fee = (price_per_token as u128 * quantity as u128 / 100) as u64;
    assert_eq!(listing_data.fee_amount_paid, expected_fee);
    assert_eq!(listing_data.fee_amount_paid, 100_000_000_000u64);
}

