export const truncateSig = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;
export const getExplorerUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
