use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, instruction::{AccountMeta, Instruction}};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo, mint_to};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");

// 0.05 SOL challenger stake (in lamports)
pub const CHALLENGER_STAKE: u64 = 50_000_000;

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

    pub fn commit_content(ctx: Context<CommitContent>, p_hash: String) -> Result<()> {
        require!(p_hash.len() == 64, KredenceError::InvalidHashLength);

        let record = &mut ctx.accounts.content_record;
        record.creator = ctx.accounts.payer.key();
        record.commit_time = Clock::get()?.unix_timestamp;
        record.p_hash = p_hash;
        record.status = RecordStatus::Pending;
        record.metadata_uri = "".to_string();
        record.is_disputed = false;
        record.is_resolved = false;
        record.challenger = Pubkey::default();
        record.evidence_url = "".to_string();
        record.creator_votes = 0;
        record.challenger_votes = 0;
        record.winner_is_creator = false;

        Ok(())
    }

    pub fn reveal_and_mint(ctx: Context<RevealAndMint>, metadata_uri: String) -> Result<()> {
        let record = &mut ctx.accounts.content_record;
        record.status = RecordStatus::Minted;
        record.metadata_uri = metadata_uri.clone();
        Ok(())
    }

    pub fn check_similarity(_ctx: Context<CheckSimilarity>, hash1: String, hash2: String) -> Result<()> {
        let distance = calculate_hamming_distance(&hash1, &hash2)?;
        emit!(SimilarityChecked {
            hash1: hash1.clone(),
            hash2: hash2.clone(),
            distance,
            label: "SIMILAR".to_string(),
        });
        Ok(())
    }

    pub fn purchase_license(ctx: Context<PurchaseLicense>, fee_lamports: u64) -> Result<()> {
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
        Ok(())
    }

    // ----------------------------------------------------------------
    // DISPUTE: Phase 1 — Create (challenger stakes 0.05 SOL)
    // ----------------------------------------------------------------
    pub fn create_dispute(ctx: Context<CreateDispute>, evidence_url: String) -> Result<()> {
        // Transfer the challenger stake into the dispute_record PDA account
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.challenger.key(),
            &ctx.accounts.dispute_record.key(),
            CHALLENGER_STAKE,
        );
        invoke(
            &transfer_ix,
            &[
                ctx.accounts.challenger.to_account_info(),
                ctx.accounts.dispute_record.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let record = &mut ctx.accounts.dispute_record;
        record.creator = ctx.accounts.creator.key();
        record.content_mint = ctx.accounts.content_mint.key();
        record.start_time = Clock::get()?.unix_timestamp;
        record.end_time = record.start_time + 120; // 2-minute voting window
        record.original_votes = 0;
        record.counterfeit_votes = 0;
        record.prize_pool = CHALLENGER_STAKE;
        record.total_winning_votes = 0;
        record.is_resolved = false;
        record.winning_side = 0;
        record.bump = ctx.bumps.dispute_record;
        record.evidence_url = evidence_url;
        Ok(())
    }

    // ----------------------------------------------------------------
    // DISPUTE: Phase 2 — Cast Vote (reputation-weighted, free)
    // ----------------------------------------------------------------
    pub fn cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute_record;
        require!(Clock::get()?.unix_timestamp < dispute.end_time, KredenceError::VotingClosed);
        require!(choice == 1 || choice == 2, KredenceError::InvalidChoice);

        // Try to read KRED_REP balance; default to 0 if account doesn't exist or fails
        let rep_balance: u64 = {
            let acct = &ctx.accounts.rep_token_account;
            if acct.data_is_empty() {
                0u64
            } else {
                // Token account amount is at byte offset 64 (after mint[32] + owner[32])
                let data = acct.try_borrow_data()?;
                if data.len() >= 72 {
                    u64::from_le_bytes(data[64..72].try_into().unwrap_or([0u8; 8]))
                } else {
                    0u64
                }
            }
        };

        // Weight: 1 base + 1 per 10 KRED_REP held (max meaningful boost)
        let weight = 1u64.saturating_add(rep_balance / 10);

        let receipt = &mut ctx.accounts.vote_receipt;
        receipt.voter = ctx.accounts.voter.key();
        receipt.dispute = dispute.key();
        receipt.choice = choice;
        receipt.weight = weight;
        receipt.claimed = false;

        if choice == 1 {
            dispute.original_votes = dispute.original_votes.checked_add(weight).unwrap();
        } else {
            dispute.counterfeit_votes = dispute.counterfeit_votes.checked_add(weight).unwrap();
        }

        Ok(())
    }

    // ----------------------------------------------------------------
    // DISPUTE: Phase 3 — Resolve (anyone can call after end_time)
    // ----------------------------------------------------------------
    pub fn resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute_record;
        require!(Clock::get()?.unix_timestamp >= dispute.end_time, KredenceError::VotingActive);
        require!(!dispute.is_resolved, KredenceError::AlreadyResolved);

        if dispute.original_votes >= dispute.counterfeit_votes {
            dispute.winning_side = 1;
            dispute.total_winning_votes = dispute.original_votes;
        } else {
            dispute.winning_side = 2;
            dispute.total_winning_votes = dispute.counterfeit_votes;
        }

        dispute.is_resolved = true;
        Ok(())
    }

    // ----------------------------------------------------------------
    // DISPUTE: Phase 4 — Claim: SOL reward (pro-rata) + KRED_REP badge
    // ----------------------------------------------------------------
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let dispute = &ctx.accounts.dispute_record;
        require!(dispute.is_resolved, KredenceError::NotResolved);

        let receipt = &mut ctx.accounts.vote_receipt;
        require!(!receipt.claimed, KredenceError::AlreadyClaimed);
        require!(receipt.choice == dispute.winning_side, KredenceError::VotedForLoser);

        // ---- SOL reward (pro-rata from prize pool) ----
        // voter_reward = prize_pool * voter_weight / total_winning_votes
        let voter_reward: u64 = if dispute.total_winning_votes > 0 {
            (receipt.weight as u128)
                .checked_mul(dispute.prize_pool as u128)
                .unwrap_or(0)
                .checked_div(dispute.total_winning_votes as u128)
                .unwrap_or(0) as u64
        } else {
            0u64
        };

        receipt.claimed = true;

        if voter_reward > 0 {
            // Transfer lamports from dispute PDA → voter
            // We use raw lamport manipulation since PDA is payer-initialised
            **ctx.accounts.dispute_record.to_account_info().try_borrow_mut_lamports()? =
                ctx.accounts.dispute_record.to_account_info().lamports()
                    .checked_sub(voter_reward)
                    .ok_or(KredenceError::InsufficientFunds)?;

            **ctx.accounts.voter.to_account_info().try_borrow_mut_lamports()? =
                ctx.accounts.voter.to_account_info().lamports()
                    .checked_add(voter_reward)
                    .ok_or(KredenceError::Overflow)?;
        }

        // ---- KRED_REP badge mint ----
        let seeds = &[b"mint_authority".as_ref(), &[ctx.bumps.mint_authority_pda]];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.kred_rep_mint.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority_pda.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        );
        mint_to(cpi_ctx, 1)?;

        Ok(())
    }

    // --- TRANSFER HOOK (PLATFORM LOCK) ---
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        _accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        if data.len() >= 8 {
            let discriminator = &data[..8];
            if discriminator == [105, 37, 101, 197, 75, 251, 102, 253] {
                return err!(KredenceError::PlatformLocked);
            }
        }
        Err(ProgramError::InvalidInstructionData.into())
    }
}

// ============================================================
// Helper Functions
// ============================================================
pub fn calculate_hamming_distance(hash1: &str, hash2: &str) -> Result<u32> {
    Ok(0)
}

// ============================================================
// Account Contexts
// ============================================================

#[derive(Accounts)]
#[instruction(p_hash: String)]
pub struct CommitContent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init, payer = payer, space = 500,
        seeds = [b"content_v2", p_hash.as_bytes().get(..32).unwrap(), p_hash.as_bytes().get(32..64).unwrap()], bump
    )]
    pub content_record: Account<'info, ContentRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealAndMint<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub content_record: Account<'info, ContentRecord>,
}

#[derive(Accounts)]
pub struct CheckSimilarity<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct PurchaseLicense<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    /// CHECK: valid
    pub creator_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ----------------------------------------------------------------
// Dispute account contexts
// ----------------------------------------------------------------

#[derive(Accounts)]
pub struct CreateDispute<'info> {
    #[account(
        init,
        payer = challenger,
        // 8 disc + 32 creator + 32 content_mint + 8 start + 8 end
        // + 8 orig_votes + 8 counter_votes + 8 prize_pool + 8 total_winning
        // + 1 is_resolved + 1 winning_side + 1 bump + 4 + 76 evidence = 203
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 80,
        seeds = [b"dispute", content_mint.key().as_ref()],
        bump
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    /// CHECK: The PDA of the content record being disputed
    pub content_mint: UncheckedAccount<'info>,

    /// CHECK: The original creator of the content
    pub creator: UncheckedAccount<'info>,

    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(
        mut,
        seeds = [b"dispute", dispute_record.content_mint.as_ref()],
        bump = dispute_record.bump
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    #[account(
        init,
        payer = voter,
        space = 8 + 32 + 32 + 1 + 8 + 1,
        seeds = [b"vote_receipt", dispute_record.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_receipt: Account<'info, VoteReceipt>,

    /// CHECK: KRED_REP token account — may not exist for new voters, handled in code
    pub rep_token_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [b"dispute", dispute_record.content_mint.as_ref()],
        bump = dispute_record.bump
    )]
    pub dispute_record: Account<'info, DisputeRecord>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"dispute", dispute_record.content_mint.as_ref()],
        bump = dispute_record.bump
    )]
    pub dispute_record: Account<'info, DisputeRecord>,

    #[account(
        mut,
        seeds = [b"vote_receipt", dispute_record.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_receipt: Account<'info, VoteReceipt>,

    #[account(mut)]
    pub kred_rep_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = voter,
        associated_token::mint = kred_rep_mint,
        associated_token::authority = voter,
        associated_token::token_program = token_program
    )]
    pub winner_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Mint authority PDA for KRED_REP
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority_pda: UncheckedAccount<'info>,

    #[account(mut)]
    pub voter: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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
    pub metadata_uri: String,
    pub is_disputed: bool,
    pub is_resolved: bool,
    pub challenger: Pubkey,
    pub evidence_url: String,
    pub creator_votes: u16,
    pub challenger_votes: u16,
    pub winner_is_creator: bool,
}

#[account]
pub struct DisputeRecord {
    pub creator: Pubkey,           // 32
    pub content_mint: Pubkey,      // 32
    pub start_time: i64,           // 8
    pub end_time: i64,             // 8
    pub original_votes: u64,       // 8
    pub counterfeit_votes: u64,    // 8
    pub prize_pool: u64,           // 8  ← challenger stake held in PDA
    pub total_winning_votes: u64,  // 8  ← set on resolve, used for pro-rata
    pub is_resolved: bool,         // 1
    pub winning_side: u8,          // 1  (0=none, 1=original, 2=counterfeit)
    pub bump: u8,                  // 1
    pub evidence_url: String,      // 4 + 76 = 80
}

#[account]
pub struct VoteReceipt {
    pub voter: Pubkey,   // 32
    pub dispute: Pubkey, // 32
    pub choice: u8,      // 1
    pub weight: u64,     // 8
    pub claimed: bool,   // 1
}

#[event]
pub struct LicenseIssued {}

#[event]
pub struct SimilarityChecked {
    pub hash1: String,
    pub hash2: String,
    pub distance: u32,
    pub label: String,
}

#[error_code]
pub enum KredenceError {
    #[msg("pHash must be exactly 64 characters (hex-encoded).")]
    InvalidHashLength,
    #[msg("Voting period is closed.")]
    VotingClosed,
    #[msg("Invalid vote choice.")]
    InvalidChoice,
    #[msg("Voting is still active.")]
    VotingActive,
    #[msg("Dispute is already resolved.")]
    AlreadyResolved,
    #[msg("Dispute is not resolved yet.")]
    NotResolved,
    #[msg("You did not vote for the winner.")]
    VotedForLoser,
    #[msg("Tokens cannot be transferred.")]
    PlatformLocked,
    #[msg("Already claimed.")]
    AlreadyClaimed,
    #[msg("Dispute PDA has insufficient funds for reward.")]
    InsufficientFunds,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
