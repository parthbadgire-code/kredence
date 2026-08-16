"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import BackgroundCanvas from "@/components/BackgroundCanvas";
import DisputeCard from "@/components/DisputeCard";
import { Loader2, Gavel } from "lucide-react";

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

export default function DisputesPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
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

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true);
    const program = getReadOnlyProgram();

    try {
      const NEW_DISPUTE_SIZE = 203;
      const rawAccounts = await connection.getProgramAccounts(program.programId, {
        filters: [{ dataSize: NEW_DISPUTE_SIZE }],
      });

      const CUTOFF_TIMESTAMP = 1786891742; // Soft-delete cutoff
      const items: DisputeItem[] = rawAccounts
        .map((acct) => {
          const decoded = program.coder.accounts.decode("disputeRecord", acct.account.data);
          return {
            disputePda: acct.pubkey.toString(),
            contentMint: decoded.contentMint.toString(),
            creator: decoded.creator.toString(),
            endTime: decoded.endTime.toNumber(),
            isResolved: decoded.isResolved,
            winningSide: decoded.winningSide,
            originalVotes: decoded.originalVotes.toNumber(),
            counterfeitVotes: decoded.counterfeitVotes.toNumber(),
            prizePool: decoded.prizePool.toNumber(),
            totalWinningVotes: decoded.totalWinningVotes.toNumber(),
          };
        })
        .filter((item) => item.endTime > CUTOFF_TIMESTAMP);

      items.sort((a, b) => b.endTime - a.endTime);
      setDisputes(items);
    } catch (err) {
      console.error("Failed to fetch dispute records:", err);
    } finally {
      setIsLoading(false);
    }
  }, [connection, getReadOnlyProgram]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-amber-900/40 selection:text-amber-200">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:py-12 flex flex-col gap-8">
        
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100 font-heading flex items-center gap-3">
            <Gavel className="text-amber-400" /> Active Disputes
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Review active challenges across the Kredence network. Vote for the original or counterfeit side to earn SOL rewards and KRED_REP badges.
          </p>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-amber-500" size={32} />
            <span className="font-medium text-sm animate-pulse">Loading disputes...</span>
          </div>
        ) : disputes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/20 border border-zinc-800/50 rounded-3xl text-zinc-500 gap-3 text-center">
            <Gavel size={32} className="text-zinc-700" />
            <p className="font-medium">No active disputes right now.</p>
            <p className="text-xs max-w-sm text-zinc-600 mt-2">
              If you find content you believe is counterfeit, you can challenge it from the feed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {disputes.map((d) => (
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
                onRefresh={fetchDisputes}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
