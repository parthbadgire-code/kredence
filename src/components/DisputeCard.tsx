import { useState, useEffect } from "react";
import { Clock, ShieldCheck, Gavel, BarChart2 } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import IDL from "@/lib/idl.json";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const KRED_REP_MINT = new PublicKey("CqxcX9x6w1VVtM5BFjPZMg4T4zhCThrhJtEEtc5x1wZa"); // mint_authority PDA — used as dummy for now
// NOTE: Replace KRED_REP_MINT with the actual mint address once created on-chain.

interface DisputeCardProps {
  disputePda: string;
  contentMint: string;
  creator: string;
  endTime: number;
  isResolved: boolean;
  winningSide: number;
  originalVotes: number;
  counterfeitVotes: number;
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
  onRefresh,
}: DisputeCardProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, endTime - Math.floor(Date.now() / 1000)));
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [votedFor, setVotedFor] = useState<number | null>(null);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  };

  useEffect(() => {
    if (isResolved) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Math.floor(Date.now() / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime, isResolved]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const totalVotes = originalVotes + counterfeitVotes;
  const originalPct = totalVotes > 0 ? Math.round((originalVotes / totalVotes) * 100) : 50;
  const counterfeitPct = 100 - originalPct;

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

      // Derive ATA for KRED_REP using Token-2022
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
      alert(`Vote cast for ${choice === 1 ? "Original" : "Counterfeit"}!`);
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
        .accounts({
          disputeRecord: disputeRecordPubkey,
        } as any)
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
        .claimReputation()
        .accounts({
          disputeRecord: disputeRecordPubkey,
          voteReceipt,
          kredRepMint: KRED_REP_MINT,
          winnerTokenAccount,
          mintAuthorityPda,
          voter: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        } as any)
        .rpc();

      alert("Reputation Badge Claimed!");
      onRefresh?.();
    } catch (e: any) {
      console.error("Claim error:", e);
      alert("Failed to claim: " + (e?.message ?? String(e)));
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-amber-900/30 bg-[#0a0a0d]/90 backdrop-blur-md p-6 shadow-xl">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-zinc-100 font-bold text-sm">
            Dispute — Asset <span className="font-mono text-amber-400">{contentMint.slice(0, 8)}...</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">Creator: {creator.slice(0, 8)}...</p>
        </div>
        {!isResolved ? (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-sm ${
            timeLeft > 0
              ? "bg-amber-950/30 border border-amber-900/50 text-amber-400"
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

      {/* Vote Tally Bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-1"><BarChart2 size={12} /> Original: {originalVotes}</span>
          <span>Counterfeit: {counterfeitVotes}</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${originalPct}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${counterfeitPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-emerald-400">{originalPct}% Original</span>
          <span className="text-rose-400">{counterfeitPct}% Counterfeit</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-zinc-800/50 pt-4">
        {timeLeft > 0 && !isResolved ? (
          <div className="flex gap-2 w-full">
            <button
              onClick={() => handleVote(1)}
              disabled={isVoting || votedFor !== null}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors text-sm ${
                votedFor === 1
                  ? "bg-emerald-700/60 text-emerald-200 cursor-default"
                  : "bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 disabled:opacity-50"
              }`}
            >
              {votedFor === 1 ? "✓ Voted Original" : "Vote Original"}
            </button>
            <button
              onClick={() => handleVote(2)}
              disabled={isVoting || votedFor !== null}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors text-sm ${
                votedFor === 2
                  ? "bg-rose-700/60 text-rose-200 cursor-default"
                  : "bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 disabled:opacity-50"
              }`}
            >
              {votedFor === 2 ? "✓ Voted Counterfeit" : "Vote Counterfeit"}
            </button>
          </div>
        ) : timeLeft === 0 && !isResolved ? (
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="w-full py-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
          >
            <Gavel size={16} /> {isResolving ? "Resolving..." : "Resolve Dispute"}
          </button>
        ) : null}

        {isResolved && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 flex justify-between items-center text-sm">
              <span className="text-zinc-400">Winner:</span>
              <span className={winningSide === 1 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {winningSide === 1 ? "Original Creator" : "Challenger"}
              </span>
            </div>
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="w-full py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 text-blue-400 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
            >
              <ShieldCheck size={16} /> {isClaiming ? "Claiming..." : "Mint Reputation Badge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
