import { useState, useEffect } from "react";
import { Clock, ShieldCheck, AlertTriangle, Gavel, Coins } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import IDL from "@/lib/idl.json";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

interface DisputeCardProps {
  disputePda: string;
  contentMint: string;
  creator: string;
  endTime: number; // Unix timestamp
  isResolved: boolean;
  winningSide: number;
}

export default function DisputeCard({
  disputePda,
  contentMint,
  creator,
  endTime,
  isResolved,
  winningSide,
}: DisputeCardProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, endTime - Math.floor(Date.now() / 1000)));
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  };

  useEffect(() => {
    if (isResolved) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Math.floor(Date.now() / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime, isResolved]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleVote = async (choice: number) => {
    if (!wallet.publicKey) return alert("Connect wallet");
    setIsVoting(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(disputePda);
      
      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), disputeRecordPubkey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      // We need to pass repTokenAccount, but we can assume it's derived or passed in reality.
      // For this implementation, we use a dummy logic for ATA or user needs to provide it.
      // Assume we know the KRED_REP mint
      const KRED_REP_MINT = new PublicKey("11111111111111111111111111111111"); // Replace with actual
      const [repTokenAccount] = PublicKey.findProgramAddressSync(
        [wallet.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), KRED_REP_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
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

      alert("Vote Cast!");
    } catch (e) {
      console.error(e);
      alert("Failed to vote");
    } finally {
      setIsVoting(false);
    }
  };

  const handleResolve = async () => {
    if (!wallet.publicKey) return alert("Connect wallet");
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
    } catch (e) {
      console.error(e);
      alert("Failed to resolve dispute");
    } finally {
      setIsResolving(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet.publicKey) return alert("Connect wallet");
    setIsClaiming(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(disputePda);
      
      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), disputeRecordPubkey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      const KRED_REP_MINT = new PublicKey("11111111111111111111111111111111"); // Replace with actual
      const [winnerTokenAccount] = PublicKey.findProgramAddressSync(
        [wallet.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), KRED_REP_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
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
    } catch (e) {
      console.error(e);
      alert("Failed to claim badge");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 shadow-xl">
      <div className="flex justify-between items-center">
        <h3 className="text-zinc-100 font-bold">Dispute #{contentMint.slice(0, 6)}...</h3>
        {!isResolved ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/30 border border-amber-900/50 text-amber-400 font-mono font-bold text-sm">
            <Clock size={16} />
            <span>{formatTime(timeLeft)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-950/30 border border-blue-900/50 text-blue-400 font-bold text-sm">
            <Gavel size={16} />
            <span>RESOLVED</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-4 border-t border-zinc-800/50 pt-4">
        {timeLeft > 0 && !isResolved ? (
          <div className="flex gap-2 w-full">
            <button
              onClick={() => handleVote(1)}
              disabled={isVoting}
              className="flex-1 py-3 rounded-xl bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 font-medium transition-colors"
            >
              Vote Original
            </button>
            <button
              onClick={() => handleVote(2)}
              disabled={isVoting}
              className="flex-1 py-3 rounded-xl bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 font-medium transition-colors"
            >
              Vote Counterfeit
            </button>
          </div>
        ) : timeLeft === 0 && !isResolved ? (
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="w-full py-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Gavel size={18} /> Resolve Dispute
          </button>
        ) : null}

        {isResolved && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 flex justify-between items-center text-sm">
              <span className="text-zinc-400">Winning Side:</span>
              <span className={winningSide === 1 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {winningSide === 1 ? "Original Creator" : "Challenger"}
              </span>
            </div>
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="w-full py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 text-blue-400 font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <ShieldCheck size={18} /> Mint Reputation Badge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
