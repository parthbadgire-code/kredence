import { useState, useEffect } from "react";
import { Clock, ShieldCheck, Gavel, BarChart2, Coins, Zap } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import IDL from "@/lib/idl.json";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

// KRED_REP Token-2022 mint — created on Devnet, mint authority = program PDA
const KRED_REP_MINT = new PublicKey("6u6qVLPhpwyMy9PbtAA1P8q1PKG1615mohCW6HcuXEAB");
const CHALLENGER_STAKE_SOL = 0.05;

interface DisputeCardProps {
  disputePda: string;
  contentMint: string;
  creator: string;
  endTime: number;
  isResolved: boolean;
  winningSide: number;
  originalVotes: number;
  counterfeitVotes: number;
  prizePool?: number; // in lamports
  totalWinningVotes?: number;
  onRefresh?: () => void;
}

export default function DisputeCard({
  disputePda,
  contentMint,
  creator,
  endTime,
  isResolved,
  winningSide,
  originalVotes,
  counterfeitVotes,
  prizePool = 50_000_000,
  totalWinningVotes = 0,
  onRefresh,
}: DisputeCardProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, endTime - Math.floor(Date.now() / 1000)));
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [votedFor, setVotedFor] = useState<number | null>(null);
  const [hasVoteReceipt, setHasVoteReceipt] = useState(false);
  const [myVoteWeight, setMyVoteWeight] = useState(0);
  const [isCheckingVote, setIsCheckingVote] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  };

  // Countdown timer
  useEffect(() => {
    if (isResolved) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Math.floor(Date.now() / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime, isResolved]);

  // Check if wallet has a vote_receipt for this dispute
  useEffect(() => {
    if (!wallet.publicKey) return;
    const check = async () => {
      setIsCheckingVote(true);
      try {
        const program = getProgram();
        const disputePubkey = new PublicKey(disputePda);
        const [voteReceiptPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vote_receipt"), disputePubkey.toBuffer(), wallet.publicKey!.toBuffer()],
          program.programId
        );
        const acct = await connection.getAccountInfo(voteReceiptPda);
        if (acct) {
          setHasVoteReceipt(true);
          // Decode weight from VoteReceipt: voter[32] + dispute[32] + choice[1] + weight[8]
          // discriminator[8] + voter[32] + dispute[32] + choice[1] = 73 bytes before weight
          if (acct.data.length >= 81) {
            const weight = Number(acct.data.readBigUInt64LE(73));
            setMyVoteWeight(weight);
          }
        }
      } catch {
        setHasVoteReceipt(false);
      } finally {
        setIsCheckingVote(false);
      }
    };
    check();
  }, [wallet.publicKey, disputePda, connection, isResolved]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const totalVotes = originalVotes + counterfeitVotes;
  const originalPct = totalVotes > 0 ? Math.round((originalVotes / totalVotes) * 100) : 50;
  const counterfeitPct = 100 - originalPct;

  // Estimated reward calculation (pro-rata from prize pool)
  const estimatedRewardLamports =
    isResolved && totalWinningVotes > 0 && myVoteWeight > 0
      ? Math.floor((myVoteWeight * prizePool) / totalWinningVotes)
      : totalVotes > 0 && prizePool > 0
      ? Math.floor(prizePool / Math.max(totalVotes, 1)) // rough estimate for active disputes
      : 0;
  const estimatedRewardSOL = (estimatedRewardLamports / 1e9).toFixed(4);
  const prizePoolSOL = (prizePool / 1e9).toFixed(4);

  const handleVote = async (choice: number) => {
    if (!wallet.publicKey) return alert("Connect your wallet first");
    setIsVoting(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(disputePda);

      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), disputeRecordPubkey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      // repTokenAccount: voter's KRED_REP ATA — may not exist, contract handles gracefully
      const repTokenAccount = getAssociatedTokenAddressSync(
        KRED_REP_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .castVote(choice)
        .accounts({
          disputeRecord: disputeRecordPubkey,
          voteReceipt,
          repTokenAccount,
          voter: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      setVotedFor(choice);
      setHasVoteReceipt(true);
      alert(`Vote cast for ${choice === 1 ? "Original ✅" : "Counterfeit ❌"}!`);
      onRefresh?.();
    } catch (e: any) {
      console.error("Vote error:", e);
      alert("Failed to vote: " + (e?.message ?? String(e)));
    } finally {
      setIsVoting(false);
    }
  };

  const handleResolve = async () => {
    if (!wallet.publicKey) return alert("Connect your wallet first");
    setIsResolving(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(disputePda);

      await program.methods
        .resolveDispute()
        .accounts({ disputeRecord: disputeRecordPubkey } as any)
        .rpc();

      alert("Dispute Resolved!");
      onRefresh?.();
    } catch (e: any) {
      console.error("Resolve error:", e);
      alert("Failed to resolve: " + (e?.message ?? String(e)));
    } finally {
      setIsResolving(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet.publicKey) return alert("Connect your wallet first");
    setIsClaiming(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(disputePda);

      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), disputeRecordPubkey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      const winnerTokenAccount = getAssociatedTokenAddressSync(
        KRED_REP_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority")],
        program.programId
      );

      await program.methods
        .claimReward()
        .accounts({
          disputeRecord: disputeRecordPubkey,
          voteReceipt,
          kredRepMint: KRED_REP_MINT,
          winnerTokenAccount,
          mintAuthorityPda,
          voter: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      alert(`🎉 Claimed! Received ${estimatedRewardSOL} SOL + 1 KRED_REP badge!`);
      onRefresh?.();
    } catch (e: any) {
      console.error("Claim error:", e);
      alert("Failed to claim: " + (e?.message ?? String(e)));
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-amber-900/30 bg-[#0a0a0d]/90 backdrop-blur-md p-6 shadow-2xl">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-zinc-100 font-bold text-sm">
            Dispute — <span className="font-mono text-amber-400">{contentMint.slice(0, 8)}...</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">Creator: {creator.slice(0, 8)}...</p>
        </div>
        {!isResolved ? (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-sm ${
            timeLeft > 0
              ? "bg-amber-950/30 border border-amber-900/50 text-amber-400 animate-pulse"
              : "bg-zinc-800/50 border border-zinc-700/50 text-zinc-400"
          }`}>
            <Clock size={14} />
            <span>{timeLeft > 0 ? formatTime(timeLeft) : "Ended"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-950/30 border border-blue-900/50 text-blue-400 font-bold text-sm">
            <Gavel size={14} />
            <span>RESOLVED</span>
          </div>
        )}
      </div>

      {/* Prize Pool Banner */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-950/20 border border-amber-900/30">
        <div className="flex items-center gap-2">
          <Coins className="text-amber-400" size={16} />
          <span className="text-xs text-zinc-400">Prize Pool</span>
        </div>
        <span className="text-sm font-bold font-mono text-amber-300">{prizePoolSOL} SOL</span>
      </div>

      {/* Vote Tally Bar — hidden while voting is active to prevent bias */}
      {(timeLeft === 0 || isResolved) ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-1"><BarChart2 size={12} /> Original: {originalVotes}</span>
            <span>Counterfeit: {counterfeitVotes}</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-800">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${originalPct}%` }} />
            <div className="bg-rose-500 transition-all duration-500" style={{ width: `${counterfeitPct}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-400 font-medium">{originalPct}% Original</span>
            <span className="text-rose-400 font-medium">{counterfeitPct}% Counterfeit</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-zinc-600 italic">
          <BarChart2 size={12} />
          Results hidden until voting ends
        </div>
      )}

      {/* Reward estimate for active disputes */}
      {!isResolved && totalVotes > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-xs text-zinc-400">
          <span className="flex items-center gap-1"><Zap size={12} className="text-yellow-500" /> Est. reward per voter</span>
          <span className="font-mono text-yellow-400">~{(prizePool / Math.max(totalVotes, 1) / 1e9).toFixed(4)} SOL</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-zinc-800/50 pt-4">

        {/* Voting phase */}
        {timeLeft > 0 && !isResolved && (
          <div className="flex gap-2 w-full">
            <button
              onClick={() => handleVote(1)}
              disabled={isVoting || votedFor !== null || hasVoteReceipt}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors text-sm ${
                votedFor === 1 || (hasVoteReceipt && !votedFor)
                  ? "bg-emerald-700/60 text-emerald-200 cursor-default"
                  : "bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 disabled:opacity-50"
              }`}
            >
              {votedFor === 1 ? "✓ Voted Original" : "Vote Original"}
            </button>
            <button
              onClick={() => handleVote(2)}
              disabled={isVoting || votedFor !== null || hasVoteReceipt}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors text-sm ${
                votedFor === 2
                  ? "bg-rose-700/60 text-rose-200 cursor-default"
                  : "bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 disabled:opacity-50"
              }`}
            >
              {votedFor === 2 ? "✓ Voted Counterfeit" : "Vote Counterfeit"}
            </button>
          </div>
        )}

        {/* Already voted display */}
        {timeLeft > 0 && !isResolved && hasVoteReceipt && !votedFor && (
          <p className="text-xs text-center text-zinc-500">You already voted in this dispute. Wait for the timer to end to claim your reward.</p>
        )}

        {/* Resolve phase */}
        {timeLeft === 0 && !isResolved && (
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="w-full py-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
          >
            <Gavel size={16} /> {isResolving ? "Resolving..." : "Resolve Dispute"}
          </button>
        )}

        {/* Claim phase */}
        {isResolved && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 flex flex-col gap-0.5">
                <span className="text-xs text-zinc-500">Winner</span>
                <span className={`text-sm font-bold ${winningSide === 1 ? "text-emerald-400" : "text-rose-400"}`}>
                  {winningSide === 1 ? "✅ Original" : "❌ Counterfeit"}
                </span>
              </div>
              {hasVoteReceipt && (
                <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 flex flex-col gap-0.5">
                  <span className="text-xs text-zinc-500">Your Reward</span>
                  <span className="text-sm font-bold font-mono text-amber-300">{estimatedRewardSOL} SOL</span>
                  <span className="text-xs text-blue-400">+ 1 KRED_REP</span>
                </div>
              )}
            </div>

            {isCheckingVote ? (
              <div className="w-full py-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40 text-zinc-500 text-sm text-center">
                Checking eligibility...
              </div>
            ) : hasVoteReceipt ? (
              <button
                onClick={handleClaim}
                disabled={isClaiming}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600/30 to-blue-600/30 hover:from-amber-600/40 hover:to-blue-600/40 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm shadow-lg"
              >
                <ShieldCheck size={16} />
                {isClaiming ? "Claiming..." : `Claim ${estimatedRewardSOL} SOL + KRED_REP Badge`}
              </button>
            ) : (
              <div className="w-full py-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30 text-zinc-500 text-sm text-center flex items-center justify-center gap-2">
                <ShieldCheck size={14} /> You did not vote — not eligible for reward
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
