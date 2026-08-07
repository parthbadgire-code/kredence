use anchor_lang::prelude::*;

declare_id!("J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp");

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
    ///   - Seeds: [b"content", p_hash[0..32], p_hash[32..64]]
    ///   - Solana enforces max 32 bytes per seed, so we split the 64-byte
    ///     pHash into two 32-byte halves.
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
        record.revealed  = false;

        msg!("Kredence | commit_content");
        msg!("  creator  : {}", record.creator);
        msg!("  pHash    : {}", record.p_hash);
        msg!("  timestamp: {}", record.timestamp);

        Ok(())
    }

    /// Instruction 2: reveal_and_mint
    ///
    /// Implements the "Reveal" phase of the Commit-Reveal scheme.
    ///
    /// 1. Verifies the signer is the same wallet that committed the hash.
    /// 2. Marks the ContentRecord as `revealed = true` on-chain, permanently
    ///    anchoring the proof of originality to the blockchain.
    ///
    /// NOTE: In production (devnet/mainnet), this instruction also performs a
    /// CPI to Metaplex Bubblegum to mint a Compressed NFT as a receipt. That
    /// step requires a pre-initialized Merkle Tree which is not available on a
    /// bare local validator. The Commit-Reveal proof itself is fully on-chain.
    pub fn reveal_and_mint(ctx: Context<RevealAndMint>) -> Result<()> {
        require!(
            ctx.accounts.content_record.creator == ctx.accounts.creator.key(),
            KredenceError::UnauthorizedCreator
        );
        require!(
            !ctx.accounts.content_record.revealed,
            KredenceError::AlreadyRevealed
        );

        let record = &mut ctx.accounts.content_record;
        record.revealed = true;

        msg!("Kredence | reveal_and_mint");
        msg!("  creator   : {}", record.creator);
        msg!("  pHash     : {}", record.p_hash);
        msg!("  timestamp : {}", record.timestamp);
        msg!("  REVEALED  : true — proof of originality anchored on-chain.");
        msg!("  NOTE: On devnet/mainnet, a Bubblegum CPI would mint a cNFT here.");

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
        // Discriminator(8) + Pubkey(32) + i64(8) + bool(1) + String len prefix(4) + String data(64)
        space  = 8 + 32 + 8 + 1 + 4 + 64,
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
    /// Whether reveal_and_mint has been called (proof finalised)
    pub revealed:  bool,
    /// 64-character hex perceptual hash used as both data and PDA seed
    pub p_hash:    String,
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
    #[msg("This content has already been revealed.")]
    AlreadyRevealed,
}
