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

        {/* Meet the Developer */}
        <section className="space-y-8 pb-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-zinc-100 font-heading flex items-center justify-center gap-3">
              Meet the Developer
            </h2>
          </div>

          <div className="rounded-3xl border border-zinc-800/70 bg-[#0a0a0d]/80 backdrop-blur-md p-8 sm:p-10 flex flex-col items-center gap-6 shadow-xl max-w-2xl mx-auto text-center">
            <div className="flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="https://avatars.githubusercontent.com/u/74640103?v=4" 
                alt="Parth Badgire" 
                className="w-24 h-24 rounded-full bg-zinc-900 border-4 border-zinc-800 object-cover"
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-zinc-100">Parth Badgire</h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                Full-stack Web3 developer passionate about decentralized systems and creating seamless user experiences on Solana.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
              <a 
                href="https://github.com/parthbadgire-code" 
                target="_blank" 
                rel="noreferrer"
                className="rounded-xl bg-zinc-800 border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                GitHub Profile
              </a>
              <a 
                href="mailto:parthbadgire@gmail.com" 
                className="rounded-xl bg-purple-600 border border-purple-500 px-6 py-3 text-sm font-medium text-purple-100 hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
              >
                Contact Me
              </a>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
