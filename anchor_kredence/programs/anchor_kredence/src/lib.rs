use anchor_lang::prelude::*;
use mpl_bubblegum::{
    cpi::{accounts::MintToCollectionV1, mint_to_collection_v1},
    programs::MPL_BUBBLEGUM_ID,
};
use spl_account_compression::{program::SplAccountCompression, Noop};

declare_id!("Kredence11111111111111111111111111111111111");

#[program]
pub mod anchor_kredence {
    use super::*;

    /// Instruction 1: commit_content
    ///
    /// This instruction implements the "Commit" phase of the scheme.
    /// It creates a ContentRecord PDA using the perceptual hash (`pHash`) as a seed.
    pub fn commit_content(ctx: Context<CommitContent>, p_hash: String) -> Result<()> {
        // Validate the p_hash length (expected 64 chars)
        require!(p_hash.len() == 64, KredenceError::InvalidHashLength);

        let content_record = &mut ctx.accounts.content_record;
        
        // Store the original creator's pubkey
        content_record.creator = ctx.accounts.payer.key();
        
        // Store the current on-chain timestamp to prove when the content was committed
        let clock = Clock::get()?;
        content_record.timestamp = clock.unix_timestamp;
        
        // Store the hash
        content_record.p_hash = p_hash;

        msg!("Content committed successfully!");
        msg!("Creator: {}", content_record.creator);
        msg!("Hash: {}", content_record.p_hash);
        msg!("Timestamp: {}", content_record.timestamp);

        Ok(())
    }

    /// Instruction 2: reveal_and_mint
    ///
    /// This instruction implements the "Reveal" phase of the scheme.
    /// It verifies the signer is the creator who committed the hash, 
    /// and issues a cross-program invocation (CPI) to Metaplex Bubblegum 
    /// to mint a Compressed NFT to the creator's wallet.
    pub fn reveal_and_mint(
        ctx: Context<RevealAndMint>, 
        metadata_args: mpl_bubblegum::types::MetadataArgs,
    ) -> Result<()> {
        
        // Ensure the signer is the original creator
        require!(
            ctx.accounts.content_record.creator == ctx.accounts.payer.key(),
            KredenceError::UnauthorizedCreator
        );

        msg!("Revealing content and minting cNFT...");

        // Construct CPI accounts for Metaplex Bubblegum MintToCollectionV1
        let cpi_accounts = MintToCollectionV1 {
            tree_config: ctx.accounts.tree_config.to_account_info(),
            leaf_owner: ctx.accounts.leaf_owner.to_account_info(),
            leaf_delegate: ctx.accounts.leaf_delegate.to_account_info(),
            merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            tree_creator_or_delegate: ctx.accounts.tree_creator_or_delegate.to_account_info(),
            collection_authority: ctx.accounts.collection_authority.to_account_info(),
            collection_authority_record_pda: ctx.accounts.collection_authority_record_pda.to_account_info(),
            collection_mint: ctx.accounts.collection_mint.to_account_info(),
            collection_metadata: ctx.accounts.collection_metadata.to_account_info(),
            collection_edition: ctx.accounts.collection_edition.to_account_info(),
            bubblegum_signer: ctx.accounts.bubblegum_signer.to_account_info(),
            log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
            compression_program: ctx.accounts.compression_program.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        let cpi_program = ctx.accounts.bubblegum_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Execute CPI to mint the compressed NFT
        mint_to_collection_v1(cpi_ctx, metadata_args)?;

        msg!("cNFT minted successfully!");

        Ok(())
    }
}

// ----------------------------------------------------------------------------
// Account Contexts
// ----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(p_hash: String)]
pub struct CommitContent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The PDA that stores the content commitment.
    /// 
    /// **COLLISION RESISTANCE EXPLANATION:**
    /// We use `[b"content", p_hash.as_bytes()]` as the seeds for this PDA.
    /// This design inherently prevents duplicate commits:
    /// 1. Solana requires PDAs to be unique per program based on their seeds.
    /// 2. If User A commits `pHashX`, a PDA is initialized at `AddressX`.
    /// 3. If User B tries to commit the exact same `pHashX`, the runtime computes the same `AddressX`.
    /// 4. Because Anchor's `init` constraint strictly demands that the target account does not yet exist,
    ///    User B's transaction will fail at the Anchor routing level before executing any instruction logic.
    /// 5. Anchor will throw a standard `AccountAlreadyInitialized` (or similar custom constraint failure) error,
    ///    meaning the blockchain natively enforces our originality check without iterating over state.
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 4 + 64, // Discriminator(8) + Pubkey(32) + i64(8) + String Prefix(4) + String(64)
        seeds = [b"content", p_hash.as_bytes()],
        bump
    )]
    pub content_record: Account<'info, ContentRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealAndMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The ContentRecord PDA we created in `commit_content`. 
    /// Must exist and be owned by the payer.
    #[account(
        mut,
        seeds = [b"content", content_record.p_hash.as_bytes()],
        bump
    )]
    pub content_record: Account<'info, ContentRecord>,

    // --- Bubblegum CPI Accounts ---
    /// CHECK: Validated by bubblegum program
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,
    /// CHECK: Creator/Receiver of the leaf
    pub leaf_owner: UncheckedAccount<'info>,
    /// CHECK: Delegate of the leaf
    pub leaf_delegate: UncheckedAccount<'info>,
    /// CHECK: The Merkle Tree account
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    /// CHECK: Authority for the tree
    pub tree_creator_or_delegate: UncheckedAccount<'info>,
    
    // Collection Accounts
    /// CHECK: Collection Authority
    pub collection_authority: UncheckedAccount<'info>,
    /// CHECK: Collection Authority Record PDA
    pub collection_authority_record_pda: UncheckedAccount<'info>,
    /// CHECK: Collection Mint
    pub collection_mint: UncheckedAccount<'info>,
    /// CHECK: Collection Metadata
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,
    /// CHECK: Collection Edition
    pub collection_edition: UncheckedAccount<'info>,

    /// CHECK: Bubblegum Signer
    pub bubblegum_signer: UncheckedAccount<'info>,

    // Programs
    /// CHECK: Bubblegum Program ID
    #[account(address = MPL_BUBBLEGUM_ID)]
    pub bubblegum_program: UncheckedAccount<'info>,
    pub log_wrapper: Program<'info, Noop>,
    pub compression_program: Program<'info, SplAccountCompression>,
    /// CHECK: Token Metadata Program
    pub token_metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------

#[account]
pub struct ContentRecord {
    pub creator: Pubkey,
    pub timestamp: i64,
    pub p_hash: String,
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

#[error_code]
pub enum KredenceError {
    #[msg("The provided perceptual hash must be exactly 64 characters long.")]
    InvalidHashLength,
    #[msg("Only the original creator can reveal and mint this content.")]
    UnauthorizedCreator,
}
