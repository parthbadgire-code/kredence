import { useState, useEffect } from "react";
import { Clock, AlertTriangle, ShieldCheck, User, Gavel, Coins, CheckCircle2 } from "lucide-react";
import DisputeModal from "./DisputeModal";
import { getExplorerUrl, truncateSig } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import { PublicKey, SystemProgram } from "@solana/web3.js";

interface FeedCardProps {
  pda: string;
  hash: string;
  creator: string;
  timestamp: number;
  channel: string;
  disputeStatus: "active" | "disputed";
  metadataUri?: string;
  isDisputed?: boolean;
  isResolved?: boolean;
  creatorVotes?: number;
  challengerVotes?: number;
  winnerIsCreator?: boolean;
  evidenceUrl?: string;
}

export default function FeedCard({
  pda,
  hash,
  creator,
  timestamp,
  channel,
  disputeStatus,
  metadataUri,
  isDisputed,
  isResolved,
  creatorVotes = 0,
  challengerVotes = 0,
  winnerIsCreator,
  evidenceUrl,
}: FeedCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<{description?: string, external_url?: string, image?: string} | null>(null);
  const [creatorUsername, setCreatorUsername] = useState<string>("");

  const { connection } = useConnection();
  const wallet = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isLicensing, setIsLicensing] = useState(false);
  const [hasLicensed, setHasLicensed] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  };

  useEffect(() => {
    if (!metadataUri || !metadataUri.startsWith("ipfs://")) return;
    
    const fetchMetadata = async () => {
      try {
        const hash = metadataUri.replace("ipfs://", "");
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${hash}`);
        const data = await res.json();
        if (data.image && data.image.startsWith("ipfs://")) {
          setImageUrl(data.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/"));
        }
      } catch (err) {
        console.error("Failed to load IPFS metadata", err);
      }
    };
    fetchMetadata();
  }, [metadataUri]);

  useEffect(() => {
    if (!evidenceUrl || !evidenceUrl.startsWith("ipfs://")) return;
    
    const fetchEvidence = async () => {
      try {
        const hash = evidenceUrl.replace("ipfs://", "");
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${hash}`);
        const data = await res.json();
        setEvidenceData(data);
      } catch (err) {
        console.error("Failed to load IPFS evidence", err);
      }
    };
    fetchEvidence();
  }, [evidenceUrl]);

  useEffect(() => {
    if (wallet.publicKey) {
      const stored = JSON.parse(localStorage.getItem(`licenses_${wallet.publicKey.toString()}`) || "[]");
      if (stored.includes(hash)) {
        setHasLicensed(true);
      }
    }
  }, [wallet.publicKey, hash]);

  useEffect(() => {
    // Attempt to load custom username from localStorage
    const savedName = localStorage.getItem(`kredence_username_${creator}`);
    if (savedName) {
      setCreatorUsername(savedName);
    } else {
      setCreatorUsername(truncateSig(creator));
    }
  }, [creator]);

  // Generate a deterministic abstract pattern based on the hash (Option A)
  const generatePattern = (hashString: string) => {
    const colors = [
      "from-purple-900 to-indigo-900",
      "from-emerald-900 to-teal-900",
      "from-rose-900 to-pink-900",
      "from-amber-900 to-orange-900",
      "from-sky-900 to-blue-900",
    ];
    // basic hash to number
    let sum = 0;
    for (let i = 0; i < hashString.length; i++) sum += hashString.charCodeAt(i);
    const color = colors[sum % colors.length];
    
    // some pseudo-random SVG shapes
    return (
      <div className={`w-full h-48 sm:h-64 rounded-xl bg-gradient-to-br ${color} overflow-hidden relative flex items-center justify-center border border-zinc-800/50`}>
         {/* Generate an identicon-like abstract visual */}
         <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: `radial-gradient(circle at ${sum%100}% ${(sum*3)%100}%, white, transparent 40%)` }} />
         <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: `radial-gradient(circle at ${(sum*7)%100}% ${(sum*5)%100}%, black, transparent 60%)` }} />
         
         <div className="flex flex-col items-center gap-2 z-10 backdrop-blur-md bg-black/40 px-4 py-2 rounded-xl border border-white/10">
            <span className="text-white/60 text-[10px] uppercase tracking-widest font-mono">Fingerprint</span>
            <span className="text-white/90 text-sm font-mono tracking-wider">{hash.slice(0,16)}...</span>
         </div>
      </div>
    );
  };

  const handleVote = async (voteForCreator: boolean) => {
    if (!wallet.publicKey) return alert("Connect wallet to vote");
    setIsVoting(true);
    try {
      const program = getProgram();
      const contentRecordPda = new PublicKey(pda);
      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote"), contentRecordPda.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .castVote(voteForCreator)
        .accounts({
          contentRecord: contentRecordPda,
          voteReceipt,
          signer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
      
      alert("Vote cast successfully!");
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("already in use") || err.message.includes("0x0")) {
        alert("🚫 One vote per wallet!");
      } else {
        alert("Failed to vote. See console.");
      }
    } finally {
      setIsVoting(false);
    }
  };

  const handleResolve = async () => {
    if (!wallet.publicKey) return alert("Connect wallet to resolve");
    setIsResolving(true);
    try {
      const program = getProgram();
      const contentRecordPda = new PublicKey(pda);
      
      // We need creator and challenger public keys, for hackathon we assume 
      // the data includes challenger but since we didn't pass it in FeedCardProps,
      // we just use dummy or fetch the account directly. 
      // Actually, resolve_dispute needs them to send SOL.
      const record = await (program.account as any).contentRecord.fetch(contentRecordPda);

      await program.methods
        .resolveDispute()
        .accounts({
          contentRecord: contentRecordPda,
          creator: record.creator,
          challenger: record.challenger,
          signer: wallet.publicKey,
        } as any)
        .rpc();

      alert("Dispute Resolved & Slashed!");
    } catch (err) {
      console.error(err);
      alert("Failed to resolve dispute. See console.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet.publicKey) return alert("Connect wallet to claim");
    setIsClaiming(true);
    try {
      const program = getProgram();
      const contentRecordPda = new PublicKey(pda);
      const [voteReceipt] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote"), contentRecordPda.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .claimReward()
        .accounts({
          contentRecord: contentRecordPda,
          voteReceipt,
          voter: wallet.publicKey,
        } as any)
        .rpc();

      alert("Yield Claimed! Receipt PDA burned.");
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("Account does not exist") || err.message.includes("VotedForLoser")) {
        alert("You did not vote for the winner, or already claimed.");
      } else {
        alert("Failed to claim reward. See console.");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const handleLicense = async () => {
    if (!wallet.publicKey) return alert("Connect wallet to license");
    setIsLicensing(true);
    try {
      const program = getProgram();
      const contentRecordPda = new PublicKey(pda);
      const creatorPubkey = new PublicKey(creator);

      await program.methods
        .purchaseLicense(new BN(100_000_000))
        .accounts({
          buyer: wallet.publicKey,
          creatorWallet: creatorPubkey,
          contentRecord: contentRecordPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const stored = JSON.parse(localStorage.getItem(`licenses_${wallet.publicKey.toString()}`) || "[]");
      if (!stored.includes(hash)) {
        stored.push(hash);
        localStorage.setItem(`licenses_${wallet.publicKey.toString()}`, JSON.stringify(stored));
      }
      setHasLicensed(true);
      alert("License Purchased Successfully for 0.1 SOL!");
    } catch (err: any) {
      console.error(err);
      alert("Failed to purchase license. See console.");
    } finally {
      setIsLicensing(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-5 sm:p-6 shadow-xl transition-all hover:border-zinc-700/70">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800/50 border border-zinc-700 text-xs font-semibold text-zinc-300">
              {channel}
            </span>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={`https://api.dicebear.com/7.x/identicon/svg?seed=${creator}`} 
                alt="Avatar" 
                className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700" 
              />
              <span className="text-sm font-medium text-zinc-300">
                {creatorUsername}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-zinc-600">
              <Clock size={12} />
              <span>{new Date(timestamp * 1000).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${
            isResolved
              ? "bg-blue-950/30 text-blue-400 border-blue-900/50"
              : isDisputed 
              ? "bg-amber-950/30 text-amber-400 border-amber-900/50"
              : "bg-emerald-950/30 text-emerald-400 border-emerald-900/50" 
          }`}>
            {isResolved ? <Gavel size={12} /> : isDisputed ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
            {isResolved ? "RESOLVED" : isDisputed ? "IN DISPUTE" : "OPTIMISTICALLY ACTIVE"}
          </div>
        </div>

        {/* Content Preview */}
        {imageUrl ? (
          <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-zinc-800/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Content" className="w-full h-full object-cover" />
          </div>
        ) : (
          generatePattern(hash)
        )}

        {/* Challenger Evidence Preview */}
        {isDisputed && evidenceData && (
          <div className="flex flex-col gap-3 p-4 rounded-xl border border-amber-900/30 bg-amber-950/10 mt-2">
            <h4 className="text-sm font-semibold text-amber-500 flex items-center gap-2">
              <AlertTriangle size={16} />
              Challenger&apos;s Evidence
            </h4>
            {evidenceData.description && (
              <p className="text-sm text-amber-200/80 leading-relaxed bg-black/20 p-3 rounded-lg border border-amber-900/20">
                &quot;{evidenceData.description}&quot;
              </p>
            )}
            {evidenceData.external_url && (
              <a 
                href={evidenceData.external_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline break-all"
              >
                {evidenceData.external_url}
              </a>
            )}
            {evidenceData.image && (
              <div className="w-32 h-32 rounded-lg overflow-hidden border border-amber-900/50 mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={evidenceData.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")} alt="Evidence" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          {!isDisputed && !isResolved && (
            <>
              {hasLicensed ? (
                <button
                  disabled
                  className="flex-1 rounded-xl bg-purple-950/30 border border-purple-900/50 px-4 py-3 text-sm font-medium text-purple-400 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> LICENSED
                </button>
              ) : (
                <button
                  disabled={isLicensing}
                  onClick={handleLicense}
                  className="flex-1 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 border border-purple-700/50 px-4 py-3 text-sm font-medium text-purple-100 transition-all disabled:opacity-50"
                >
                  {isLicensing ? "Purchasing..." : "License for 0.1 SOL"}
                </button>
              )}
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex-1 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/60 border border-zinc-700/50 px-4 py-3 text-sm font-medium text-zinc-300 transition-all"
              >
                Challenge / Dispute
              </button>
            </>
          )}

          {isDisputed && !isResolved && (
            <div className="flex flex-col w-full gap-2 border-t border-zinc-800/50 pt-4 mt-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400 px-2 mb-1">
                <span>Jury Voting Active</span>
                <span>Creator: {creatorVotes} | Challenger: {challengerVotes}</span>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={isVoting}
                  onClick={() => handleVote(true)}
                  className="flex-1 rounded-xl bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-700/30 px-3 py-2 text-xs font-medium text-emerald-300 transition-all"
                >
                  Vote Original
                </button>
                <button
                  disabled={isVoting}
                  onClick={() => handleVote(false)}
                  className="flex-1 rounded-xl bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/30 px-3 py-2 text-xs font-medium text-amber-300 transition-all"
                >
                  Vote Stolen
                </button>
                <button
                  disabled={isResolving}
                  onClick={handleResolve}
                  className="flex-1 rounded-xl bg-blue-900/30 hover:bg-blue-800/40 border border-blue-700/30 px-3 py-2 text-xs font-medium text-blue-300 transition-all flex items-center justify-center gap-1"
                >
                  <Gavel size={14}/> Resolve & Slash
                </button>
              </div>
            </div>
          )}

          {isResolved && (
            <div className="flex flex-col w-full gap-2 border-t border-zinc-800/50 pt-4 mt-2">
              <div className="flex items-center justify-between text-xs font-medium px-2 mb-1">
                <span className="text-zinc-400">Winner:</span>
                <span className={winnerIsCreator ? "text-emerald-400" : "text-amber-400"}>
                  {winnerIsCreator ? "Original Creator" : "Challenger"}
                </span>
              </div>
              <button
                disabled={isClaiming}
                onClick={handleClaim}
                className="w-full rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 px-4 py-3 text-sm font-medium text-emerald-300 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse hover:animate-none"
              >
                <Coins size={16}/> Claim Yield
              </button>
            </div>
          )}
        </div>
      </div>

      <DisputeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        hash={hash}
        pda={pda}
        creator={creator}
      />
    </>
  );
}
