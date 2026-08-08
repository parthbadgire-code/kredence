import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp"
);

export const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);

export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

export const SPL_ACCOUNT_COMPRESSION_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);

export const MERKLE_TREE_ADDRESS = new PublicKey(
  "2mqhJoNYHuAfTQD2prVPUiNbtTCYVZ48Y5rWy1VciNYM"
);

/** Derives the ContentRecord PDA for a given pHash.
 *  The pHash (64 hex chars = 64 bytes) is split into two 32-byte seeds
 *  to stay within Solana's 32-byte-per-seed limit.
 */
export function deriveContentRecordPDA(pHash: string): [PublicKey, number] {
  const pHashBytes = Buffer.from(pHash); // 64 bytes (ASCII hex chars)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("content"),
      pHashBytes.slice(0, 32),  // first 32 bytes
      pHashBytes.slice(32, 64), // second 32 bytes
    ],
    PROGRAM_ID
  );
}
