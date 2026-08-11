import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-800/70 bg-[#050505]/80 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold font-heading text-zinc-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400" />
          Kredence
        </Link>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
          <Link href="/" className="hover:text-zinc-100 transition-colors">Home</Link>
          <Link href="/#originality-check" className="hover:text-zinc-100 transition-colors">Originality Check</Link>
          <Link href="/feed" className="hover:text-zinc-100 transition-colors">Feed</Link>
          <Link href="/profile" className="hover:text-zinc-100 transition-colors">Dashboard</Link>
          <Link href="/#history" className="hover:text-zinc-100 transition-colors">History</Link>
          <Link href="/about-us" className="hover:text-zinc-100 transition-colors">About Us</Link>
        </div>

        <div className="flex items-center gap-4">
          <Link 
            href="/feed" 
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors"
          >
            Explore Feed
          </Link>
          {/* We omit WalletMultiButton here to avoid hydrating issues or doubling up with page.tsx, 
              but it could easily be placed here. We'll leave it in page.tsx as it's the primary CTA there. */}
        </div>
      </div>
    </nav>
  );
}
