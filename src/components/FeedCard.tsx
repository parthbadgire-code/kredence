import { useState } from "react";
import { Clock, AlertTriangle, ShieldCheck, User } from "lucide-react";
import DisputeModal from "./DisputeModal";
import { getExplorerUrl, truncateSig } from "@/lib/utils"; // need to create/extract utils

interface FeedCardProps {
  pda: string;
  hash: string;
  creator: string;
  timestamp: number;
  channel: string;
  disputeStatus: "active" | "disputed";
  metadataUri?: string;
}

export default function FeedCard({
  pda,
  hash,
  creator,
  timestamp,
  channel,
  disputeStatus,
  metadataUri,
}: FeedCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!metadataUri || !metadataUri.startsWith("ipfs://")) return;
    
    const fetchMetadata = async () => {
      try {
        const hash = metadataUri.replace("ipfs://", "");
        const res = await fetch(`https://gateway.pinata.cloud/ipfs/${hash}`);
        const data = await res.json();
        if (data.image && data.image.startsWith("ipfs://")) {
          setImageUrl(data.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/"));
        }
      } catch (err) {
        console.error("Failed to load IPFS metadata", err);
      }
    };
    fetchMetadata();
  }, [metadataUri]);

  // Generate a deterministic abstract pattern based on the hash (Option A)
  const generatePattern = (hashString: string) => {
    const colors = [
      "from-purple-900 to-indigo-900",
      "from-emerald-900 to-teal-900",
      "from-rose-900 to-pink-900",
      "from-amber-900 to-orange-900",
      "from-sky-900 to-blue-900",
    ];
    // basic hash to number
    let sum = 0;
    for (let i = 0; i < hashString.length; i++) sum += hashString.charCodeAt(i);
    const color = colors[sum % colors.length];
    
    // some pseudo-random SVG shapes
    return (
      <div className={`w-full h-48 sm:h-64 rounded-xl bg-gradient-to-br ${color} overflow-hidden relative flex items-center justify-center border border-zinc-800/50`}>
         {/* Generate an identicon-like abstract visual */}
         <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: `radial-gradient(circle at ${sum%100}% ${(sum*3)%100}%, white, transparent 40%)` }} />
         <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: `radial-gradient(circle at ${(sum*7)%100}% ${(sum*5)%100}%, black, transparent 60%)` }} />
         
         <div className="flex flex-col items-center gap-2 z-10 backdrop-blur-md bg-black/40 px-4 py-2 rounded-xl border border-white/10">
            <span className="text-white/60 text-[10px] uppercase tracking-widest font-mono">Fingerprint</span>
            <span className="text-white/90 text-sm font-mono tracking-wider">{hash.slice(0,16)}...</span>
         </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-5 sm:p-6 shadow-xl transition-all hover:border-zinc-700/70">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800/50 border border-zinc-700 text-xs font-semibold text-zinc-300">
              {channel}
            </span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
              <User size={12} />
              <span>{truncateSig(creator)}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-zinc-600">
              <Clock size={12} />
              <span>{new Date(timestamp * 1000).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${
            disputeStatus === "active" 
              ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/50" 
              : "bg-amber-950/30 text-amber-400 border-amber-900/50"
          }`}>
            {disputeStatus === "active" ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
            {disputeStatus === "active" ? "Optimistically Active" : "In Dispute"}
          </div>
        </div>

        {/* Media / Hash Visual */}
        {imageUrl ? (
          <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden relative flex items-center justify-center border border-zinc-800/50 bg-black">
            <img src={imageUrl} alt="Content" className="object-cover w-full h-full opacity-90 transition-opacity hover:opacity-100" />
            <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 z-10 backdrop-blur-md bg-black/60 px-3 py-1.5 rounded-lg border border-white/10">
              <span className="text-white/60 text-[9px] uppercase tracking-widest font-mono">Fingerprint</span>
              <span className="text-white/90 text-xs font-mono tracking-wider">{hash.slice(0,12)}...</span>
            </div>
          </div>
        ) : (
          generatePattern(hash)
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <a
            href={`/api/actions/license?hash=${hash}`} // Mocking the Blink execution as a standard link for now, in real life they'd use dial.to
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded-xl bg-purple-900/50 hover:bg-purple-800/60 border border-purple-700/50 px-4 py-3 text-sm font-medium text-purple-100 transition-all"
          >
            License for 0.1 SOL
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/60 border border-zinc-700/50 px-4 py-3 text-sm font-medium text-zinc-300 transition-all"
          >
            Challenge / Dispute
          </button>
        </div>
      </div>

      <DisputeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        hash={hash}
        pda={pda}
      />
    </>
  );
}
