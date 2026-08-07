"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import CryptoJS from "crypto-js";

export default function Home() {
  const { connected, publicKey } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [pHash, setPHash] = useState<string>("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Calculate a basic SHA256 hash of the file as a simulated pHash
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileContent = event.target?.result;
        if (fileContent) {
          const wordArray = CryptoJS.lib.WordArray.create(fileContent as any);
          const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
          // We truncate/pad to 64 chars for the smart contract requirement if needed
          setPHash(hash.substring(0, 64));
          setStatus("File hashed successfully.");
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  }, []);

  const handleCommit = async () => {
    if (!connected || !pHash) return;
    setIsCommitting(true);
    setStatus("Committing hash to blockchain...");
    
    try {
      // In a real implementation, we would use @coral-xyz/anchor to interact 
      // with the smart contract and invoke `commit_content(pHash)`
      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      setStatus(`Success! Hash committed: ${pHash}`);
    } catch (err) {
      console.error(err);
      setStatus("Error: Hash already committed or transaction failed.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleMint = async () => {
    if (!connected || !pHash) return;
    setIsMinting(true);
    setStatus("Minting cNFT...");
    
    try {
      // In a real implementation, we would fetch the Merkle tree accounts 
      // and invoke `reveal_and_mint`
      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      setStatus("Success! cNFT minted to your wallet.");
    } catch (err) {
      console.error(err);
      setStatus("Error minting cNFT.");
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-950 text-white">
      <div className="z-10 max-w-5xl w-full flex flex-col items-center font-mono text-sm gap-8">
        <h1 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
          Kredence
        </h1>
        <p className="text-gray-400 text-lg mb-8">Prove content originality with cNFTs</p>

        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 transition-colors" />

        {connected ? (
          <div className="flex flex-col items-center w-full max-w-md gap-6 bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-2xl">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Upload Content
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-purple-500/10 file:text-purple-400
                  hover:file:bg-purple-500/20 transition-all
                  cursor-pointer bg-gray-800 rounded-lg p-2 border border-gray-700"
              />
            </div>

            {pHash && (
              <div className="w-full bg-gray-950 p-4 rounded-lg border border-gray-800 break-all">
                <p className="text-xs text-gray-500 mb-1">Generated Hash (pHash):</p>
                <p className="text-sm text-green-400 font-mono">{pHash}</p>
              </div>
            )}

            <div className="flex w-full gap-4">
              <button
                onClick={handleCommit}
                disabled={!pHash || isCommitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-all"
              >
                {isCommitting ? "Committing..." : "Commit Content"}
              </button>
              <button
                onClick={handleMint}
                disabled={!pHash || isMinting}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-all"
              >
                {isMinting ? "Minting..." : "Mint cNFT Receipt"}
              </button>
            </div>

            {status && (
              <p className="text-sm mt-4 text-center text-gray-300">
                {status}
              </p>
            )}
          </div>
        ) : (
          <div className="text-gray-500 mt-12">
            Please connect your wallet to get started.
          </div>
        )}
      </div>
    </main>
  );
}
