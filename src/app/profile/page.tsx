"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import FeedCard from "@/components/FeedCard";
import { Loader2, AlertTriangle, UserCircle, CheckCircle2, Save, ShieldCheck } from "lucide-react";

const KRED_REP_MINT = new PublicKey("6u6qVLPhpwyMy9PbtAA1P8q1PKG1615mohCW6HcuXEAB");

interface FeedItem {
  pda: string;
  hash: string;
  creator: string;
  timestamp: number;
  channel: string;
  disputeStatus: "active" | "disputed";
  metadataUri?: string;
  isDisputed: boolean;
  isResolved: boolean;
  creatorVotes: number;
  challengerVotes: number;
  winnerIsCreator: boolean;
  evidenceUrl: string;
}

export default function ProfilePage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Profile settings
  const [username, setUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"uploads" | "licenses">("uploads");
  const [repBalance, setRepBalance] = useState(0);

  useEffect(() => {
    if (wallet.publicKey) {
      const savedName = localStorage.getItem(`kredence_username_${wallet.publicKey.toString()}`);
      if (savedName) setUsername(savedName);

      // Fetch KRED_REP balance
      const fetchRep = async () => {
        try {
          const ata = getAssociatedTokenAddressSync(
            KRED_REP_MINT,
            wallet.publicKey!,
            false,
            TOKEN_2022_PROGRAM_ID
          );
          const balance = await connection.getTokenAccountBalance(ata);
          setRepBalance(Number(balance.value.uiAmount));
        } catch (e) {
          setRepBalance(0);
        }
      };
      fetchRep();
    }
  }, [wallet.publicKey, connection]);

  const handleSaveProfile = () => {
    if (!wallet.publicKey) return;
    setIsSaving(true);
    const pubKeyStr = wallet.publicKey.toString();
    setTimeout(() => {
      localStorage.setItem(`kredence_username_${pubKeyStr}`, username);
      setSaveSuccess(true);
      setIsSaving(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 500);
  };

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!wallet.publicKey) {
        setFeedItems([]);
        setIsLoading(false);
        return;
      }
      // Create a read-only provider if wallet is not connected
      const dummyWallet = {
        publicKey: wallet.publicKey || null,
        signTransaction: () => Promise.reject(),
        signAllTransactions: () => Promise.reject(),
      };
      const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
      const program = new Program(IDL as Idl, provider);

      const records = await (program.account as any).contentRecord.all();
      const pubKeyStr = wallet.publicKey!.toString();

      const storedHashes: string[] = JSON.parse(
        localStorage.getItem(`licenses_${pubKeyStr}`) || "[]"
      );

      const items: FeedItem[] = [];
      for (const r of records) {
        const data = r.account;
        const creatorStr = data.creator.toString();
        const hashStr = data.pHash as string;
        
        const isUploader = creatorStr === pubKeyStr;
        const isLicensed = storedHashes.includes(hashStr);

        if (!isUploader && !isLicensed) continue;
                
        // Pseudo-randomly assign a channel and dispute status based on hash for UI demo purposes
        let sum = 0;
        for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
        
        const isDisputed = sum % 10 === 0; // ~10% chance of being disputed

        items.push({
          pda: r.publicKey.toString(),
          hash: hashStr,
          creator: creatorStr,
          timestamp: data.commitTime.toNumber(),
          channel: isUploader ? "My Uploads" : "Licensed",
          disputeStatus: data.isDisputed ? "disputed" : "active",
          metadataUri: data.metadataUri as string,
          isDisputed: data.isDisputed,
          isResolved: data.isResolved,
          creatorVotes: data.creatorVotes,
          challengerVotes: data.challengerVotes,
          winnerIsCreator: data.winnerIsCreator,
          evidenceUrl: data.evidenceUrl as string,
        });
      }

      // Sort newest first
      items.sort((a, b) => b.timestamp - a.timestamp);
      setFeedItems(items);
    } catch (err) {
      console.error("Failed to fetch feed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // WebSocket Listener for Real-Time Updates
  useEffect(() => {
    const dummyWallet = {
      publicKey: wallet.publicKey || null,
      signTransaction: () => Promise.reject(),
      signAllTransactions: () => Promise.reject(),
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    const program = new Program(IDL as Idl, provider);

    const subId = connection.onProgramAccountChange(
      program.programId,
      (updatedAccountInfo) => {
        try {
          // Decode the new or updated account data using Anchor coder
          const decoded = program.coder.accounts.decode(
            "contentRecord",
            updatedAccountInfo.accountInfo.data
          );
          
          const creatorStr = decoded.creator.toString();
          const hashStr = decoded.pHash as string;
          const pubKeyStr = wallet.publicKey!.toString();
          
          const storedHashes: string[] = JSON.parse(
            localStorage.getItem(`licenses_${pubKeyStr}`) || "[]"
          );

          const isUploader = creatorStr === pubKeyStr;
          const isLicensed = storedHashes.includes(hashStr);

          if (!isUploader && !isLicensed) return;

          let sum = 0;
          for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
          const isDisputed = sum % 10 === 0;

          const newItem: FeedItem = {
            pda: updatedAccountInfo.accountId.toString(),
            hash: hashStr,
            creator: creatorStr,
            timestamp: decoded.commitTime.toNumber(),
            channel: isUploader ? "My Uploads" : "Licensed",
            disputeStatus: decoded.isDisputed ? "disputed" : "active",
            metadataUri: decoded.metadataUri as string,
            isDisputed: decoded.isDisputed,
            isResolved: decoded.isResolved,
            creatorVotes: decoded.creatorVotes,
            challengerVotes: decoded.challengerVotes,
            winnerIsCreator: decoded.winnerIsCreator,
            evidenceUrl: decoded.evidenceUrl as string,
          };

          setFeedItems((prev) => {
            const existingIdx = prev.findIndex((i) => i.pda === newItem.pda);
            if (existingIdx > -1) {
              const next = [...prev];
              next[existingIdx] = newItem;
              return next;
            } else {
              return [newItem, ...prev].sort((a, b) => b.timestamp - a.timestamp);
            }
          });
        } catch (e) {
          // Ignore decoding errors (could be older PDAs or different account types)
        }
      },
      "confirmed"
    );

    return () => {
      connection.removeProgramAccountChangeListener(subId);
    };
  }, [connection, wallet.publicKey]);


  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-purple-900/40 selection:text-purple-200">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:py-12 flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100 font-heading">
              Creator Dashboard
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Manage your identity and monitor your registered content.</p>
          </div>
          <WalletMultiButton />
        </header>

        {/* Profile Settings Block */}
        {wallet.publicKey && (
          <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 flex flex-col sm:flex-row gap-6 items-center shadow-xl">
            {/* Avatar Profile */}
            <div className="flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={`https://api.dicebear.com/7.x/identicon/svg?seed=${wallet.publicKey.toString()}`} 
                alt="Your Avatar" 
                className="w-24 h-24 rounded-full bg-zinc-900 border-4 border-zinc-800"
              />
            </div>
            
            <div className="flex-1 w-full space-y-3 text-center sm:text-left">
              <h3 className="text-lg font-semibold text-zinc-200 flex items-center justify-center sm:justify-start gap-2">
                <UserCircle size={20} className="text-purple-400" />
                User Identity
              </h3>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  placeholder="Set a custom username..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving || !username}
                  className="rounded-xl bg-purple-600/20 border border-purple-500/30 px-6 py-3 text-sm font-medium text-purple-300 hover:bg-purple-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 min-w-[120px]"
                >
                  {isSaving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : saveSuccess ? (
                    <> <CheckCircle2 size={18} /> Saved! </>
                  ) : (
                    <> <Save size={18} /> Save </>
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500 font-mono">
                Wallet: {wallet.publicKey.toString().slice(0, 8)}...{wallet.publicKey.toString().slice(-8)}
              </p>
            </div>

            {/* Rep Badges */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center p-4 rounded-xl bg-amber-900/20 border border-amber-700/30">
              <ShieldCheck className="text-amber-400 mb-1" size={28} />
              <div className="text-2xl font-bold text-amber-300 font-mono">{repBalance}</div>
              <div className="text-xs text-amber-500/80 uppercase font-bold tracking-wider">KRED_REP Badges</div>
            </div>
          </div>
        )}

        {/* Feed List */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab("uploads")}
                className={`text-xl font-bold font-heading transition-colors ${activeTab === "uploads" ? "text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}
              >
                My Uploads
              </button>
              <button 
                onClick={() => setActiveTab("licenses")}
                className={`text-xl font-bold font-heading transition-colors ${activeTab === "licenses" ? "text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}
              >
                My Licenses
              </button>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-800/50 text-zinc-400 border border-zinc-700">
              {feedItems.filter(item => activeTab === "uploads" ? item.channel === "My Uploads" : item.channel === "Licensed").length} Items
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-sm">Fetching on-chain records...</p>
            </div>
          ) : feedItems.filter(item => activeTab === "uploads" ? item.channel === "My Uploads" : item.channel === "Licensed").length > 0 ? (
            // Sort to bring disputed items to the top
            feedItems
              .filter(item => activeTab === "uploads" ? item.channel === "My Uploads" : item.channel === "Licensed")
              .sort((a, b) => (b.isDisputed ? 1 : 0) - (a.isDisputed ? 1 : 0))
              .map((item) => (
              <div key={item.pda} className="relative">
                {item.isDisputed && !item.isResolved && activeTab === "uploads" && (
                  <div className="absolute -top-3 left-6 z-20 px-3 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-amber-500/20 flex items-center gap-1.5 animate-pulse">
                    <AlertTriangle size={12} />
                    Active Dispute — Action Required
                  </div>
                )}
                <FeedCard {...item} />
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
              <p className="text-sm text-center px-4">
                You haven&apos;t {activeTab === "uploads" ? "registered" : "licensed"} any content yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
