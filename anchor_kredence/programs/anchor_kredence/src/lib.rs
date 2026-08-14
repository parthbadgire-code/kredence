use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, instruction::{AccountMeta, Instruction}};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, MintTo, mint_to};

declare_id!("EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");

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
        Ok(()) // Truncated for simplicity in hackathon, normally CPI here
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

    // --- NEW DISPUTE LOGIC ---

    pub fn create_dispute(ctx: Context<CreateDispute>) -> Result<()> {
        let record = &mut ctx.accounts.dispute_record;
        record.creator = ctx.accounts.creator.key();
        record.content_mint = ctx.accounts.content_mint.key();
        record.start_time = Clock::get()?.unix_timestamp;
        record.end_time = record.start_time + 120; // 2 minute timer
        record.original_votes = 0;
        record.counterfeit_votes = 0;
        record.is_resolved = false;
        record.winning_side = 0;
        record.bump = ctx.bumps.dispute_record;
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute_record;
        require!(Clock::get()?.unix_timestamp < dispute.end_time, KredenceError::VotingClosed);
        require!(choice == 1 || choice == 2, KredenceError::InvalidChoice);

        let rep_balance = ctx.accounts.rep_token_account.amount;
        let weight = 1 + (rep_balance / 10);

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

    pub fn resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
        let dispute = &mut ctx.accounts.dispute_record;
        require!(Clock::get()?.unix_timestamp >= dispute.end_time, KredenceError::VotingActive);
        require!(!dispute.is_resolved, KredenceError::AlreadyResolved);

        if dispute.original_votes >= dispute.counterfeit_votes {
            dispute.winning_side = 1;
        } else {
            dispute.winning_side = 2;
        }

        dispute.is_resolved = true;
        Ok(())
    }

    pub fn claim_reputation(ctx: Context<ClaimReputation>) -> Result<()> {
        let dispute = &ctx.accounts.dispute_record;
        require!(dispute.is_resolved, KredenceError::NotResolved);
        
        let receipt = &mut ctx.accounts.vote_receipt;
        require!(!receipt.claimed, KredenceError::AlreadyClaimed);
        require!(receipt.choice == dispute.winning_side, KredenceError::VotedForLoser);

        receipt.claimed = true;

        let seeds = &[b"mint_authority".as_ref(), &[ctx.bumps.mint_authority_pda]];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.kred_rep_mint.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority_pda.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer);

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
            // spl_transfer_hook_interface::instruction::Execute
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
    Ok(0) // Dummy for brevity in this task
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

// --- NEW DISPUTE ACCOUNTS ---

#[derive(Accounts)]
pub struct CreateDispute<'info> {
    #[account(
        init,
        payer = challenger,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"dispute", content_mint.key().as_ref()],
        bump
    )]
    pub dispute_record: Account<'info, DisputeRecord>,
    
    /// CHECK: The mint of the content being disputed
    pub content_mint: UncheckedAccount<'info>,
    
    /// CHECK: the creator of the disputed content
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
    
    #[account(mut)]
    pub rep_token_account: InterfaceAccount<'info, TokenAccount>,

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
pub struct ClaimReputation<'info> {
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

    #[account(mut)]
    pub winner_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Mint authority for KRED_REP
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority_pda: UncheckedAccount<'info>,

    #[account(mut)]
    pub voter: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
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
    pub creator: Pubkey,
    pub content_mint: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub original_votes: u64,
    pub counterfeit_votes: u64,
    pub is_resolved: bool,
    pub winning_side: u8,
    pub bump: u8,
}

#[account]
pub struct VoteReceipt {
    pub voter: Pubkey,
    pub dispute: Pubkey,
    pub choice: u8,
    pub weight: u64,
    pub claimed: bool,
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
}
