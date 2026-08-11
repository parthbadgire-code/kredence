import BackgroundCanvas from "@/components/BackgroundCanvas";
import { ShieldCheck, Gavel, Sparkles, Scale, BookOpen } from "lucide-react";

export default function AboutUsPage() {
  return (
    <main className="relative min-h-screen bg-[#050505] text-[#e5e5e7] selection:bg-purple-900/40 selection:text-purple-200 pb-20">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:py-20 flex flex-col gap-16">
        
        {/* Header */}
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100 font-heading">
            About Kredence
          </h1>
          <p className="text-base md:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Kredence is a decentralized media provenance protocol built on Solana. We empower creators to cryptographically prove the originality of their content using client-side hashing and on-chain commit-reveal schemes. Built with ❤️ for the Solana Hackathon.
          </p>
        </section>

        {/* Platform Guide */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-zinc-100 font-heading flex items-center justify-center gap-3">
              <BookOpen className="text-purple-400" size={28} />
              Platform Guide
            </h2>
            <p className="text-sm text-zinc-400">How to protect, license, and dispute content on Kredence.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {/* Guide Card 1 */}
            <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 sm:p-8 flex flex-col gap-4 shadow-xl hover:border-purple-900/50 transition-colors">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <Sparkles className="text-purple-400" size={24} />
              </div>
              <h3 className="text-xl font-bold text-zinc-200">1. Register Original Content</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                When you create an image, upload it via our <strong>Originality Check</strong>. We generate a cryptographic perceptual hash (pHash) locally on your device. You then submit an on-chain transaction to register this hash to your wallet.
              </p>
            </div>

            {/* Guide Card 2 */}
            <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 sm:p-8 flex flex-col gap-4 shadow-xl hover:border-emerald-900/50 transition-colors">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <ShieldCheck className="text-emerald-400" size={24} />
              </div>
              <h3 className="text-xl font-bold text-zinc-200">2. Licensing & Monetization</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Registered content appears on the <strong>Community Feed</strong>. Other users can instantly purchase a verifiable license for 0.1 SOL. The transaction natively transfers funds to your wallet and issues an immutable on-chain record of their license.
              </p>
            </div>

            {/* Guide Card 3 */}
            <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 sm:p-8 flex flex-col gap-4 shadow-xl hover:border-amber-900/50 transition-colors">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Scale className="text-amber-400" size={24} />
              </div>
              <h3 className="text-xl font-bold text-zinc-200">3. Opening a Dispute</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                If someone steals your content, you can open a dispute by locking a 0.05 SOL challenger bond. You will provide a description and evidence (like a screenshot or URL) proving you are the original owner. Your evidence is pinned to IPFS for transparency.
              </p>
            </div>

            {/* Guide Card 4 */}
            <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-6 sm:p-8 flex flex-col gap-4 shadow-xl hover:border-blue-900/50 transition-colors">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <Gavel className="text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-bold text-zinc-200">4. Community Staked Jury</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Once a dispute opens, it goes to a 24-hour vote. The community reviews the evidence and stakes SOL to vote for the <strong>Creator</strong> or the <strong>Challenger</strong>. The winning side splits the losing side&apos;s staked SOL as a reward!
              </p>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
