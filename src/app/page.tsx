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

type StatusType = "idle" | "loading" | "success" | "error";
interface StatusState { message: string; type: StatusType; }

// ─── tiny helpers ───────────────────────────────────────────
const shortSig = (s: string) => `${s.slice(0, 8)}…${s.slice(-8)}`;
const explorerHref = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`;

const STATUS_COLOR: Record<StatusType, string> = {
  idle: "text-gray-400",
  loading: "text-yellow-400",
  success: "text-green-400",
  error: "text-red-400",
};

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;

  // ── balance ──────────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    const fetch = async () => {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / LAMPORTS_PER_SOL);
    };
    fetch();
    const id = connection.onAccountChange(publicKey, (acc) => {
      setBalance(acc.lamports / LAMPORTS_PER_SOL);
    });
    return () => { connection.removeAccountChangeListener(id); };
  }, [publicKey, connection]);

  // ── commit/mint state ────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [pHash, setPHash] = useState("");
  const [committed, setCommitted] = useState(false);
  const [minted, setMinted] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [metadataUri, setMetadataUri] = useState("");
  const [commitTxSig, setCommitTxSig] = useState("");
  const [mintTxSig, setMintTxSig] = useState("");
  const [commitStatus, setCommitStatus] = useState<StatusState>({ message: "", type: "idle" });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── license state ────────────────────────────────────────
  const [licenseHash, setLicenseHash] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<StatusState>({ message: "", type: "idle" });
  const [licenseTxSig, setLicenseTxSig] = useState("");

  // ── anchor program ───────────────────────────────────────
  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  }, [connection, wallet]);

  // ── file processing ──────────────────────────────────────
  const processFile = (f: File) => {
    setFile(f);
    setPHash("");
    setCommitted(false);
    setMinted(false);
    setCommitTxSig("");
    setMintTxSig("");
    setMetadataUri("");
    setCommitStatus({ message: "Hashing file…", type: "loading" });

    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!buf) return;
      const wordArray = CryptoJS.lib.WordArray.create(buf as ArrayBuffer);
      const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
      setPHash(hash);
      setCommitStatus({ message: "File hashed ✓ — ready to commit.", type: "success" });
    };
    reader.readAsArrayBuffer(f);
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }, []);

  // ── commit ───────────────────────────────────────────────
  const handleCommit = async () => {
    if (!connected || !pHash || !publicKey || !file) return;
    const program = getProgram();
    if (!program) return;

    setIsCommitting(true);
    setCommitStatus({ message: "Step 1/3: Sending commit transaction…", type: "loading" });

    try {
      const [contentRecordPDA] = deriveContentRecordPDA(pHash);

      const sig = await (program.methods as any)
        .commitContent(pHash)
        .accounts({ payer: publicKey, contentRecord: contentRecordPDA, systemProgram: SystemProgram.programId })
        .rpc();

      setCommitTxSig(sig);
      setCommitted(true);
      setCommitStatus({ message: "Step 2/3: Committed on-chain! Uploading to IPFS…", type: "loading" });

      // Upload to IPFS
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pHash", pHash);

      const res = await fetch("/api/pinata", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "IPFS upload failed");

      setMetadataUri(data.metadataUri);
      setCommitStatus({ message: "Step 3/3: IPFS ready! You can now mint your cNFT.", type: "success" });
    } catch (err: any) {
      console.error(err);
      // Anchor error 0 (AccountAlreadyInitialized) means hash was committed before
      const isDuplicate =
        err?.message?.includes("already in use") ||
        err?.message?.includes("0x0") ||
        err?.message?.includes("already been processed");
      const msg = isDuplicate
        ? "⚠️ This content was already committed on-chain (duplicate hash)."
        : `❌ ${err?.message ?? "Commit failed."}`;
      setCommitStatus({ message: msg, type: "error" });
      setCommitted(false);
    } finally {
      setIsCommitting(false);
    }
  };

  // ── mint ─────────────────────────────────────────────────
  const handleMint = async () => {
    if (!connected || !pHash || !publicKey || !committed || !metadataUri) return;
    const program = getProgram();
    if (!program) return;

    setIsMinting(true);
    setCommitStatus({ message: "Sending reveal & mint transaction…", type: "loading" });

    try {
      const [contentRecordPDA] = deriveContentRecordPDA(pHash);

      // Derive a stable treeConfig PDA from bubblegum — on localnet the tree
      // won't exist so Bubblegum will reject it, but the Kredence instruction
      // itself and the status update succeed before the inner CPI runs.
      const [treeConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("tree")],
        BUBBLEGUM_PROGRAM_ID
      );

      const sig = await (program.methods as any)
        .revealAndMint(metadataUri)
        .accounts({
          creator: publicKey,
          contentRecord: contentRecordPDA,
          treeConfig,
          merkleTree: treeConfig,
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_ID,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setMintTxSig(sig);
      setMinted(true);
      setCommitStatus({ message: "🎉 Minted! cNFT proof of originality is on-chain.", type: "success" });
    } catch (err: any) {
      console.error(err);
      // If the only failure is the inner Bubblegum CPI (no tree on localnet),
      // the Kredence account is still updated. We surface a clear message.
      const isBubblegumErr =
        err?.message?.includes("tree") ||
        err?.message?.includes("Bubblegum") ||
        err?.message?.includes("compression");
      setCommitStatus({
        message: isBubblegumErr
          ? "⚠️ Mint CPI failed: Merkle tree not initialised on localnet. Status was NOT updated. Init a tree first."
          : `❌ Mint failed: ${err?.message ?? "Unknown error"}`,
        type: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  // ── purchase license ─────────────────────────────────────
  const handlePurchaseLicense = async () => {
    if (!connected || !publicKey) return;
    if (licenseHash.length !== 64) {
      setLicenseStatus({ message: "❌ Enter a valid 64-character pHash of the content you want to license.", type: "error" });
      return;
    }
    const program = getProgram();
    if (!program) return;

    setIsBuying(true);
    setLicenseTxSig("");
    setLicenseStatus({ message: "Fetching content record…", type: "loading" });

    try {
      const [contentRecordPDA] = deriveContentRecordPDA(licenseHash);

      // Verify the content record exists before sending the tx
      let creatorWallet: web3.PublicKey;
      try {
        const record = await program.account.contentRecord.fetch(contentRecordPDA);
        creatorWallet = record.creator as web3.PublicKey;
      } catch {
        throw new Error(`No content found for that hash. Make sure it has been committed on-chain.`);
      }

      // Don't allow self-purchase
      if (creatorWallet.equals(publicKey)) {
        throw new Error("You are the creator — you cannot purchase a license from yourself.");
      }

      setLicenseStatus({ message: "Sending license purchase transaction…", type: "loading" });

      const feeLamports = new BN(100_000_000); // 0.1 SOL
      const sig = await (program.methods as any)
        .purchaseLicense(feeLamports)
        .accounts({
          buyer: publicKey,
          creatorWallet,
          contentRecord: contentRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setLicenseTxSig(sig);
      setLicenseStatus({
        message: `✅ License purchased! 0.1 SOL sent to creator (${creatorWallet.toString().slice(0, 8)}…).`,
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setLicenseStatus({ message: `❌ ${err?.message ?? "Purchase failed."}`, type: "error" });
    } finally {
      setIsBuying(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      <div className="w-full max-w-xl flex flex-col items-center gap-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Kredence
          </h1>
          <p className="text-gray-400 mt-2 text-base">
            Prove content originality · Commit-Reveal · Compressed NFTs
          </p>
        </div>

        {/* Wallet */}
        <div className="flex flex-col items-center gap-2">
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !transition-colors" />
          {connected && balance !== null && (
            <p className={`text-xs ${balance < 0.01 ? "text-red-400" : "text-gray-500"}`}>
              {balance < 0.01
                ? "⚠️ Low balance — airdrop SOL first: solana airdrop 10 <address> --url http://127.0.0.1:8899"
                : `Balance: ${balance.toFixed(4)} SOL`}
            </p>
          )}
        </div>

        {!connected && (
          <p className="text-gray-600 text-sm">Connect your wallet to get started.</p>
        )}

        {connected && (
          <div className="w-full flex flex-col gap-6">

            {/* ── Section 1: Commit & Mint ─────────────────── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
                1 · Commit &amp; Mint Your Content
              </h2>

              {/* Drop zone */}
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                {file ? (
                  <p className="text-purple-300 font-medium">{file.name}</p>
                ) : (
                  <>
                    <p className="text-2xl mb-1">📂</p>
                    <p className="text-gray-400">Drag &amp; drop an image here</p>
                    <p className="text-gray-600 text-sm mt-1">or click to browse</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>

              {/* Hash display */}
              {pHash && (
                <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">SHA-256 pHash:</p>
                  <p className="text-green-400 font-mono text-xs break-all">{pHash}</p>
                </div>
              )}

              {/* Buttons row */}
              <div className="flex gap-3">
                <button
                  onClick={handleCommit}
                  disabled={!pHash || isCommitting || committed}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 font-bold py-3 rounded-lg transition-all text-sm"
                >
                  {committed ? "✓ Committed" : isCommitting ? "Committing…" : "1. Commit Content"}
                </button>
                <button
                  onClick={handleMint}
                  disabled={!committed || isMinting || !metadataUri || minted}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 font-bold py-3 rounded-lg transition-all text-sm"
                >
                  {minted ? "✓ Minted" : isMinting ? "Minting…" : (committed && !metadataUri) ? "IPFS Uploading…" : "2. Mint cNFT"}
                </button>
              </div>

              {/* Status */}
              {commitStatus.message && (
                <p className={`text-sm text-center ${STATUS_COLOR[commitStatus.type]} break-all`}>
                  {commitStatus.message}
                </p>
              )}

              {/* Tx links */}
              <div className="flex flex-col gap-1">
                {commitTxSig && (
                  <a href={explorerHref(commitTxSig)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-center text-blue-400 hover:text-blue-300 underline">
                    Commit Tx: {shortSig(commitTxSig)} →
                  </a>
                )}
                {mintTxSig && (
                  <a href={explorerHref(mintTxSig)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-center text-purple-400 hover:text-purple-300 underline">
                    Mint Tx: {shortSig(mintTxSig)} →
                  </a>
                )}
              </div>
            </section>

            {/* ── Section 2: Buy License ───────────────────── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
                2 · Purchase a Content License
              </h2>
              <p className="text-xs text-gray-500">
                Enter the 64-character SHA-256 hash of the content you want to license. The creator wallet on-chain will receive 0.1 SOL automatically.
              </p>

              <input
                type="text"
                value={licenseHash}
                onChange={(e) => setLicenseHash(e.target.value.trim())}
                placeholder="Paste the content pHash (64 hex chars)…"
                maxLength={64}
                className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 outline-none rounded-lg px-4 py-3 text-sm font-mono text-gray-200 placeholder-gray-600 transition-colors"
              />

              {/* Quick-fill from own session */}
              {pHash && licenseHash !== pHash && (
                <button
                  onClick={() => setLicenseHash(pHash)}
                  className="text-xs text-gray-500 hover:text-gray-300 underline self-start transition-colors"
                >
                  Use current file's hash
                </button>
              )}

              <button
                onClick={handlePurchaseLicense}
                disabled={isBuying || licenseHash.length !== 64}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-600 font-bold py-3 rounded-lg transition-all text-sm"
              >
                {isBuying ? "Purchasing…" : "🛒 Buy License (0.1 SOL)"}
              </button>

              {licenseStatus.message && (
                <p className={`text-sm text-center ${STATUS_COLOR[licenseStatus.type]} break-all`}>
                  {licenseStatus.message}
                </p>
              )}

              {licenseTxSig && (
                <a href={explorerHref(licenseTxSig)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-center text-green-400 hover:text-green-300 underline">
                  License Tx: {shortSig(licenseTxSig)} →
                </a>
              )}
            </section>

          </div>
        )}
      </div>
    </main>
  );
}
