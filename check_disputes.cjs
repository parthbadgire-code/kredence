const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const fs = require("fs");

const IDL = JSON.parse(fs.readFileSync("/Users/parthbadgire/projects/kredence/src/lib/idl.json", "utf8"));
const PROGRAM_ID = new PublicKey("EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014", "confirmed");

const keypairPath = require("os").homedir() + "/.config/solana/id.json";
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(IDL, provider);

async function main() {
  const disputes = await program.account.disputeRecord.all();
  console.log("Total disputes on-chain:", disputes.length);
  for (const d of disputes) {
    console.log("\nDispute PDA:", d.publicKey.toBase58());
    console.log("  content_mint (PDA seed):", d.account.contentMint.toBase58());
    console.log("  is_resolved:", d.account.isResolved);
    
    // Check: does a dispute PDA already exist for this content mint?
    const [expectedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dispute"), d.account.contentMint.toBuffer()],
      PROGRAM_ID
    );
    console.log("  expected PDA matches:", expectedPda.toBase58() === d.publicKey.toBase58());
  }
  
  // Also list all content records
  const records = await program.account.contentRecord.all();
  console.log("\nTotal content records:", records.length);
  for (const r of records) {
    console.log("  ContentRecord PDA:", r.publicKey.toBase58());
    const [disputePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dispute"), r.publicKey.toBuffer()],
      PROGRAM_ID
    );
    const disputeAcct = await connection.getAccountInfo(disputePda);
    console.log("  Has dispute:", !!disputeAcct, "-> disputePDA:", disputePda.toBase58());
  }
}

main().catch(console.error);
