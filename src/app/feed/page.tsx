"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import FeedCard from "@/components/FeedCard";
import { Loader2 } from "lucide-react";

const CHANNELS = ["All", "c/memes", "c/leaks", "c/art"];

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
}

export default function FeedPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [activeChannel, setActiveChannel] = useState("All");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      // Create a read-only provider if wallet is not connected
      const dummyWallet = {
        publicKey: wallet.publicKey || null,
        signTransaction: () => Promise.reject(),
        signAllTransactions: () => Promise.reject(),
      };
      const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
      const program = new Program(IDL as Idl, provider);

      const records = await (program.account as any).contentRecord.all();

      const items: FeedItem[] = records.map((r: any) => {
        const data = r.account;
        const hashStr = data.pHash as string;
        
        // Pseudo-randomly assign a channel and dispute status based on hash for UI demo purposes
        let sum = 0;
        for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
        
        const channelAssigned = CHANNELS[(sum % (CHANNELS.length - 1)) + 1]; // Skip "All"
        const isDisputed = sum % 10 === 0; // ~10% chance of being disputed

        return {
          pda: r.publicKey.toString(),
          hash: hashStr,
          creator: data.creator.toString(),
          timestamp: data.commitTime.toNumber(),
          channel: channelAssigned,
          disputeStatus: data.isDisputed ? "disputed" : "active",
          metadataUri: data.metadataUri as string,
          isDisputed: data.isDisputed,
          isResolved: data.isResolved,
          creatorVotes: data.creatorVotes,
          challengerVotes: data.challengerVotes,
          winnerIsCreator: data.winnerIsCreator,
        };
      });

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
          
          const hashStr = decoded.pHash as string;
          let sum = 0;
          for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
          const channelAssigned = CHANNELS[(sum % (CHANNELS.length - 1)) + 1];
          const isDisputed = sum % 10 === 0;

          const newItem: FeedItem = {
            pda: updatedAccountInfo.accountId.toString(),
            hash: hashStr,
            creator: decoded.creator.toString(),
            timestamp: decoded.commitTime.toNumber(),
            channel: channelAssigned,
            disputeStatus: decoded.isDisputed ? "disputed" : "active",
            metadataUri: decoded.metadataUri as string,
            isDisputed: decoded.isDisputed,
            isResolved: decoded.isResolved,
            creatorVotes: decoded.creatorVotes,
            challengerVotes: decoded.challengerVotes,
            winnerIsCreator: decoded.winnerIsCreator,
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

  const filteredItems = feedItems.filter(
    (item) => activeChannel === "All" || item.channel === activeChannel
  );

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-purple-900/40 selection:text-purple-200">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:py-12 flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100 font-heading">
              Community Feed
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Discover and license verified original content.</p>
          </div>
          <WalletMultiButton />
        </header>

        {/* Channel Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CHANNELS.map((channel) => (
            <button
              key={channel}
              onClick={() => setActiveChannel(channel)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeChannel === channel
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {channel}
            </button>
          ))}
        </div>

        {/* Feed List */}
        <div className="flex flex-col gap-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-sm">Fetching on-chain records...</p>
            </div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <FeedCard key={item.pda} {...item} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
              <p className="text-sm">No content found in this channel.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
