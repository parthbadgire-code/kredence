"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import FeedCard from "@/components/FeedCard";
import DisputeCard from "@/components/DisputeCard";
import { Loader2, Gavel } from "lucide-react";

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
  evidenceUrl: string;
}

interface DisputeItem {
  disputePda: string;
  contentMint: string;
  creator: string;
  endTime: number;
  isResolved: boolean;
  winningSide: number;
  originalVotes: number;
  counterfeitVotes: number;
  prizePool: number;
  totalWinningVotes: number;
}

export default function FeedPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [activeChannel, setActiveChannel] = useState("All");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getReadOnlyProgram = useCallback(() => {
    const dummyWallet = {
      publicKey: wallet.publicKey || null,
      signTransaction: () => Promise.reject(),
      signAllTransactions: () => Promise.reject(),
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    return new Program(IDL as Idl, provider);
  }, [connection, wallet.publicKey]);

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    const program = getReadOnlyProgram();

    // --- Content records (independent) ---
    try {
      const records = await (program.account as any).contentRecord.all();
      const items: FeedItem[] = records.map((r: any) => {
        const data = r.account;
        const hashStr = data.pHash as string;
        let sum = 0;
        for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
        const channelAssigned = CHANNELS[(sum % (CHANNELS.length - 1)) + 1];
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
          evidenceUrl: data.evidenceUrl as string,
        };
      });
      items.sort((a, b) => b.timestamp - a.timestamp);
      setFeedItems(items);
    } catch (err) {
      console.error("Failed to fetch content records:", err);
    }

    // --- Dispute records (independent — stale layouts won't crash content feed) ---
    try {
      const disputeRecords = await (program.account as any).disputeRecord.all();
      const disputeItems: DisputeItem[] = disputeRecords
        .filter((d: any) => {
          // Skip accounts that don't have expected fields (old layout)
          try { d.account.contentMint.toString(); return true; } catch { return false; }
        })
        .map((d: any) => ({
          disputePda: d.publicKey.toString(),
          contentMint: d.account.contentMint.toString(),
          creator: d.account.creator.toString(),
          endTime: d.account.endTime.toNumber(),
          isResolved: d.account.isResolved,
          winningSide: d.account.winningSide,
          originalVotes: Number(d.account.originalVotes ?? 0),
          counterfeitVotes: Number(d.account.counterfeitVotes ?? 0),
          prizePool: Number(d.account.prizePool ?? 50_000_000),
          totalWinningVotes: Number(d.account.totalWinningVotes ?? 0),
        }));
      setDisputes(disputeItems);
    } catch (err) {
      console.error("Failed to fetch dispute records (may be stale layout):", err);
      setDisputes([]); // Show feed without disputes rather than blocking everything
    }

    setIsLoading(false);
  }, [getReadOnlyProgram]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Real-time listener
  useEffect(() => {
    const program = getReadOnlyProgram();
    const subId = connection.onProgramAccountChange(
      program.programId,
      (updatedAccountInfo) => {
        try {
          const decoded = program.coder.accounts.decode(
            "contentRecord",
            updatedAccountInfo.accountInfo.data
          );
          const hashStr = decoded.pHash as string;
          let sum = 0;
          for (let i = 0; i < hashStr.length; i++) sum += hashStr.charCodeAt(i);
          const channelAssigned = CHANNELS[(sum % (CHANNELS.length - 1)) + 1];

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
          // Ignore decoding errors
        }
      },
      "confirmed"
    );

    return () => {
      connection.removeProgramAccountChangeListener(subId);
    };
  }, [connection, getReadOnlyProgram]);

  const filteredItems = feedItems.filter(
    (item) => activeChannel === "All" || item.channel === activeChannel
  );

  const activeDisputes = disputes.filter((d) => !d.isResolved);
  const resolvedDisputes = disputes.filter((d) => d.isResolved);

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

        {/* Active Disputes Panel */}
        {!isLoading && activeDisputes.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Gavel className="text-amber-400" size={18} />
              <h2 className="text-base font-semibold text-amber-300">
                Active Disputes ({activeDisputes.length})
              </h2>
              <span className="text-xs text-zinc-500 ml-1">Vote within the time window</span>
            </div>
            {activeDisputes.map((d) => (
              <DisputeCard
                key={d.disputePda}
                disputePda={d.disputePda}
                contentMint={d.contentMint}
                creator={d.creator}
                endTime={d.endTime}
                isResolved={d.isResolved}
                winningSide={d.winningSide}
                originalVotes={d.originalVotes}
                counterfeitVotes={d.counterfeitVotes}
                prizePool={d.prizePool}
                totalWinningVotes={d.totalWinningVotes}
                onRefresh={fetchFeed}
              />
            ))}
          </section>
        )}

        {/* Resolved Disputes Panel */}
        {!isLoading && resolvedDisputes.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Gavel className="text-blue-400" size={18} />
              <h2 className="text-base font-semibold text-blue-300">
                Resolved Disputes ({resolvedDisputes.length})
              </h2>
            </div>
            {resolvedDisputes.map((d) => (
              <DisputeCard
                key={d.disputePda}
                disputePda={d.disputePda}
                contentMint={d.contentMint}
                creator={d.creator}
                endTime={d.endTime}
                isResolved={d.isResolved}
                winningSide={d.winningSide}
                originalVotes={d.originalVotes}
                counterfeitVotes={d.counterfeitVotes}
                prizePool={d.prizePool}
                totalWinningVotes={d.totalWinningVotes}
                onRefresh={fetchFeed}
              />
            ))}
          </section>
        )}

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
