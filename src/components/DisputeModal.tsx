import { useState, useEffect } from "react";
import { X, ShieldAlert, FileSearch, CheckCircle2, Lock } from "lucide-react";
import { getExplorerUrl, truncateSig } from "@/lib/utils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import { PublicKey, SystemProgram } from "@solana/web3.js";

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  hash: string;
  pda: string;
}

export default function DisputeModal({ isOpen, onClose, hash, pda }: DisputeModalProps) {
  const [activeTab, setActiveTab] = useState<"zktls" | "jury">("zktls");
  
  // Tab 1 state
  const [web2Url, setWeb2Url] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  
  // Tab 2 state
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [isLocking, setIsLocking] = useState(false);
  const [lockSuccess, setLockSuccess] = useState(false);

  const { connection } = useConnection();
  const wallet = useWallet();

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setWeb2Url("");
      setIsVerifying(false);
      setVerifySuccess(false);
      setEvidenceUrl("");
      setIsLocking(false);
      setLockSuccess(false);
      setActiveTab("zktls");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyZkTLS = () => {
    if (!web2Url) return;
    setIsVerifying(true);
    // Simulate zkTLS Reclaim logic
    setTimeout(() => {
      setIsVerifying(false);
      setVerifySuccess(true);
    }, 2000);
  };

  const handleLockAndChallenge = async () => {
    if (!evidenceUrl || !wallet.publicKey) return;
    setIsLocking(true);
    
    try {
      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      const program = new Program(IDL as Idl, provider);

      const contentRecordPda = new PublicKey(pda);

      await program.methods
        .raiseDispute(evidenceUrl)
        .accounts({
          contentRecord: contentRecordPda,
          challenger: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      setLockSuccess(true);
    } catch (err) {
      console.error("Failed to raise dispute", err);
      alert("Failed to raise dispute. See console.");
    } finally {
      setIsLocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-zinc-800 bg-[#0a0a0d] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/50 p-6 bg-zinc-900/20">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="text-amber-500" size={20} />
              Open Dispute
            </h2>
            <p className="text-xs font-mono text-zinc-500">Asset: {hash.slice(0, 24)}...</p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800/50">
          <button
            onClick={() => setActiveTab("zktls")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "zktls" 
                ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-950/10" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30"
            }`}
          >
            Tier 1: zkTLS Fast-Path
          </button>
          <button
            onClick={() => setActiveTab("jury")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "jury" 
                ? "text-amber-400 border-b-2 border-amber-500 bg-amber-950/10" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30"
            }`}
          >
            Tier 2: Community Jury
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "zktls" ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-4">
                <FileSearch className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                <p className="text-xs leading-relaxed text-emerald-200/80">
                  Instantly revoke stolen assets by proving prior publication on Web2 (e.g. X, Reddit) using zkTLS. If the Web2 timestamp is older than the on-chain commit, you win instantly.
                </p>
              </div>

              {!verifySuccess ? (
                <div className="flex flex-col gap-3">
                  <input 
                    type="url" 
                    placeholder="https://x.com/user/status/123..."
                    value={web2Url}
                    onChange={(e) => setWeb2Url(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                  <button
                    onClick={handleVerifyZkTLS}
                    disabled={!web2Url || isVerifying}
                    className="w-full rounded-xl bg-emerald-600/20 border border-emerald-500/30 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isVerifying ? (
                      <span className="animate-pulse">Generating Zero-Knowledge Proof...</span>
                    ) : (
                      "Verify via zkTLS (Reclaim)"
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <CheckCircle2 className="text-emerald-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-emerald-300">Web2 timestamp verified</h3>
                    <p className="text-xs text-emerald-200/60 mt-1 max-w-[250px] mx-auto">
                      Timestamp &lt; On-Chain Commit. Ready to submit instant revocation.
                    </p>
                  </div>
                  <button onClick={onClose} className="mt-2 w-full rounded-xl bg-emerald-600/20 border border-emerald-500/30 py-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 transition-all">
                    Submit Revocation Tx
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3 rounded-xl border border-amber-900/30 bg-amber-950/10 p-4">
                <ShieldAlert className="text-amber-500 mt-0.5 shrink-0" size={18} />
                <p className="text-xs leading-relaxed text-amber-200/80">
                  No Web2 link? Escalate to a 24-hour Community Staked Jury vote. If the jury sides with you, the asset is revoked and your stake is returned with a reward.
                </p>
              </div>

              {!lockSuccess ? (
                <div className="flex flex-col gap-3">
                  <input 
                    type="text" 
                    placeholder="Evidence URL or IPFS Hash..."
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                  />
                  
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs text-zinc-500">Required Challenger Bond:</span>
                    <span className="text-xs font-mono font-medium text-amber-400">0.05 SOL</span>
                  </div>

                  <button
                    onClick={handleLockAndChallenge}
                    disabled={!evidenceUrl || isLocking}
                    className="w-full rounded-xl bg-amber-600/20 border border-amber-500/30 py-3 text-sm font-medium text-amber-300 hover:bg-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isLocking ? (
                      <span className="animate-pulse flex items-center gap-2"><Lock size={16}/> Locking Bond...</span>
                    ) : (
                      <span className="flex items-center gap-2"><Lock size={16}/> Lock 0.05 SOL & Open Challenge</span>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                    <CheckCircle2 className="text-amber-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-amber-300">Challenge Opened</h3>
                    <p className="text-xs text-amber-200/60 mt-1 max-w-[250px] mx-auto">
                      Your 0.05 SOL bond is locked. Jury voting concludes in 24 hours.
                    </p>
                  </div>
                  <button onClick={onClose} className="mt-2 w-full rounded-xl bg-zinc-800/50 border border-zinc-700/50 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700/50 transition-all">
                    Return to Feed
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
