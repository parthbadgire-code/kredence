import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp"
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

/** Derives the ContentRecord PDA for a given pHash */
export function deriveContentRecordPDA(pHash: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("content"), Buffer.from(pHash)],
    PROGRAM_ID
  );
}
