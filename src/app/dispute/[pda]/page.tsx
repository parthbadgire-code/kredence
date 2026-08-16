"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import { Gavel, Clock, ExternalLink, ShieldCheck, ArrowLeft, Loader2, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

const KRED_REP_MINT = new PublicKey("6u6qVLPhpwyMy9PbtAA1P8q1PKG1615mohCW6HcuXEAB");

export default function DisputePage() {
  const params = useParams();
  const router = useRouter();
  const pdaStr = params.pda as string;
  
  const { connection } = useConnection();
  const wallet = useWallet();

  const [disputeData, setDisputeData] = useState<any>(null);
  const [evidenceData, setEvidenceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasVoteReceipt, setHasVoteReceipt] = useState(false);
  const [votedFor, setVotedFor] = useState<number | null>(null);
  const [myVoteWeight, setMyVoteWeight] = useState(0);
  const [hasClaimed, setHasClaimed] = useState(false);

  const [isVoting, setIsVoting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const getProgram = () => {
    const providerWallet = wallet.publicKey ? wallet : {
      publicKey: null,
      signTransaction: () => Promise.reject(),
      signAllTransactions: () => Promise.reject(),
    };
    const provider = new AnchorProvider(connection, providerWallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  };

  const fetchDispute = async () => {
    try {
      const program = getProgram();
      const pda = new PublicKey(pdaStr);
      const acctInfo = await connection.getAccountInfo(pda);
      
      if (!acctInfo) {
        setIsLoading(false);
        return;
      }
      
      const decoded = program.coder.accounts.decode("disputeRecord", acctInfo.data);
      setDisputeData(decoded);

      if (decoded.evidenceUrl) {
        const url = decoded.evidenceUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
        try {
          const res = await fetch(url);
          const json = await res.json();
          setEvidenceData(json);
        } catch(e) {
          console.error("Failed to fetch IPFS metadata", e);
        }
      }

      if (wallet.publicKey) {
        const [voteReceiptPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vote_receipt"), pda.toBuffer(), wallet.publicKey.toBuffer()],
          program.programId
        );
        const voteAcct = await connection.getAccountInfo(voteReceiptPda);
        if (voteAcct) {
          setHasVoteReceipt(true);
          if (voteAcct.data.length >= 82) {
            setVotedFor(voteAcct.data[72]);
            setMyVoteWeight(Number(voteAcct.data.readBigUInt64LE(73)));
            setHasClaimed(voteAcct.data[81] === 1);
          } else if (voteAcct.data.length >= 81) {
            setVotedFor(voteAcct.data[72]);
            setMyVoteWeight(Number(voteAcct.data.readBigUInt64LE(73)));
          }
        }
      }
      
    } catch(e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pdaStr) {
      fetchDispute();
      const id = setInterval(fetchDispute, 15000);
      return () => clearInterval(id);
    }
  }, [pdaStr, wallet.publicKey, connection]);

  useEffect(() => {
    if (!disputeData) return;
    if (disputeData.isResolved) {
      setTimeLeft(0);
      return;
    }
    const end = disputeData.endTime.toNumber();
    const tick = () => setTimeLeft(Math.max(0, end - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [disputeData]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#e5e5e7] flex items-center justify-center">
        <BackgroundCanvas />
        <Loader2 className="animate-spin text-purple-500 z-10" size={48} />
      </main>
    );
  }

  if (!disputeData) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#e5e5e7] flex flex-col items-center justify-center gap-4">
        <BackgroundCanvas />
        <h1 className="text-2xl font-bold z-10">Dispute Not Found</h1>
        <Link href="/feed" className="z-10 text-purple-400 hover:text-purple-300 flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Feed
        </Link>
      </main>
    );
  }

  const {
    creator, contentMint, originalVotes, counterfeitVotes, 
    prizePool, totalWinningVotes, isResolved, winningSide
  } = disputeData;

  const totalVotes = originalVotes.toNumber() + counterfeitVotes.toNumber();
  const originalPct = totalVotes > 0 ? Math.round((originalVotes.toNumber() / totalVotes) * 100) : 50;
  const counterfeitPct = 100 - originalPct;
  const prizePoolSOL = prizePool.toNumber() / 1e9;

  let estimatedRewardLamports = 0;
  if (isResolved && totalWinningVotes.toNumber() > 0 && myVoteWeight > 0) {
    estimatedRewardLamports = Math.floor((myVoteWeight * prizePool.toNumber()) / totalWinningVotes.toNumber());
  } else if (totalVotes > 0 && prizePool.toNumber() > 0) {
    estimatedRewardLamports = Math.floor((1000 * prizePool.toNumber()) / (totalVotes + 1000));
  }
  const estimatedRewardSOL = (estimatedRewardLamports / 1e9).toFixed(4);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleVote = async (choice: number) => {
    if (!wallet.publicKey) return alert("Connect wallet to vote");
    setIsVoting(true);
    try {
      const program = getProgram();
      const disputeRecordPubkey = new PublicKey(pdaStr);
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), disputeRecordPubkey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );
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
          voteReceipt: voteReceiptPda,
          voter: wallet.publicKey,
          repTokenAccount,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
      
      alert(`Vote cast for ${choice === 1 ? "Original ✅" : "Counterfeit ❌"}!`);
      fetchDispute();
    } catch(e: any) {
      alert("Vote failed: " + e.message);
    } finally {
      setIsVoting(false);
    }
  };

  const handleResolve = async () => {
    if (!wallet.publicKey) return alert("Connect wallet to resolve");
    setIsResolving(true);
    try {
      const program = getProgram();
      await program.methods.resolveDispute().accounts({ disputeRecord: new PublicKey(pdaStr) } as any).rpc();
      alert("Dispute Resolved!");
      fetchDispute();
    } catch(e: any) {
      alert("Resolve failed: " + e.message);
    } finally {
      setIsResolving(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet.publicKey) return alert("Connect wallet to claim");
    setIsClaiming(true);
    try {
      const program = getProgram();
      const pda = new PublicKey(pdaStr);
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote_receipt"), pda.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );
      const winnerTokenAccount = getAssociatedTokenAddressSync(KRED_REP_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const [mintAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_authority")], program.programId);

      await program.methods.claimReward().accounts({
        disputeRecord: pda,
        voteReceipt: voteReceiptPda,
        kredRepMint: KRED_REP_MINT,
        winnerTokenAccount,
        mintAuthorityPda,
        voter: wallet.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any).rpc();
      
      alert(`🎉 Claimed ${estimatedRewardSOL} SOL + 1 KRED_REP!`);
      fetchDispute();
    } catch(e: any) {
      alert("Claim failed: " + e.message);
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-amber-900/40 selection:text-amber-200 pb-20">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:py-12 flex flex-col gap-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link href="/disputes" className="text-sm font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 mb-2">
              <ArrowLeft size={14} /> Back to Disputes
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100 font-heading flex items-center gap-3">
              <Gavel className="text-amber-400" /> Dispute Details
            </h1>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded-3xl border border-zinc-800 bg-[#0a0a0d]/80 backdrop-blur-md p-6 shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ImageIcon className="text-zinc-400" size={20}/> Evidence File
              </h2>
              {evidenceData?.image ? (
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={evidenceData.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")} alt="Evidence" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-full aspect-video rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                  No image evidence provided.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-[#0a0a0d]/80 backdrop-blur-md p-6 shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ShieldCheck className="text-purple-400" size={20}/> Challenger&apos;s Claim
              </h2>
              <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {evidenceData?.description || "No description provided or evidence data loading..."}
              </div>
              
              {evidenceData?.external_url && (
                <a href={evidenceData.external_url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 bg-blue-900/10 p-3 rounded-lg border border-blue-900/30 w-fit transition-colors">
                  <LinkIcon size={16} />
                  Reference Link
                  <ExternalLink size={14} className="ml-1" />
                </a>
              )}
            </div>
            
            <div className="text-xs text-zinc-600 font-mono flex flex-col gap-1">
              <p>Dispute PDA: {pdaStr}</p>
              <p>Content Mint: {contentMint.toString()}</p>
              <p>Creator: {creator.toString()}</p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-amber-900/30 bg-[#0a0a0d]/90 backdrop-blur-md p-6 shadow-2xl sticky top-8">
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-zinc-100 font-bold text-lg">Voting Status</h3>
                  <div className="text-amber-400 font-mono font-bold text-2xl mt-1">{prizePoolSOL.toFixed(3)} SOL</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mt-1">Prize Pool</div>
                </div>
                {!isResolved ? (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-sm ${timeLeft > 0 ? "bg-amber-950/30 border border-amber-900/50 text-amber-400 animate-pulse" : "bg-zinc-800/50 border border-zinc-700/50 text-zinc-400"}`}>
                    <Clock size={14} /> {timeLeft > 0 ? formatTime(timeLeft) : "Ended"}
                  </div>
                ) : (
                  <div className="px-3 py-1.5 rounded-full bg-blue-900/30 border border-blue-800/50 text-blue-400 font-bold text-sm flex items-center gap-2">
                    <ShieldCheck size={14} /> Resolved
                  </div>
                )}
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-emerald-400 flex items-center gap-1">
                    ✅ Original {timeLeft === 0 && `(${originalPct}%)`}
                  </span>
                  <span className="text-rose-400 flex items-center gap-1">
                    {timeLeft === 0 && `(${counterfeitPct}%)`} Counterfeit ❌
                  </span>
                </div>
                {timeLeft === 0 ? (
                  <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${originalPct}%` }} />
                    <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${counterfeitPct}%` }} />
                  </div>
                ) : (
                  <div className="h-3 w-full bg-zinc-800/80 rounded-full overflow-hidden flex items-center justify-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Hidden during active vote</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-zinc-800/50 pt-6">
                {timeLeft > 0 && !isResolved && (
                  <div className="flex flex-col gap-2 w-full">
                    <button onClick={() => handleVote(1)} disabled={isVoting || votedFor !== null || hasVoteReceipt} className={`w-full py-3 rounded-xl font-bold transition-colors text-sm ${votedFor === 1 || (hasVoteReceipt && !votedFor) ? "bg-emerald-700/60 text-emerald-200 cursor-default" : "bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 disabled:opacity-50"}`}>
                      {votedFor === 1 ? "✓ Voted Original" : "Vote Original"}
                    </button>
                    <button onClick={() => handleVote(2)} disabled={isVoting || votedFor !== null || hasVoteReceipt} className={`w-full py-3 rounded-xl font-bold transition-colors text-sm ${votedFor === 2 ? "bg-rose-700/60 text-rose-200 cursor-default" : "bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 disabled:opacity-50"}`}>
                      {votedFor === 2 ? "✓ Voted Counterfeit" : "Vote Counterfeit"}
                    </button>
                  </div>
                )}

                {timeLeft === 0 && !isResolved && (
                  <button onClick={handleResolve} disabled={isResolving} className="w-full py-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
                    <Gavel size={16} /> {isResolving ? "Resolving..." : "Resolve Dispute"}
                  </button>
                )}

                {isResolved && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1 text-center">
                        <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Winner</span>
                        <span className={`text-base font-bold ${winningSide === 1 ? "text-emerald-400" : "text-rose-400"}`}>
                          {winningSide === 1 ? "✅ Original" : "❌ Counterfeit"}
                        </span>
                      </div>
                      {hasVoteReceipt && (
                        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1 text-center">
                          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Your Reward</span>
                          <span className="text-sm font-bold font-mono text-amber-300">{estimatedRewardSOL} SOL</span>
                          <span className="text-xs font-bold text-blue-400">+ 1 KRED_REP</span>
                        </div>
                      )}
                    </div>

                    {hasVoteReceipt && votedFor === winningSide && !hasClaimed ? (
                      <button onClick={handleClaim} disabled={isClaiming} className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600/40 to-blue-600/40 hover:from-amber-600/50 hover:to-blue-600/50 border border-amber-500/50 text-amber-300 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-base shadow-lg mt-2">
                        <ShieldCheck size={18} /> {isClaiming ? "Claiming..." : `Claim ${estimatedRewardSOL} SOL + Badge`}
                      </button>
                    ) : hasVoteReceipt && votedFor === winningSide && hasClaimed ? (
                      <div className="w-full py-4 rounded-xl bg-emerald-900/30 border border-emerald-700/30 text-emerald-400 font-bold text-center flex items-center justify-center gap-2 mt-2">
                        <ShieldCheck size={18} /> Reward Claimed!
                      </div>
                    ) : hasVoteReceipt && votedFor !== winningSide ? (
                      <div className="w-full py-4 rounded-xl bg-rose-950/30 border border-rose-900/30 text-rose-500/80 font-bold text-center flex items-center justify-center gap-2 mt-2">
                        <ShieldCheck size={18} /> You voted for the loser
                      </div>
                    ) : (
                      <div className="w-full py-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-zinc-500 font-bold text-center flex items-center justify-center gap-2 mt-2">
                        <ShieldCheck size={18} /> Did not vote
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
