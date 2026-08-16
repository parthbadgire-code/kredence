"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ShieldCheck, Layers, Gavel, UserCircle } from "lucide-react";

export default function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/feed", label: "Feed", icon: <Layers size={18} /> },
    { href: "/disputes", label: "Disputes", icon: <Gavel size={18} /> },
    { href: "/profile", label: "Profile", icon: <UserCircle size={18} /> },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-[#050505]/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-purple-500" size={28} />
          <span className="font-heading font-bold text-xl tracking-wide text-zinc-100 hidden sm:block">Kredence</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-1 sm:gap-4 flex-1 justify-center">
          {links.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                  isActive 
                    ? "bg-purple-900/30 text-purple-300 border border-purple-500/30" 
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
                }`}
              >
                {link.icon}
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <div className="flex items-center justify-end">
          <WalletMultiButton />
        </div>

      </div>
    </nav>
  );
}
