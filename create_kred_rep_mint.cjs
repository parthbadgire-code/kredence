const {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction
} = require("@solana/web3.js");
const {
  createMint, TOKEN_2022_PROGRAM_ID
} = require("@solana/spl-token");
const fs = require("fs");
const os = require("os");

const PROGRAM_ID = new PublicKey("EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");
const RPC = "https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014";

const connection = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf8")))
);

async function main() {
  // Derive the mint_authority PDA
  const [mintAuthorityPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    PROGRAM_ID
  );
  console.log("mint_authority_pda:", mintAuthorityPda.toBase58(), "bump:", bump);

  // Create a new KRED_REP Token-2022 mint
  // Mint authority = the program's PDA (so only the program can mint)
  // Decimals = 0 (badge, whole units only)
  console.log("Creating KRED_REP Token-2022 mint...");
  const kredRepMint = await createMint(
    connection,
    payer,           // payer for rent
    mintAuthorityPda, // mint authority = program PDA
    null,            // no freeze authority
    0,               // 0 decimals — whole badge units
    Keypair.generate(), // new mint keypair
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );

  console.log("\n✅ KRED_REP Mint created!");
  console.log("Mint address:", kredRepMint.toBase58());
  console.log("\nUpdate KRED_REP_MINT in DisputeCard.tsx to:", kredRepMint.toBase58());
}

main().catch(console.error);
