"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, web3, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import CryptoJS from "crypto-js";
import IDL from "@/lib/idl.json";
import {
  PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_ID,
  deriveContentRecordPDA,
} from "@/lib/constants";

type StatusType = "idle" | "loading" | "success" | "error";

interface StatusState {
  message: string;
  type: StatusType;
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;

  const [file, setFile] = useState<File | null>(null);
  const [pHash, setPHash] = useState<string>("");
  const [committed, setCommitted] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState<StatusState>({ message: "", type: "idle" });
  const [txSig, setTxSig] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build an AnchorProvider + Program instance on demand
  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: "confirmed" }
    );
    return new Program(IDL as Idl, provider);
  }, [connection, wallet]);

  // ------- File hash -------
  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }, []);

  const processFile = (f: File) => {
    setFile(f);
    setPHash("");
    setCommitted(false);
    setTxSig("");
    setStatus({ message: "Hashing file…", type: "loading" });

    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!buf) return;
      const wordArray = CryptoJS.lib.WordArray.create(buf as ArrayBuffer);
      const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex); // always 64 chars
      setPHash(hash);
      setStatus({ message: "File hashed — ready to commit.", type: "success" });
    };
    reader.readAsArrayBuffer(f);
  };

  // ------- Commit -------
  const handleCommit = async () => {
    if (!connected || !pHash || !publicKey) return;
    const program = getProgram();
    if (!program) return;

    setIsCommitting(true);
    setStatus({ message: "Sending commit transaction…", type: "loading" });

    try {
      const [contentRecordPDA] = deriveContentRecordPDA(pHash);

      const sig = await (program.methods as any)
        .commitContent(pHash)
        .accounts({
          payer: publicKey,
          contentRecord: contentRecordPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setCommitted(true);
      setStatus({
        message: `✅ Committed on-chain! Tx: ${sig.slice(0, 20)}…`,
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      const msg = err?.message?.includes("custom program error: 0x0")
        ? "⚠️ This hash was already committed (duplicate content)."
        : `❌ ${err?.message ?? "Transaction failed."}`;
      setStatus({ message: msg, type: "error" });
    } finally {
      setIsCommitting(false);
    }
  };

  // ------- Reveal & Mint -------
  const handleMint = async () => {
    if (!connected || !pHash || !publicKey || !committed) return;
    const program = getProgram();
    if (!program) return;

    setIsMinting(true);
    setStatus({ message: "Sending reveal & mint transaction…", type: "loading" });

    try {
      const [contentRecordPDA] = deriveContentRecordPDA(pHash);

      // Derive the Bubblegum tree_config PDA for a localnet test tree
      // In production, this should come from a pre-initialized Merkle Tree
      const [treeConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("tree")],
        BUBBLEGUM_PROGRAM_ID
      );

      const sig = await (program.methods as any)
        .revealAndMint()
        .accounts({
          creator: publicKey,
          contentRecord: contentRecordPDA,
          treeConfig,
          merkleTree: treeConfig, // placeholder for local demo
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setStatus({
        message: `🎉 cNFT minted! Tx: ${sig.slice(0, 20)}…`,
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setStatus({
        message: `❌ Mint failed: ${err?.message ?? "Unknown error"}`,
        type: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  const statusColor = {
    idle: "text-gray-400",
    loading: "text-yellow-400",
    success: "text-green-400",
    error: "text-red-400",
  }[status.type];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      <div className="w-full max-w-lg flex flex-col items-center gap-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            Kredence
          </h1>
          <p className="text-gray-400 mt-2 text-base">
            Prove content originality · Commit-Reveal · Compressed NFTs
          </p>
        </div>

        {/* Wallet button */}
        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !transition-colors" />

        {connected && (
          <div className="w-full flex flex-col gap-5 bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">

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
                  <p className="text-gray-400">Drag & drop an image here</p>
                  <p className="text-gray-600 text-sm mt-1">or click to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Hash display */}
            {pHash && (
              <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                <p className="text-xs text-gray-500 mb-1">SHA-256 pHash (64 chars):</p>
                <p className="text-green-400 font-mono text-xs break-all">{pHash}</p>
              </div>
            )}

            {/* Commit / Mint buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCommit}
                disabled={!pHash || isCommitting || committed}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 font-bold py-3 rounded-lg transition-all"
              >
                {committed ? "✓ Committed" : isCommitting ? "Committing…" : "1. Commit to Kredence"}
              </button>
              <button
                onClick={handleMint}
                disabled={!committed || isMinting}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 font-bold py-3 rounded-lg transition-all"
              >
                {isMinting ? "Minting…" : "2. Mint cNFT Receipt"}
              </button>
            </div>

            {/* Status */}
            {status.message && (
              <p className={`text-sm text-center ${statusColor} break-all`}>
                {status.message}
              </p>
            )}

            {/* Tx link */}
            {txSig && (
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-center text-purple-400 hover:text-purple-300 underline break-all"
              >
                View on Solana Explorer →
              </a>
            )}

          </div>
        )}

        {!connected && (
          <p className="text-gray-600 text-sm">Connect your wallet to get started.</p>
        )}
      </div>
    </main>
  );
}
