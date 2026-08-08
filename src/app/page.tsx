"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, web3, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import CryptoJS from "crypto-js";
import IDL from "@/lib/idl.json";
import {
  BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_ID,
  deriveContentRecordPDA,
} from "@/lib/constants";

// ─── types ────────────────────────────────────────────────────
type StatusType = "idle" | "loading" | "success" | "error" | "warn";
interface S { message: string; type: StatusType }

// ─── helpers ──────────────────────────────────────────────────
const shortSig = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;
const explorerUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`;

// Pure-JS Hamming distance (mirrors the on-chain Rust function)
function hammingDistance(h1: string, h2: string): number | null {
  if (h1.length !== 64 || h2.length !== 64) return null;
  let dist = 0;
  for (let i = 0; i < 64; i += 2) {
    const b1 = parseInt(h1.slice(i, i + 2), 16);
    const b2 = parseInt(h2.slice(i, i + 2), 16);
    if (isNaN(b1) || isNaN(b2)) return null;
    let xor = b1 ^ b2;
    while (xor) { dist += xor & 1; xor >>= 1; }
  }
  return dist;
}

function hammingLabel(d: number) {
  if (d === 0) return { label: "IDENTICAL", color: "text-red-400", bar: 100, barColor: "bg-red-500" };
  if (d <= 50) return { label: "VERY SIMILAR", color: "text-orange-400", bar: Math.round((50 - d) / 50 * 80 + 15), barColor: "bg-orange-500" };
  if (d <= 150) return { label: "SOMEWHAT SIMILAR", color: "text-yellow-400", bar: Math.round((150 - d) / 100 * 50), barColor: "bg-yellow-500" };
  return { label: "DIFFERENT", color: "text-emerald-400", bar: Math.max(2, Math.round((256 - d) / 256 * 20)), barColor: "bg-emerald-600" };
}

// ─── status dot ──────────────────────────────────────────────
const DOT: Record<StatusType, string> = {
  idle: "bg-gray-600",
  loading: "bg-yellow-400 animate-pulse",
  success: "bg-emerald-400",
  error: "bg-red-400",
  warn: "bg-orange-400",
};
const TEXT: Record<StatusType, string> = {
  idle: "text-gray-500",
  loading: "text-yellow-300",
  success: "text-emerald-300",
  error: "text-red-300",
  warn: "text-orange-300",
};

function StatusLine({ s }: { s: S }) {
  if (!s.message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${DOT[s.type]}`} />
      <p className={`text-sm leading-relaxed ${TEXT[s.type]} break-all`}>{s.message}</p>
    </div>
  );
}

function TxLink({ label, sig, color }: { label: string; sig: string; color: string }) {
  return (
    <a href={explorerUrl(sig)} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-1.5 text-xs ${color} hover:opacity-80 transition-opacity`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}: {shortSig(sig)}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

// ─── step badge ──────────────────────────────────────────────
function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-300
      ${done ? "bg-emerald-500 text-white" : active ? "bg-violet-500 text-white ring-2 ring-violet-400/40" : "bg-white/10 text-gray-500"}`}>
      {done ? "✓" : n}
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────
export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;

  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    connection.getBalance(publicKey).then(b => setBalance(b / LAMPORTS_PER_SOL));
    const id = connection.onAccountChange(publicKey, a => setBalance(a.lamports / LAMPORTS_PER_SOL));
    return () => { connection.removeAccountChangeListener(id); };
  }, [publicKey, connection]);

  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  }, [connection, wallet]);

  // ── commit / mint ─────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pHash, setPHash] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [minted, setMinted] = useState(false);
  const [metadataUri, setMetadataUri] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [commitTx, setCommitTx] = useState("");
  const [mintTx, setMintTx] = useState("");
  const [commitStatus, setCommitStatus] = useState<S>({ message: "", type: "idle" });

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPHash(""); setCommitted(false); setMinted(false);
    setCommitTx(""); setMintTx(""); setMetadataUri(""); setIsDuplicate(false);
    setCommitStatus({ message: "Hashing file…", type: "loading" });

    const buf = await f.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(buf as ArrayBuffer);
    const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
    setPHash(hash);

    // ── Duplicate check: derive PDA and see if it already exists on-chain ──
    const [pda] = deriveContentRecordPDA(hash);
    const info = await connection.getAccountInfo(pda);
    if (info) {
      setIsDuplicate(true);
      setCommitStatus({ message: "⚠️ This content was already committed on-chain. Duplicate content cannot be re-committed.", type: "warn" });
    } else {
      setIsDuplicate(false);
      setCommitStatus({ message: "File hashed successfully. Ready to commit.", type: "success" });
    }
  }, [connection]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleCommit = async () => {
    if (!connected || !pHash || !publicKey || !file || isDuplicate) return;
    const program = getProgram(); if (!program) return;
    setIsCommitting(true);
    setCommitStatus({ message: "1/3 — Sending commit transaction…", type: "loading" });
    try {
      const [pda] = deriveContentRecordPDA(pHash);
      const sig = await (program.methods as any)
        .commitContent(pHash)
        .accounts({ payer: publicKey, contentRecord: pda, systemProgram: SystemProgram.programId })
        .rpc();
      setCommitTx(sig); setCommitted(true);
      setCommitStatus({ message: "2/3 — Committed on-chain! Uploading to IPFS…", type: "loading" });

      const fd = new FormData();
      fd.append("file", file); fd.append("pHash", pHash);
      const res = await fetch("/api/pinata", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "IPFS upload failed");
      setMetadataUri(data.metadataUri);
      setCommitStatus({ message: "3/3 — IPFS metadata ready! Mint your cNFT to finalize.", type: "success" });
    } catch (err: any) {
      const dup = err?.message?.includes("already in use") || err?.message?.includes("0x0");
      setCommitStatus({ message: dup ? "⚠️ Duplicate — already committed on-chain." : `❌ ${err?.message ?? "Commit failed"}`, type: dup ? "warn" : "error" });
      if (dup) setIsDuplicate(true);
      setCommitted(false);
    } finally { setIsCommitting(false); }
  };

  const handleMint = async () => {
    if (!connected || !pHash || !publicKey || !committed || !metadataUri) return;
    const program = getProgram(); if (!program) return;
    setIsMinting(true);
    setCommitStatus({ message: "Sending reveal & mint transaction…", type: "loading" });
    try {
      const [pda] = deriveContentRecordPDA(pHash);
      const [treeConfig] = PublicKey.findProgramAddressSync([Buffer.from("tree")], BUBBLEGUM_PROGRAM_ID);
      const sig = await (program.methods as any)
        .revealAndMint(metadataUri)
        .accounts({ creator: publicKey, contentRecord: pda, treeConfig, merkleTree: treeConfig,
          logWrapper: SPL_NOOP_PROGRAM_ID, compressionProgram: SPL_ACCOUNT_COMPRESSION_ID,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID, systemProgram: SystemProgram.programId })
        .rpc();
      setMintTx(sig); setMinted(true);
      setCommitStatus({ message: "🎉 cNFT minted! Proof of originality permanently on-chain.", type: "success" });
    } catch (err: any) {
      setCommitStatus({ message: `❌ Mint failed: ${err?.message ?? "Unknown error"}`, type: "error" });
    } finally { setIsMinting(false); }
  };

  // ── license ───────────────────────────────────────────────
  const [licenseHash, setLicenseHash] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [licenseTx, setLicenseTx] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<S>({ message: "", type: "idle" });

  const handleBuyLicense = async () => {
    if (!connected || !publicKey || licenseHash.length !== 64) return;
    const program = getProgram(); if (!program) return;
    setIsBuying(true); setLicenseTx("");
    setLicenseStatus({ message: "Fetching content record…", type: "loading" });
    try {
      const [pda] = deriveContentRecordPDA(licenseHash);
      let creatorWallet: web3.PublicKey;
      try {
        const record = await program.account.contentRecord.fetch(pda);
        creatorWallet = record.creator as web3.PublicKey;
      } catch {
        throw new Error("No content found for this hash. Verify it has been committed on-chain.");
      }
      if (creatorWallet.equals(publicKey)) throw new Error("You are the creator — cannot self-license.");
      setLicenseStatus({ message: "Sending purchase transaction…", type: "loading" });
      const sig = await (program.methods as any)
        .purchaseLicense(new BN(100_000_000))
        .accounts({ buyer: publicKey, creatorWallet, contentRecord: pda, systemProgram: SystemProgram.programId })
        .rpc();
      setLicenseTx(sig);
      setLicenseStatus({ message: `✅ License purchased. 0.1 SOL sent to ${creatorWallet.toString().slice(0, 8)}…`, type: "success" });
    } catch (err: any) {
      setLicenseStatus({ message: `❌ ${err?.message ?? "Purchase failed."}`, type: "error" });
    } finally { setIsBuying(false); }
  };

  // ── similarity checker ────────────────────────────────────
  const [simHash1, setSimHash1] = useState("");
  const [simHash2, setSimHash2] = useState("");
  const [simResult, setSimResult] = useState<{ distance: number; label: string; barColor: string; color: string; bar: number } | null>(null);
  const [isSimChecking, setIsSimChecking] = useState(false);
  const [simStatus, setSimStatus] = useState<S>({ message: "", type: "idle" });

  const handleCheckSimilarity = async () => {
    const h1 = simHash1.trim(); const h2 = simHash2.trim();
    if (h1.length !== 64 || h2.length !== 64) {
      setSimStatus({ message: "Both hashes must be exactly 64 hex characters.", type: "error" }); return;
    }
    setIsSimChecking(true); setSimResult(null);
    setSimStatus({ message: "Computing on-chain via Kredence helper…", type: "loading" });

    try {
      // Compute locally first for instant feedback
      const d = hammingDistance(h1, h2);
      if (d === null) throw new Error("Invalid hex in hashes.");

      // Then confirm on-chain (calls the program instruction that emits the SimilarityChecked event)
      const program = getProgram();
      if (program && publicKey) {
        await (program.methods as any)
          .checkSimilarity(h1, h2)
          .accounts({ caller: publicKey })
          .rpc();
      }
      setSimResult(hammingLabel(d));
      setSimStatus({ message: `Hamming distance: ${d} bits out of 256 total.`, type: "success" });
    } catch (err: any) {
      // If on-chain call fails, fall back to local result
      const d = hammingDistance(h1, h2);
      if (d !== null) {
        setSimResult(hammingLabel(d));
        setSimStatus({ message: `Hamming distance: ${d} bits (computed locally — on-chain call failed).`, type: "success" });
      } else {
        setSimStatus({ message: `❌ ${err?.message}`, type: "error" });
      }
    } finally { setIsSimChecking(false); }
  };

  // ─────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#080B14] text-white">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-violet-700/20 blur-[120px]" />
        <div className="absolute top-1/2 -left-20 w-[400px] h-[400px] rounded-full bg-blue-700/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-emerald-700/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-16 flex flex-col gap-12">

        {/* ── Header ─────────────────────────────────── */}
        <div className="text-center flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 mx-auto bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Localnet · Solana
          </div>
          <h1 className="text-6xl font-black tracking-tight bg-gradient-to-br from-white via-violet-200 to-violet-500 bg-clip-text text-transparent">
            Kredence
          </h1>
          <p className="text-gray-400 text-base max-w-sm mx-auto">
            Prove content originality on-chain with Commit-Reveal & Compressed NFTs
          </p>
        </div>

        {/* ── Wallet ─────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <WalletMultiButton className="!bg-violet-600 hover:!bg-violet-500 !rounded-xl !font-semibold !transition-all !duration-200 !shadow-lg !shadow-violet-900/50" />
          {connected && balance !== null && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${
              balance < 0.01 ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/10 bg-white/5 text-gray-400"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${balance < 0.01 ? "bg-red-400" : "bg-emerald-400"}`} />
              {balance < 0.01
                ? "Low SOL — run: solana airdrop 10 <address>"
                : `${balance.toFixed(4)} SOL`}
            </div>
          )}
        </div>

        {!connected && (
          <p className="text-center text-gray-600 text-sm">Connect your wallet above to get started.</p>
        )}

        {connected && (
          <div className="flex flex-col gap-6">

            {/* ─ CARD 1: Commit & Mint ─────────────────── */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <StepBadge n={1} active={!committed} done={committed} />
                  <StepBadge n={2} active={committed && !!metadataUri && !minted} done={minted} />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">Commit &amp; Mint Your Content</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Hash → Commit on-chain → Upload to IPFS → Mint cNFT</p>
                </div>
              </div>

              <div className="p-6 flex flex-col gap-5">
                {/* Drop zone */}
                <div
                  onDrop={handleFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative w-full rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group overflow-hidden
                    ${isDuplicate ? "border-orange-500/60 bg-orange-500/5"
                    : pHash ? "border-violet-500/50 bg-violet-500/5"
                    : "border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5"}`}
                >
                  {preview ? (
                    <div className="flex items-center gap-4 p-4">
                      <img src={preview} alt="preview" className="h-16 w-16 object-cover rounded-lg flex-shrink-0 ring-1 ring-white/10" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{file?.name}</p>
                        {pHash && (
                          <p className="text-xs font-mono text-gray-500 mt-1 truncate">{pHash.slice(0, 32)}…</p>
                        )}
                        {isDuplicate && (
                          <p className="text-xs text-orange-400 mt-1 font-medium">⚠️ Already committed on-chain</p>
                        )}
                      </div>
                      <div className="ml-auto text-xs text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0">
                        Click to change
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 px-6 text-center">
                      <div className="text-3xl mb-2">📂</div>
                      <p className="text-gray-400 text-sm font-medium">Drop your image here</p>
                      <p className="text-gray-600 text-xs mt-1">or click to browse — PNG, JPG, WEBP</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </div>

                {/* Duplicate warning banner */}
                {isDuplicate && (
                  <div className="flex gap-3 items-start rounded-xl bg-orange-500/10 border border-orange-500/30 px-4 py-3">
                    <span className="text-lg flex-shrink-0">🔒</span>
                    <div>
                      <p className="text-sm font-semibold text-orange-300">Duplicate Content Detected</p>
                      <p className="text-xs text-orange-400/80 mt-0.5">
                        A content record with this exact hash already exists on-chain. The Kredence smart contract enforces uniqueness — re-committing is blocked at the VM level.
                      </p>
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCommit}
                    disabled={!pHash || isCommitting || committed || isDuplicate}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200
                      ${committed ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 cursor-default"
                      : isDuplicate ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 disabled:bg-white/5 disabled:text-gray-600 disabled:shadow-none"}`}
                  >
                    {committed ? "✓ Committed" : isCommitting ? "Committing…" : "1. Commit Content"}
                  </button>
                  <button
                    onClick={handleMint}
                    disabled={!committed || isMinting || !metadataUri || minted}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200
                      ${minted ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 cursor-default"
                      : committed && !metadataUri ? "bg-white/5 text-gray-600 border border-white/10 cursor-wait"
                      : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/40 disabled:bg-white/5 disabled:text-gray-600 disabled:shadow-none"}`}
                  >
                    {minted ? "✓ Minted" : isMinting ? "Minting…" : (committed && !metadataUri) ? "⏳ IPFS…" : "2. Mint cNFT"}
                  </button>
                </div>

                {/* Status + links */}
                <StatusLine s={commitStatus} />
                <div className="flex flex-col gap-1.5">
                  {commitTx && <TxLink label="Commit Tx" sig={commitTx} color="text-blue-400" />}
                  {mintTx && <TxLink label="Mint Tx" sig={mintTx} color="text-violet-400" />}
                </div>
              </div>
            </div>

            {/* ─ CARD 2: Similarity Checker ────────────── */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs">≈</span>
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">Hamming Distance Checker</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Detect visual similarity between two SHA-256 hashes</p>
                </div>
              </div>

              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2.5">
                  <input
                    value={simHash1}
                    onChange={e => setSimHash1(e.target.value.trim())}
                    placeholder="Hash 1 — 64 hex chars"
                    maxLength={64}
                    className="w-full bg-black/30 border border-white/10 focus:border-cyan-500/60 outline-none rounded-xl px-4 py-3 text-sm font-mono text-gray-300 placeholder-gray-700 transition-colors"
                  />
                  <input
                    value={simHash2}
                    onChange={e => setSimHash2(e.target.value.trim())}
                    placeholder="Hash 2 — 64 hex chars"
                    maxLength={64}
                    className="w-full bg-black/30 border border-white/10 focus:border-cyan-500/60 outline-none rounded-xl px-4 py-3 text-sm font-mono text-gray-300 placeholder-gray-700 transition-colors"
                  />
                </div>

                {/* Quick fill buttons */}
                {pHash && (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setSimHash1(pHash)}
                      className="text-xs text-cyan-500 hover:text-cyan-400 underline transition-colors">
                      Fill Hash 1 from current file
                    </button>
                    <button onClick={() => setSimHash2(pHash)}
                      className="text-xs text-cyan-500 hover:text-cyan-400 underline transition-colors">
                      Fill Hash 2 from current file
                    </button>
                  </div>
                )}

                <button
                  onClick={handleCheckSimilarity}
                  disabled={isSimChecking || simHash1.length !== 64 || simHash2.length !== 64}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-white/5 disabled:text-gray-600 text-white transition-all duration-200 shadow-lg shadow-cyan-900/30 disabled:shadow-none"
                >
                  {isSimChecking ? "Computing…" : "Check Similarity On-Chain"}
                </button>

                {simResult && (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${simResult.color}`}>{simResult.label}</span>
                      <span className="text-xs text-gray-500 font-mono">{simStatus.message.match(/\d+/)?.[0]} / 256 bits</span>
                    </div>
                    {/* similarity bar */}
                    <div className="w-full bg-white/5 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 ${simResult.barColor}`}
                        style={{ width: `${simResult.bar}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Bar shows <span className="text-white">similarity</span> — longer bar = more similar. Distance 0 = identical files, 256 = completely different.
                    </p>
                  </div>
                )}

                <StatusLine s={simStatus} />
              </div>
            </div>

            {/* ─ CARD 3: Buy License ───────────────────── */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs">🛒</span>
                </div>
                <div>
                  <h2 className="font-semibold text-white text-sm">Purchase a Content License</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Pay 0.1 SOL directly to the on-chain creator wallet</p>
                </div>
              </div>

              <div className="p-6 flex flex-col gap-4">
                <input
                  value={licenseHash}
                  onChange={e => setLicenseHash(e.target.value.trim())}
                  placeholder="Paste the content pHash (64 hex chars) to license…"
                  maxLength={64}
                  className="w-full bg-black/30 border border-white/10 focus:border-emerald-500/60 outline-none rounded-xl px-4 py-3 text-sm font-mono text-gray-300 placeholder-gray-700 transition-colors"
                />
                {pHash && licenseHash !== pHash && (
                  <button onClick={() => setLicenseHash(pHash)}
                    className="text-xs text-emerald-500 hover:text-emerald-400 underline transition-colors self-start">
                    Use current file hash
                  </button>
                )}
                <button
                  onClick={handleBuyLicense}
                  disabled={isBuying || licenseHash.length !== 64}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/5 disabled:text-gray-600 text-white transition-all duration-200 shadow-lg shadow-emerald-900/30 disabled:shadow-none"
                >
                  {isBuying ? "Processing…" : "Buy License · 0.1 SOL"}
                </button>
                <StatusLine s={licenseStatus} />
                {licenseTx && <TxLink label="License Tx" sig={licenseTx} color="text-emerald-400" />}
              </div>
            </div>

          </div>
        )}

        {/* ── Footer ─────────────────────────────────── */}
        <p className="text-center text-gray-700 text-xs">
          Kredence · Solana Localnet · Anchor {" "}
          <span className="text-gray-600">J8zY5tEUx…jptbp</span>
        </p>
      </div>
    </main>
  );
}
