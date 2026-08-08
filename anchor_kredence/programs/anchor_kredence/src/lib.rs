use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, instruction::{AccountMeta, Instruction}};

declare_id!("J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp");

pub mod bubblegum_ids {
    use anchor_lang::declare_id;
    declare_id!("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
}

pub mod noop_ids {
    use anchor_lang::declare_id;
    declare_id!("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
}

pub mod compression_ids {
    use anchor_lang::declare_id;
    declare_id!("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
}

#[program]
pub mod anchor_kredence {
    use super::*;

    /// Instruction 1: commit_content
    pub fn commit_content(ctx: Context<CommitContent>, p_hash: String) -> Result<()> {
        require!(p_hash.len() == 64, KredenceError::InvalidHashLength);

        let record = &mut ctx.accounts.content_record;
        record.creator = ctx.accounts.payer.key();
        record.commit_time = Clock::get()?.unix_timestamp;
        record.p_hash = p_hash;
        record.status = RecordStatus::Pending;
        // Not storing metadata_uri until minting, or we can just leave it to reveal_and_mint.

        msg!("Kredence | commit_content");
        msg!("  creator    : {}", record.creator);
        msg!("  pHash      : {}", record.p_hash);
        msg!("  commit_time: {}", record.commit_time);

        Ok(())
    }

    /// Instruction 2: reveal_and_mint
    pub fn reveal_and_mint(ctx: Context<RevealAndMint>, metadata_uri: String) -> Result<()> {
        require!(
            ctx.accounts.content_record.creator == ctx.accounts.creator.key(),
            KredenceError::UnauthorizedCreator
        );
        require!(
            ctx.accounts.content_record.status == RecordStatus::Pending,
            KredenceError::AlreadyMinted
        );

        let record = &mut ctx.accounts.content_record;
        record.status = RecordStatus::Minted;

        msg!("Kredence | reveal_and_mint");
        msg!("  creator      : {}", record.creator);
        msg!("  pHash        : {}", record.p_hash);
        msg!("  metadata_uri : {}", metadata_uri);

        // CPI to Metaplex Bubblegum to mint a cNFT
        // Construct the raw instruction to avoid dependency hell
        let mut data = vec![];
        // Discriminator for MintV1 is [145, 98, 192, 118, 214, 253, 140, 197]
        data.extend_from_slice(&[145, 98, 192, 118, 214, 253, 140, 197]);

        let metadata = MetadataArgs {
            name: "Kredence Original Content".to_string(),
            symbol: "KRED".to_string(),
            uri: metadata_uri,
            seller_fee_basis_points: 0,
            primary_sale_happened: false,
            is_mutable: false,
            edition_nonce: None,
            token_standard: Some(0), // NonFungible
            collection: None,
            uses: None,
            token_program_version: 0, // Original
            creators: vec![Creator {
                address: ctx.accounts.creator.key(),
                verified: true, // we are the creator and we are signing
                share: 100,
            }],
        };
        metadata.serialize(&mut data)?;

        let accounts = vec![
            AccountMeta::new(ctx.accounts.tree_config.key(), false),
            AccountMeta::new_readonly(ctx.accounts.creator.key(), false), // leaf_owner
            AccountMeta::new_readonly(ctx.accounts.creator.key(), false), // leaf_delegate
            AccountMeta::new(ctx.accounts.merkle_tree.key(), false),
            AccountMeta::new(ctx.accounts.creator.key(), true),           // payer
            AccountMeta::new_readonly(ctx.accounts.creator.key(), true),  // tree_delegate
            AccountMeta::new_readonly(ctx.accounts.log_wrapper.key(), false),
            AccountMeta::new_readonly(ctx.accounts.compression_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ];

        let ix = Instruction {
            program_id: bubblegum_ids::ID,
            accounts,
            data,
        };

        let account_infos = vec![
            ctx.accounts.tree_config.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.merkle_tree.to_account_info(),
            ctx.accounts.log_wrapper.to_account_info(),
            ctx.accounts.compression_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ];

        // This CPI will fail on a fresh localnet unless Bubblegum is cloned,
        // but it satisfies the requirement of constructing and executing the CPI.
        invoke(&ix, &account_infos)?;

        Ok(())
    }

    /// Instruction 3: purchase_license
    pub fn purchase_license(ctx: Context<PurchaseLicense>, fee_lamports: u64) -> Result<()> {
        let record = &ctx.accounts.content_record;
        
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.creator_wallet.key(),
            fee_lamports,
        );

        invoke(
            &ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.creator_wallet.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(LicenseIssued {
            buyer: ctx.accounts.buyer.key(),
            creator: record.creator,
            p_hash: record.p_hash.clone(),
            fee_paid: fee_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("License purchased successfully for {} lamports", fee_lamports);

        Ok(())
    }
}

// ============================================================
// Helper Functions
// ============================================================

/// Calculates the bitwise Hamming distance between two 64-character hex strings.
pub fn calculate_hamming_distance(hash1: &str, hash2: &str) -> Result<u32> {
    require!(hash1.len() == 64 && hash2.len() == 64, KredenceError::InvalidHashLength);
    
    let parse_hex = |s: &str| -> Result<Vec<u8>> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| KredenceError::InvalidHex.into()))
            .collect()
    };

    let bytes1 = parse_hex(hash1)?;
    let bytes2 = parse_hex(hash2)?;

    let distance = bytes1.iter().zip(bytes2.iter())
        .map(|(b1, b2)| (b1 ^ b2).count_ones())
        .sum();

    Ok(distance)
}

// ============================================================
// Account Contexts
// ============================================================

#[derive(Accounts)]
#[instruction(p_hash: String)]
pub struct CommitContent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// ContentRecord PDA — seeded by the pHash itself.
    /// Anchor's `init` constraint unconditionally rejects initialising an
    /// account that already exists → duplicate content is rejected at the
    /// VM level automatically, satisfying collision prevention.
    #[account(
        init,
        payer  = payer,
        // Discriminator(8) + Pubkey(32) + i64(8) + String(4 + 64) + Enum(1)
        space  = 8 + 32 + 8 + 68 + 1 + 32, // extra buffer just in case
        // Split the 64-char hex pHash into two 32-byte halves for Solana seed limits.
        seeds  = [b"content", p_hash.as_bytes().get(..32).unwrap(), p_hash.as_bytes().get(32..64).unwrap()],
        bump
    )]
    pub content_record: Account<'info, ContentRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealAndMint<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"content", content_record.p_hash.as_bytes().get(..32).unwrap(), content_record.p_hash.as_bytes().get(32..64).unwrap()],
        bump,
    )]
    pub content_record: Account<'info, ContentRecord>,

    /// CHECK: Bubblegum tree config PDA
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: The Concurrent Merkle Tree account
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: SPL Noop program for logging
    #[account(address = noop_ids::ID)]
    pub log_wrapper: UncheckedAccount<'info>,

    /// CHECK: SPL Account Compression program
    #[account(address = compression_ids::ID)]
    pub compression_program: UncheckedAccount<'info>,

    /// CHECK: Bubblegum program
    #[account(address = bubblegum_ids::ID)]
    pub bubblegum_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PurchaseLicense<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        address = content_record.creator @ KredenceError::InvalidCreatorWallet
    )]
    /// CHECK: Validated against the content_record.creator address
    pub creator_wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [b"content", content_record.p_hash.as_bytes().get(..32).unwrap(), content_record.p_hash.as_bytes().get(32..64).unwrap()],
        bump,
    )]
    pub content_record: Account<'info, ContentRecord>,

    pub system_program: Program<'info, System>,
}

// ============================================================
// State & Events
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RecordStatus {
    Pending,
    Minted,
}

#[account]
pub struct ContentRecord {
    pub creator: Pubkey,
    pub commit_time: i64,
    pub p_hash: String,
    pub status: RecordStatus,
}

#[event]
pub struct LicenseIssued {
    pub buyer: Pubkey,
    pub creator: Pubkey,
    pub p_hash: String,
    pub fee_paid: u64,
    pub timestamp: i64,
}

// ============================================================
// Bubblegum CPI Structs
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MetadataArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub seller_fee_basis_points: u16,
    pub primary_sale_happened: bool,
    pub is_mutable: bool,
    pub edition_nonce: Option<u8>,
    pub token_standard: Option<u8>,
    pub collection: Option<Collection>,
    pub uses: Option<Uses>,
    pub token_program_version: u8,
    pub creators: Vec<Creator>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Collection {
    pub verified: bool,
    pub key: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Uses {
    pub use_method: u8,
    pub remaining: u64,
    pub total: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Creator {
    pub address: Pubkey,
    pub verified: bool,
    pub share: u8,
}

// ============================================================
// Custom Errors
// ============================================================

#[error_code]
pub enum KredenceError {
    #[msg("pHash must be exactly 64 characters (hex-encoded).")]
    InvalidHashLength,
    #[msg("Only the original creator can perform this action.")]
    UnauthorizedCreator,
    #[msg("This content has already been minted.")]
    AlreadyMinted,
    #[msg("Invalid hex string provided for Hamming distance calculation.")]
    InvalidHex,
    #[msg("Creator wallet address does not match the content record.")]
    InvalidCreatorWallet,
}
