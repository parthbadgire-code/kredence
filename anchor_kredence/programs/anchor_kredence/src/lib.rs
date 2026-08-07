use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;

declare_id!("J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp");

// ============================================================
// Bubblegum Program ID (Metaplex cNFT program on all clusters)
// ============================================================
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
    ///
    /// Implements the "Commit" phase of the Commit-Reveal scheme.
    ///
    /// The `pHash` (perceptual hash, 64 hex chars) is used as a PDA seed.
    ///
    /// COLLISION RESISTANCE:
    ///   - Seeds: [b"content", p_hash.as_bytes()]
    ///   - Because Solana requires each PDA address to be unique per program,
    ///     two identical hashes will always resolve to the same address.
    ///   - Anchor's `init` constraint unconditionally rejects initialising an
    ///     account that already exists → duplicate content is rejected at the
    ///     VM level, no custom logic required.
    pub fn commit_content(ctx: Context<CommitContent>, p_hash: String) -> Result<()> {
        require!(p_hash.len() == 64, KredenceError::InvalidHashLength);

        let record = &mut ctx.accounts.content_record;
        record.creator   = ctx.accounts.payer.key();
        record.timestamp = Clock::get()?.unix_timestamp;
        record.p_hash    = p_hash;

        msg!("Kredence | commit_content");
        msg!("  creator  : {}", record.creator);
        msg!("  pHash    : {}", record.p_hash);
        msg!("  timestamp: {}", record.timestamp);

        Ok(())
    }

    /// Instruction 2: reveal_and_mint
    ///
    /// Implements the "Reveal" phase.
    ///
    /// 1. Verifies the signer is the same wallet that committed the hash.
    /// 2. Performs a raw CPI (invoke) to Metaplex Bubblegum's `mintV1` instruction
    ///    to mint a Compressed NFT to the creator's wallet.
    ///
    /// Using raw `invoke` instead of the bubblegum-rs CPI bindings avoids the
    /// transitive dependency version conflicts caused by mpl-bubblegum pulling
    /// in an older solana-program.
    pub fn reveal_and_mint(ctx: Context<RevealAndMint>) -> Result<()> {
        require!(
            ctx.accounts.content_record.creator == ctx.accounts.creator.key(),
            KredenceError::UnauthorizedCreator
        );

        msg!("Kredence | reveal_and_mint");
        msg!("  minting cNFT for hash: {}", ctx.accounts.content_record.p_hash);

        // ----------------------------------------------------------------
        // Build the metadata for the cNFT.
        // We encode the metadata as a Bubblegum MetadataArgs via borsh.
        // The struct layout mirrors mpl_bubblegum::state::MetadataArgs.
        // ----------------------------------------------------------------
        let name   = format!("Kredence #{}", &ctx.accounts.content_record.p_hash[..8]);
        let symbol = "KRED".to_string();
        let uri    = format!("https://kredence.app/meta/{}", &ctx.accounts.content_record.p_hash);

        let metadata_args = BubblegumMetadataArgs {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            primary_sale_happened:   false,
            is_mutable:              true,
            edition_nonce:           None,
            token_standard:          Some(0u8), // NonFungible
            collection:              None,
            uses:                    None,
            token_program_version:   0u32,      // Original
            creators:                vec![BubblegumCreator {
                address:  ctx.accounts.creator.key(),
                verified: false,
                share:    100,
            }],
        };

        // Discriminator for Bubblegum `mintV1` instruction
        let ix_discriminator: [u8; 8] = [145, 98, 192, 118, 184, 147, 118, 104];

        let mut ix_data = ix_discriminator.to_vec();
        ix_data.extend(borsh::to_vec(&metadata_args)?);

        let mint_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: bubblegum_ids::ID,
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(
                    ctx.accounts.tree_config.key(), false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.creator.key(), false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.creator.key(), false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new(
                    ctx.accounts.merkle_tree.key(), false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new(
                    ctx.accounts.creator.key(), true
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.creator.key(), true
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    noop_ids::ID, false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    compression_ids::ID, false
                ),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                    ctx.accounts.system_program.key(), false
                ),
            ],
            data: ix_data,
        };

        invoke(
            &mint_ix,
            &[
                ctx.accounts.tree_config.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.merkle_tree.to_account_info(),
                ctx.accounts.log_wrapper.to_account_info(),
                ctx.accounts.compression_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        msg!("Kredence | cNFT minted successfully");
        Ok(())
    }
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
    /// Anchor's `init` constraint rejects duplicate accounts → hash collision
    /// is impossible on-chain without any extra code.
    #[account(
        init,
        payer  = payer,
        // Discriminator(8) + Pubkey(32) + i64(8) + String len prefix(4) + String data(64)
        space  = 8 + 32 + 8 + 4 + 64,
        // pHash is 64 bytes — Solana max seed is 32 bytes per seed.
        // We split the 64-char hex pHash into two 32-byte halves.
        // Full collision resistance is maintained as both halves are needed.
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
        constraint = content_record.creator == creator.key() @ KredenceError::UnauthorizedCreator
    )]
    pub content_record: Account<'info, ContentRecord>,

    /// CHECK: Validated by Bubblegum; the tree config account (tree authority PDA)
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: The Concurrent Merkle Tree account used for cNFTs
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: SPL Noop program for logging
    pub log_wrapper: UncheckedAccount<'info>,

    /// CHECK: SPL Account Compression program
    pub compression_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================
// State
// ============================================================

#[account]
pub struct ContentRecord {
    /// The wallet that originally committed this hash
    pub creator:   Pubkey,
    /// Unix timestamp of when the commitment was made (Proof-of-History anchor)
    pub timestamp: i64,
    /// 64-character hex perceptual hash used as both data and PDA seed
    pub p_hash:    String,
}

// ============================================================
// Bubblegum Metadata (hand-rolled borsh to avoid dep conflicts)
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BubblegumCreator {
    pub address:  Pubkey,
    pub verified: bool,
    pub share:    u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BubblegumMetadataArgs {
    pub name:                    String,
    pub symbol:                  String,
    pub uri:                     String,
    pub seller_fee_basis_points: u16,
    pub primary_sale_happened:   bool,
    pub is_mutable:              bool,
    pub edition_nonce:           Option<u8>,
    pub token_standard:          Option<u8>,
    pub collection:              Option<u8>, // simplified — None in our case
    pub uses:                    Option<u8>, // simplified — None in our case
    pub token_program_version:   u32,
    pub creators:                Vec<BubblegumCreator>,
}

// ============================================================
// Custom Errors
// ============================================================

#[error_code]
pub enum KredenceError {
    #[msg("pHash must be exactly 64 characters (hex-encoded).")]
    InvalidHashLength,
    #[msg("Only the original creator can reveal and mint.")]
    UnauthorizedCreator,
}
