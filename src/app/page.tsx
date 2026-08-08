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

// ─── Helpers ──────────────────────────────────────────────────
const truncateSig = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;
const getExplorerUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`;

function calcHammingDistance(h1: string, h2: string): number | null {
  if (h1.length !== 64 || h2.length !== 64) return null;
  let dist = 0;
  for (let i = 0; i < 64; i += 2) {
    const b1 = parseInt(h1.slice(i, i + 2), 16);
    const b2 = parseInt(h2.slice(i, i + 2), 16);
    if (isNaN(b1) || isNaN(b2)) return null;
    let xor = b1 ^ b2;
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

function getSimilarityInfo(distance: number) {
  if (distance === 0) {
    return {
      label: "Identical Hashes",
      color: "text-amber-200/90",
      bg: "bg-amber-950/30 border-amber-800/40",
      progressBg: "bg-amber-300/60",
      percent: 100,
    };
  }
  if (distance <= 50) {
    return {
      label: "High Similarity",
      color: "text-purple-200/90",
      bg: "bg-purple-950/30 border-purple-800/40",
      progressBg: "bg-purple-300/60",
      percent: Math.round(((50 - distance) / 50) * 80 + 15),
    };
  }
  if (distance <= 150) {
    return {
      label: "Moderate Similarity",
      color: "text-indigo-200/90",
      bg: "bg-indigo-950/30 border-indigo-800/40",
      progressBg: "bg-indigo-300/60",
      percent: Math.round(((150 - distance) / 100) * 50),
    };
  }
  return {
    label: "Distinct Content",
    color: "text-emerald-200/90",
    bg: "bg-emerald-950/30 border-emerald-800/40",
    progressBg: "bg-emerald-300/60",
    percent: Math.max(4, Math.round(((256 - distance) / 256) * 20)),
  };
}

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

  // ── Section 2: Similarity Checker State ─────────────────────
  const [simHash1, setSimHash1] = useState("");
  const [simHash2, setSimHash2] = useState("");
  const [simResult, setSimResult] = useState<ReturnType<typeof getSimilarityInfo> & { distance: number } | null>(null);
  const [isSimChecking, setIsSimChecking] = useState(false);
  const [simStatus, setSimStatus] = useState<StatusState>({ message: "", type: "idle" });

  const handleCheckSimilarity = async () => {
    const h1 = simHash1.trim();
    const h2 = simHash2.trim();

    if (h1.length !== 64 || h2.length !== 64) {
      setSimStatus({ message: "Provide two 64-character hex pHashes.", type: "error" });
      return;
    }

    setIsSimChecking(true);
    setSimResult(null);
    setSimStatus({ message: "Executing Hamming distance calculation...", type: "loading" });

    try {
      const distance = calcHammingDistance(h1, h2);
      if (distance === null) throw new Error("Invalid hex formatting in input strings.");

      const program = getProgram();
      if (program && publicKey) {
        await (program.methods as any)
          .checkSimilarity(h1, h2)
          .accounts({ caller: publicKey })
          .rpc();
      }

      const info = getSimilarityInfo(distance);
      setSimResult({ ...info, distance });
      setSimStatus({ message: `Bitwise distance calculated (${distance} / 256 bits).`, type: "success" });
    } catch (err: any) {
      const distance = calcHammingDistance(h1, h2);
      if (distance !== null) {
        const info = getSimilarityInfo(distance);
        setSimResult({ ...info, distance });
        setSimStatus({ message: `Local calculation complete (${distance} / 256 bits).`, type: "success" });
      } else {
        setSimStatus({ message: `Calculation failed: ${err?.message}`, type: "error" });
      }
    } finally {
      setIsSimChecking(false);
    }
  };

  // ── Section 3: Purchase License State ───────────────────────
  const [licenseHash, setLicenseHash] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [licenseTx, setLicenseTx] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<StatusState>({ message: "", type: "idle" });

  const handleBuyLicense = async () => {
    if (!connected || !publicKey || licenseHash.length !== 64) return;
    const program = getProgram();
    if (!program) return;

    setIsBuying(true);
    setLicenseTx("");
    setLicenseStatus({ message: "Resolving on-chain content record...", type: "loading" });

    try {
      const [pda] = deriveContentRecordPDA(licenseHash);
      let creatorWallet: web3.PublicKey;

      try {
        const record = await (program.account as any).contentRecord.fetch(pda);
        creatorWallet = record.creator as web3.PublicKey;
      } catch {
        throw new Error("No record found for this pHash on-chain.");
      }

      if (creatorWallet.equals(publicKey)) {
        throw new Error("Self-licensing is not supported for your own wallet.");
      }

      setLicenseStatus({ message: "Processing 0.1 SOL license transfer...", type: "loading" });

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
      setLicenseStatus({
        message: `License issued. 0.1 SOL transferred to creator (${truncateSig(creatorWallet.toString())}).`,
        type: "success",
      });
    } catch (err: any) {
      setLicenseStatus({ message: `Transfer failed: ${err?.message ?? "Unknown error"}`, type: "error" });
    } finally {
      setIsBuying(false);
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
            Solana Localnet Protocol
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

          {/* CARD 2: Similarity Checker */}
          <section className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col gap-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-indigo-200 text-xs font-mono">
                  02
                </div>
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 font-heading">Hamming Distance Checker</h2>
                  <p className="text-[11px] text-zinc-400 font-mono">Bitwise similarity analysis for content hashes</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <input
                type="text"
                value={simHash1}
                onChange={(e) => setSimHash1(e.target.value.trim())}
                placeholder="Primary pHash (64 hex characters)"
                maxLength={64}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-400 focus:border-indigo-800/70 focus:outline-none transition-colors"
              />
              <input
                type="text"
                value={simHash2}
                onChange={(e) => setSimHash2(e.target.value.trim())}
                placeholder="Secondary pHash (64 hex characters)"
                maxLength={64}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-400 focus:border-indigo-800/70 focus:outline-none transition-colors"
              />
            </div>

            {pHash && (
              <div className="flex gap-3 text-[11px] font-mono text-indigo-300/80">
                <button
                  onClick={() => setSimHash1(pHash)}
                  className="hover:underline transition-all"
                >
                  Set Hash 1 from current file
                </button>
                <span>·</span>
                <button
                  onClick={() => setSimHash2(pHash)}
                  className="hover:underline transition-all"
                >
                  Set Hash 2 from current file
                </button>
              </div>
            )}

            <button
              onClick={handleCheckSimilarity}
              disabled={isSimChecking || simHash1.length !== 64 || simHash2.length !== 64}
              className="rounded-xl border border-indigo-700/50 bg-indigo-900/40 hover:bg-indigo-800/50 px-4 py-2.5 text-xs font-medium text-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isSimChecking ? "Calculating..." : "Compute Similarity"}
            </button>

            {simResult && (
              <div className={`rounded-xl border p-3.5 flex flex-col gap-2.5 ${simResult.bg}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-mono font-medium ${simResult.color}`}>{simResult.label}</span>
                  <span className="font-mono text-zinc-400">{simResult.distance} / 256 bits</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-950/80 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${simResult.progressBg}`}
                    style={{ width: `${simResult.percent}%` }}
                  />
                </div>
              </div>
            )}

            <StatusBanner status={simStatus} />
          </section>

          {/* CARD 3: Purchase License */}
          <section className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col gap-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 text-xs font-mono">
                  03
                </div>
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 font-heading">Content Licensing</h2>
                  <p className="text-[11px] text-zinc-400 font-mono">Direct 0.1 SOL royalty transfer to creator</p>
                </div>
              </div>
            </div>

            <input
              type="text"
              value={licenseHash}
              onChange={(e) => setLicenseHash(e.target.value.trim())}
              placeholder="Target content pHash (64 hex characters)"
              maxLength={64}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-400 focus:border-emerald-800/70 focus:outline-none transition-colors"
            />

            {pHash && licenseHash !== pHash && (
              <button
                onClick={() => setLicenseHash(pHash)}
                className="self-start text-[11px] font-mono text-emerald-300/80 hover:underline transition-all"
              >
                Use current file hash
              </button>
            )}

            <button
              onClick={handleBuyLicense}
              disabled={!connected || isBuying || licenseHash.length !== 64}
              className="rounded-xl border border-emerald-700/50 bg-emerald-900/40 hover:bg-emerald-800/50 px-4 py-2.5 text-xs font-medium text-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {!connected ? "Connect Wallet to Purchase" : isBuying ? "Processing Transfer..." : "Purchase License (0.1 SOL)"}
            </button>

            <StatusBanner status={licenseStatus} />

            {licenseTx && (
              <a
                href={getExplorerUrl(licenseTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-emerald-300/80 hover:text-emerald-200 transition-colors"
              >
                → License Tx: {truncateSig(licenseTx)}
              </a>
            )}
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
