import { useState, useEffect } from "react";
import { X, ShieldAlert, CheckCircle2, Lock, UploadCloud } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import { PublicKey, SystemProgram } from "@solana/web3.js";

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  hash: string;
  pda: string;
  creator: string;
}

export default function DisputeModal({ isOpen, onClose, hash, pda, creator }: DisputeModalProps) {
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  
  const [isLocking, setIsLocking] = useState(false);
  const [lockSuccess, setLockSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const { connection } = useConnection();
  const wallet = useWallet();

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setDescription("");
      setReferenceUrl("");
      setEvidenceFile(null);
      setIsLocking(false);
      setLockSuccess(false);
      setStatusMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLockAndChallenge = async () => {
    if (!description || !wallet.publicKey) return;
    setIsLocking(true);
    
    try {
      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      const program = new Program(IDL as Idl, provider);
      const contentRecordPda = new PublicKey(pda);
      const creatorPubkey = new PublicKey(creator);

      const [disputeRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dispute"), contentRecordPda.toBuffer()],
        program.programId
      );

      // Pre-check: if dispute already exists, don't try to create another
      setStatusMessage("Checking dispute status...");
      const existingDispute = await connection.getAccountInfo(disputeRecordPda);
      if (existingDispute) {
        alert("A dispute is already active for this content. Check the 'Active Disputes' section at the top of the feed to vote!");
        setIsLocking(false);
        onClose();
        return;
      }

      setStatusMessage("Uploading evidence to IPFS...");
      const formData = new FormData();
      formData.append("description", description);
      formData.append("referenceUrl", referenceUrl);
      if (evidenceFile) {
        formData.append("file", evidenceFile);
      }

      const res = await fetch("/api/pinata-evidence", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload evidence");

      setStatusMessage("Opening Challenge on-chain...");
      await program.methods
        .createDispute()
        .accounts({
          disputeRecord: disputeRecordPda,
          contentMint: contentRecordPda,
          creator: creatorPubkey,
          challenger: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      setLockSuccess(true);
    } catch (err: any) {
      console.error("Failed to create dispute", err);
      const msg = err?.message ?? String(err);
      alert("Failed to create dispute: " + msg);
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

        {/* Content */}
        <div className="p-6">
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-xl border border-amber-900/30 bg-amber-950/10 p-4">
              <ShieldAlert className="text-amber-500 mt-0.5 shrink-0" size={18} />
              <p className="text-xs leading-relaxed text-amber-200/80">
                Opening a dispute creates a 24-hour Community Staked Jury vote. Please provide clear evidence of your prior ownership. If the jury sides with you, the asset is revoked and your stake is returned with a reward.
              </p>
            </div>

            {!lockSuccess ? (
              <div className="flex flex-col gap-4">
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Description of Claim *</label>
                  <textarea 
                    placeholder="Explain why you own this content and how it was stolen..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Evidence Image (Optional)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex items-center gap-3 w-full rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400 transition-all hover:bg-zinc-800/50">
                      <UploadCloud size={18} />
                      <span className="truncate">{evidenceFile ? evidenceFile.name : "Click to upload an image"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Reference URL (Optional)</label>
                  <input 
                    type="url" 
                    placeholder="https://x.com/user/status/123..."
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                  />
                </div>
                
                <div className="flex items-center justify-between px-2 py-1 mt-1">
                  <span className="text-xs text-zinc-500">Required Challenger Bond:</span>
                  <span className="text-xs font-mono font-medium text-amber-400">0.05 SOL</span>
                </div>

                <button
                  onClick={handleLockAndChallenge}
                  disabled={!description || isLocking}
                  className="w-full rounded-xl bg-amber-600/20 border border-amber-500/30 py-3 text-sm font-medium text-amber-300 hover:bg-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isLocking ? (
                    <span className="animate-pulse flex items-center gap-2"><Lock size={16}/> {statusMessage}</span>
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
        </div>
      </div>
    </div>
  );
}
