"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, web3, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import CryptoJS from "crypto-js";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import {
  BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_ID,
  MERKLE_TREE_ADDRESS,
  deriveContentRecordPDA,
} from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────
type StatusType = "idle" | "loading" | "success" | "error" | "warn";
interface StatusState {
  message: string;
  type: StatusType;
}

interface HistoryItem {
  pda: string;
  hash: string;
  status: string;
  timestamp: number;
  txSignature: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────
const truncateSig = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;
const getExplorerUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ─── Status Message Component ─────────────────────────────────
function StatusBanner({ status }: { status: StatusState }) {
  if (!status.message) return null;

  const styleMap: Record<StatusType, string> = {
    idle: "bg-zinc-900/60 border-zinc-800 text-zinc-400",
    loading: "bg-purple-950/20 border-purple-900/40 text-purple-200/90",
    success: "bg-emerald-950/20 border-emerald-900/40 text-emerald-200/90",
    error: "bg-rose-950/20 border-rose-900/40 text-rose-200/90",
    warn: "bg-amber-950/20 border-amber-900/40 text-amber-200/90",
  };

  const dotMap: Record<StatusType, string> = {
    idle: "bg-zinc-500",
    loading: "bg-purple-300 animate-pulse",
    success: "bg-emerald-300",
    error: "bg-rose-400",
    warn: "bg-amber-300",
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs transition-all ${
        styleMap[status.type]
      }`}
    >
      <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotMap[status.type]}`} />
      <p className="leading-relaxed break-all font-mono">{status.message}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;

  // ── Wallet Balance ──────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
    const subId = connection.onAccountChange(publicKey, (acc) =>
      setBalance(acc.lamports / LAMPORTS_PER_SOL)
    );
    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [publicKey, connection]);

  // ── Program Instance ────────────────────────────────────────
  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  }, [connection, wallet]);

  // ── Section 1: Commit & Mint State ──────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pHash, setPHash] = useState<string>("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [minted, setMinted] = useState(false);
  const [metadataUri, setMetadataUri] = useState<string>("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [commitTx, setCommitTx] = useState("");
  const [mintTx, setMintTx] = useState("");
  const [commitStatus, setCommitStatus] = useState<StatusState>({ message: "", type: "idle" });

  const processFile = useCallback(
    async (f: File) => {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setPHash("");
      setCommitted(false);
      setMinted(false);
      setCommitTx("");
      setMintTx("");
      setMetadataUri("");
      setIsDuplicate(false);
      setCommitStatus({ message: "Generating SHA-256 hash...", type: "loading" });

      const buf = await f.arrayBuffer();
      const wordArray = CryptoJS.lib.WordArray.create(buf as ArrayBuffer);
      const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
      setPHash(hash);

      // Pre-flight check: see if PDA exists
      try {
        const [pda] = deriveContentRecordPDA(hash);
        const info = await connection.getAccountInfo(pda);
        if (info) {
          setIsDuplicate(true);
          setCommitStatus({
            message: "Account already exists on-chain for this hash (duplicate content).",
            type: "warn",
          });
        } else {
          setIsDuplicate(false);
          setCommitStatus({ message: "Content hash ready for on-chain commitment.", type: "success" });
        }
      } catch {
        setCommitStatus({ message: "Content hash ready for on-chain commitment.", type: "success" });
      }
    },
    [connection]
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const handleCommit = async () => {
    if (!connected || !pHash || !publicKey || !file || isDuplicate) return;
    const program = getProgram();
    if (!program) return;

    setIsCommitting(true);
    setCommitStatus({ message: "Submitting commit transaction to Solana...", type: "loading" });

    try {
      const [pda] = deriveContentRecordPDA(pHash);
      const sig = await (program.methods as any)
        .commitContent(pHash)
        .accounts({ payer: publicKey, contentRecord: pda, systemProgram: SystemProgram.programId })
        .rpc();

      setCommitTx(sig);
      setCommitted(true);
      setCommitStatus({ message: "Commit recorded on-chain. Pinning metadata to IPFS...", type: "loading" });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("pHash", pHash);

      const res = await fetch("/api/pinata", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "IPFS pinning failed");

      setMetadataUri(data.metadataUri);
      setCommitStatus({ message: "IPFS metadata pinned. Ready to mint cNFT.", type: "success" });
    } catch (err: any) {
      const dup = err?.message?.includes("already in use") || err?.message?.includes("0x0");
      setCommitStatus({
        message: dup
          ? "Account already initialized on-chain for this hash."
          : `Commit transaction failed: ${err?.message ?? "Unknown error"}`,
        type: dup ? "warn" : "error",
      });
      if (dup) setIsDuplicate(true);
      setCommitted(false);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleMint = async () => {
    if (!connected || !pHash || !publicKey || !committed || !metadataUri) return;
    const program = getProgram();
    if (!program) return;

    setIsMinting(true);
    setCommitStatus({ message: "Minting compressed NFT on Solana...", type: "loading" });

    try {
      const [pda] = deriveContentRecordPDA(pHash);
      const [treeConfig] = PublicKey.findProgramAddressSync(
        [MERKLE_TREE_ADDRESS.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      );

      const sig = await (program.methods as any)
        .revealAndMint(metadataUri)
        .accounts({
          creator: publicKey,
          contentRecord: pda,
          treeConfig,
          merkleTree: MERKLE_TREE_ADDRESS,
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_ID,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setMintTx(sig);
      setMinted(true);
      setCommitStatus({ message: "cNFT minted. Originality receipt finalized.", type: "success" });
    } catch (err: any) {
      setCommitStatus({
        message: `Minting failed: ${err?.message ?? "Unknown error"}`,
        type: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  // ── Section 2: Originality Checker State ─────────────────────
  const checkerFileInputRef = useRef<HTMLInputElement>(null);
  const [checkerFile, setCheckerFile] = useState<File | null>(null);
  const [checkerPreviewUrl, setCheckerPreviewUrl] = useState<string | null>(null);
  const [checkerHash, setCheckerHash] = useState<string>("");
  const [checkerResult, setCheckerResult] = useState<{ claimed: boolean; creator?: string; timestamp?: number } | null>(null);
  const [isCheckerLoading, setIsCheckerLoading] = useState(false);
  const [checkerStatus, setCheckerStatus] = useState<StatusState>({ message: "", type: "idle" });

  const processCheckerFile = useCallback(
    async (f: File) => {
      setCheckerFile(f);
      setCheckerPreviewUrl(URL.createObjectURL(f));
      setCheckerHash("");
      setCheckerResult(null);
      setIsCheckerLoading(true);
      setCheckerStatus({ message: "Generating SHA-256 hash...", type: "loading" });

      try {
        const buf = await f.arrayBuffer();
        const wordArray = CryptoJS.lib.WordArray.create(buf as ArrayBuffer);
        const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
        setCheckerHash(hash);
        setCheckerStatus({ message: "Querying blockchain for PDA...", type: "loading" });

        const [pda] = deriveContentRecordPDA(hash);
        
        const program = getProgram();
        if (program) {
          try {
            const record = await (program.account as any).contentRecord.fetch(pda);
            setCheckerResult({
              claimed: true,
              creator: record.creator.toString(),
              timestamp: record.commitTime.toNumber(),
            });
            setCheckerStatus({ message: "Image is already claimed on-chain.", type: "warn" });
          } catch {
            setCheckerResult({ claimed: false });
            setCheckerStatus({ message: "Image is original (not claimed).", type: "success" });
          }
        } else {
          // Fallback if wallet not connected, just check account existence
          const info = await connection.getAccountInfo(pda);
          if (info) {
             setCheckerResult({ claimed: true }); // Can't decode without program easily, but know it exists
             setCheckerStatus({ message: "Image is already claimed on-chain.", type: "warn" });
          } else {
             setCheckerResult({ claimed: false });
             setCheckerStatus({ message: "Image is original (not claimed).", type: "success" });
          }
        }
      } catch (err: any) {
        setCheckerStatus({ message: `Checker failed: ${err?.message}`, type: "error" });
      } finally {
        setIsCheckerLoading(false);
      }
    },
    [connection, getProgram]
  );

  const handleCheckerFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) processCheckerFile(f);
    },
    [processCheckerFile]
  );

  const handleCheckerFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processCheckerFile(f);
    },
    [processCheckerFile]
  );

  const [isBuying, setIsBuying] = useState(false);
  const [licenseTx, setLicenseTx] = useState("");
  
  const handleBuyLicense = async () => {
    if (!connected || !publicKey || !checkerHash || !checkerResult?.creator) return;
    const program = getProgram();
    if (!program) return;

    setIsBuying(true);
    setLicenseTx("");
    setCheckerStatus({ message: "Processing 0.1 SOL license transfer...", type: "loading" });

    try {
      const [pda] = deriveContentRecordPDA(checkerHash);
      const creatorWallet = new web3.PublicKey(checkerResult.creator);

      if (creatorWallet.equals(publicKey)) {
        throw new Error("Self-licensing is not supported for your own wallet.");
      }

      const sig = await (program.methods as any)
        .purchaseLicense(new BN(100_000_000))
        .accounts({
          buyer: publicKey,
          creatorWallet,
          contentRecord: pda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setLicenseTx(sig);
      setCheckerStatus({
        message: `License issued. 0.1 SOL transferred to creator (${truncateSig(creatorWallet.toString())}).`,
        type: "success",
      });
    } catch (err: any) {
      setCheckerStatus({ message: `Transfer failed: ${err?.message ?? "Unknown error"}`, type: "error" });
    } finally {
      setIsBuying(false);
    }
  };

  // ── Section 3: History State ─────────────────────────────────
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);

  const loadHistory = async () => {
    if (!connected || !publicKey) return;
    const program = getProgram();
    if (!program) return;

    setIsHistoryLoading(true);
    try {
      // 1. Fetch ContentRecord accounts where creator == connected wallet
      const records = await (program.account as any).contentRecord.all([
        {
          memcmp: {
            offset: 8, // Discriminator is 8 bytes, so creator pubkey starts at offset 8
            bytes: publicKey.toBase58(),
          },
        },
      ]);

      // 2. Fetch the transaction signature for each record PDA to display in UI
      const items: HistoryItem[] = await Promise.all(
        records.map(async (recordObj: any) => {
          const pda = recordObj.publicKey;
          const data = recordObj.account;

          let txSignature = null;
          try {
            const sigs = await connection.getSignaturesForAddress(pda, { limit: 5 });
            if (sigs.length > 0) {
              // The oldest signature in this small batch is typically the creation tx
              txSignature = sigs[sigs.length - 1].signature;
            }
          } catch (e) {
            console.error("Failed to fetch sig for", pda.toString(), e);
          }

          // Anchor parses enums as objects like { minted: {} }
          const statusKey = Object.keys(data.status)[0] || "unknown";

          return {
            pda: pda.toString(),
            hash: data.pHash,
            status: statusKey,
            timestamp: data.commitTime.toNumber(),
            txSignature,
          };
        })
      );

      // 3. Sort by timestamp descending
      items.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(items);
      setHasFetchedHistory(true);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-purple-900/40 selection:text-purple-200">
      {/* Background ambient particles (fixed, subtle, non-intrusive) */}
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 flex flex-col gap-12">

        {/* Header / Brand */}
        <header className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-4 py-1.5 text-xs font-mono text-zinc-400 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-300/80" />
            Solana Devnet Protocol
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-100 font-heading">
            Kredence
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-lg leading-relaxed font-sans">
            Commit-reveal originality verification &amp; compressed NFT receipt issuance for digital media.
          </p>
        </header>

        {/* Wallet Adapter Bar */}
        <div className="flex flex-col items-center gap-3">
          <WalletMultiButton />
          {connected && balance !== null && (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className={`h-1.5 w-1.5 rounded-full ${balance < 0.01 ? "bg-amber-400" : "bg-emerald-400"}`} />
              {balance < 0.01 ? (
                <span className="text-amber-300/90">
                  Low SOL balance ({balance.toFixed(3)}). Run <code className="text-zinc-300">solana airdrop 10</code>
                </span>
              ) : (
                <span>Balance: {balance.toFixed(4)} SOL</span>
              )}
            </div>
          )}
        </div>

        {/* CARDS (ALWAYS VISIBLE) */}
        <div className="flex flex-col gap-8">

          {/* CARD 1: Commit & Mint */}
          <section className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col gap-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-950/40 border border-purple-800/40 text-purple-200 text-xs font-mono">
                  01
                </div>
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 font-heading">Commit &amp; Mint Content</h2>
                  <p className="text-[11px] text-zinc-400 font-mono">Hash generation, PDA commitment &amp; cNFT creation</p>
                </div>
              </div>
            </div>

            {/* Upload Dropzone */}
            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-xl border border-dashed p-5 text-center cursor-pointer transition-all ${
                isDuplicate
                  ? "border-amber-800/50 bg-amber-950/10"
                  : pHash
                  ? "border-purple-800/40 bg-purple-950/10"
                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
              }`}
            >
              {previewUrl ? (
                <div className="flex items-center gap-4 text-left">
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="h-14 w-14 rounded-lg object-cover border border-zinc-800 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{file?.name}</p>
                    {pHash && (
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
                        pHash: {pHash.slice(0, 24)}…
                      </p>
                    )}
                    {isDuplicate && (
                      <p className="text-[11px] font-mono text-amber-300/90 mt-1">
                        ⚠️ Duplicate registered on-chain
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono flex-shrink-0">Replace</span>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center gap-1.5">
                  <p className="text-xs font-medium text-zinc-300">Select or drop media file</p>
                  <p className="text-[11px] font-mono text-zinc-400">PNG, JPG, WEBP — processed locally via SHA-256</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCommit}
                disabled={!connected || !pHash || isCommitting || committed || isDuplicate}
                className={`rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                  committed
                    ? "border border-purple-800/40 bg-purple-950/30 text-purple-200 cursor-default"
                    : isDuplicate
                    ? "border border-zinc-800 bg-zinc-900/40 text-zinc-400 cursor-not-allowed"
                    : "bg-purple-900/50 hover:bg-purple-800/60 border border-purple-700/50 text-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {!connected ? "Connect Wallet" : committed ? "✓ 1. Committed" : isCommitting ? "Committing..." : "1. Commit Content"}
              </button>

              <button
                onClick={handleMint}
                disabled={!connected || !committed || isMinting || !metadataUri || minted}
                className={`rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                  minted
                    ? "border border-emerald-800/40 bg-emerald-950/30 text-emerald-200 cursor-default"
                    : committed && !metadataUri
                    ? "border border-zinc-800 bg-zinc-900/40 text-zinc-400 cursor-wait"
                    : "bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-700/50 text-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {!connected ? "Connect Wallet" : minted ? "✓ 2. Minted" : isMinting ? "Minting..." : committed && !metadataUri ? "Pinning IPFS..." : "2. Mint cNFT"}
              </button>
            </div>

            {/* Status Banner */}
            <StatusBanner status={commitStatus} />

            {/* Explorer Links */}
            {(commitTx || mintTx) && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800/40">
                {commitTx && (
                  <a
                    href={getExplorerUrl(commitTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-purple-300/80 hover:text-purple-200 transition-colors"
                  >
                    → Commit Tx: {truncateSig(commitTx)}
                  </a>
                )}
                {mintTx && (
                  <a
                    href={getExplorerUrl(mintTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-emerald-300/80 hover:text-emerald-200 transition-colors"
                  >
                    → Mint Tx: {truncateSig(mintTx)}
                  </a>
                )}
              </div>
            )}
          </section>

          {/* CARD 2: Originality Checker */}
          <section className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col gap-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-indigo-200 text-xs font-mono">
                  02
                </div>
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 font-heading">Originality Checker</h2>
                  <p className="text-[11px] text-zinc-400 font-mono">Verify if an image is already claimed on Kredence</p>
                </div>
              </div>
            </div>

            {/* Upload Dropzone for Checker */}
            <div
              onDrop={handleCheckerFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => checkerFileInputRef.current?.click()}
              className={`relative rounded-xl border border-dashed p-5 text-center cursor-pointer transition-all ${
                checkerResult?.claimed === false
                  ? "border-emerald-800/50 bg-emerald-950/10"
                  : checkerResult?.claimed === true
                  ? "border-amber-800/50 bg-amber-950/10"
                  : checkerHash
                  ? "border-indigo-800/40 bg-indigo-950/10"
                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
              }`}
            >
              {checkerPreviewUrl ? (
                <div className="flex items-center gap-4 text-left">
                  <img
                    src={checkerPreviewUrl}
                    alt="preview"
                    className="h-14 w-14 rounded-lg object-cover border border-zinc-800 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <p className="text-[13px] font-medium text-zinc-200 truncate">
                      {checkerFile?.name}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 truncate mt-1">
                      Hash: {checkerHash.slice(0, 12)}...{checkerHash.slice(-12)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <svg className="w-8 h-8 text-zinc-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-sm font-medium text-zinc-300">
                    Select or drop an image to check
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    SHA-256 hash is computed instantly in browser
                  </p>
                </div>
              )}
              <input
                ref={checkerFileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleCheckerFileChange}
              />
            </div>

            {/* Checker Results */}
            {checkerResult && (
              <div
                className={`rounded-xl border p-4 flex flex-col gap-3 ${
                  checkerResult.claimed
                    ? "border-amber-900/50 bg-amber-950/20"
                    : "border-emerald-900/50 bg-emerald-950/20"
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        checkerResult.claimed ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      }`}
                    />
                    <span className={`text-[13px] font-medium ${checkerResult.claimed ? "text-amber-200" : "text-emerald-200"}`}>
                      {checkerResult.claimed ? "Already Claimed" : "Unclaimed (Original)"}
                    </span>
                  </div>
                  
                  <p className={`text-[11px] ${checkerResult.claimed ? "text-amber-200/70" : "text-emerald-200/70"}`}>
                    {checkerResult.claimed
                      ? "This image is registered on the Kredence protocol. You can license it directly from the creator below."
                      : "This image has not been registered. You can claim it using the Commit & Mint card above."}
                  </p>
                </div>

                {checkerResult.claimed && checkerResult.creator && (
                  <div className="mt-1 pt-3 border-t border-amber-900/30 flex flex-col gap-3">
                    <div className="flex flex-col gap-1 text-[11px] font-mono text-amber-200/80">
                      <p>Creator: {checkerResult.creator}</p>
                      {checkerResult.timestamp && (
                        <p>Date: {new Date(checkerResult.timestamp * 1000).toLocaleString()}</p>
                      )}
                    </div>
                    
                    <button
                      onClick={handleBuyLicense}
                      disabled={!connected || isBuying || checkerResult.creator === publicKey?.toString()}
                      className="rounded-xl border border-amber-700/50 bg-amber-900/40 hover:bg-amber-800/50 px-4 py-2.5 text-xs font-medium text-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all mt-1"
                    >
                      {!connected 
                        ? "Connect Wallet to License" 
                        : checkerResult.creator === publicKey?.toString() 
                        ? "You are the creator" 
                        : isBuying 
                        ? "Processing Transfer..." 
                        : "Purchase License (0.1 SOL)"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <StatusBanner status={checkerStatus} />
            
            {licenseTx && (
              <a
                href={getExplorerUrl(licenseTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-amber-300/80 hover:text-amber-200 transition-colors border-t border-zinc-800/40 pt-2"
              >
                → License Tx: {truncateSig(licenseTx)}
              </a>
            )}
          </section>

          {/* CARD 3: My Claims History */}
          <section className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col gap-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-950/40 border border-sky-800/40 text-sky-200 text-xs font-mono">
                  03
                </div>
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 font-heading">My Claims History</h2>
                  <p className="text-[11px] text-zinc-400 font-mono">View your protected assets and on-chain transaction receipts</p>
                </div>
              </div>
              <button
                onClick={loadHistory}
                disabled={!connected || isHistoryLoading}
                className="rounded-xl px-4 py-2 text-xs font-medium bg-sky-900/40 hover:bg-sky-800/50 border border-sky-700/50 text-sky-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isHistoryLoading ? "Loading..." : "Load History"}
              </button>
            </div>

            {!connected ? (
              <div className="text-center py-6 text-zinc-500 text-sm font-medium">
                Connect your wallet to view your history.
              </div>
            ) : hasFetchedHistory && history.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-sm font-medium">
                No claimed images found for this wallet.
              </div>
            ) : history.length > 0 ? (
              <div className="flex flex-col gap-3">
                {history.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/20 hover:bg-zinc-900/40 transition-colors">
                    <div className="flex flex-col gap-1 text-[11px] font-mono">
                      <p className="text-zinc-300">
                        <span className="text-zinc-500">Hash: </span>
                        {item.hash.slice(0, 16)}...{item.hash.slice(-16)}
                      </p>
                      <p className="text-zinc-400">
                        <span className="text-zinc-500">Date: </span>
                        {new Date(item.timestamp * 1000).toLocaleString()}
                      </p>
                    </div>
                    
                    <div className="flex flex-col sm:items-end gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 self-start sm:self-end ${
                        item.status.toLowerCase() === 'minted' 
                          ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/50" 
                          : "bg-purple-950/40 text-purple-300 border border-purple-800/50"
                      }`}>
                        <span className={`h-1 w-1 rounded-full ${item.status.toLowerCase() === 'minted' ? "bg-emerald-400" : "bg-purple-400"}`} />
                        {item.status}
                      </span>
                      {item.txSignature && (
                        <a
                          href={getExplorerUrl(item.txSignature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-sky-400/80 hover:text-sky-300 transition-colors"
                        >
                          Tx: {truncateSig(item.txSignature)} ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

        </div>

        {/* Footer */}
        <footer className="text-center text-[11px] font-mono text-zinc-500 pt-4">
          Kredence Protocol · Anchor Program <span className="text-zinc-400">J8zY5tEUx…jptbp</span>
        </footer>

      </div>
    </main>
  );
}
