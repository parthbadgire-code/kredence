const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const fs = require("fs");

const IDL = JSON.parse(fs.readFileSync("/Users/parthbadgire/projects/kredence/src/lib/idl.json", "utf8"));
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014", "confirmed");
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(require("os").homedir() + "/.config/solana/id.json", "utf8"))));
const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
const program = new Program(IDL, provider);

async function main() {
  console.log("Program ID:", program.programId.toBase58());

  console.log("\n--- Content Records ---");
  try {
    const records = await program.account.contentRecord.all();
    console.log("Count:", records.length);
    for (const r of records) {
      console.log("  PDA:", r.publicKey.toBase58(), "| pHash:", r.account.pHash?.slice(0,16));
    }
  } catch(e) { console.error("contentRecord.all() FAILED:", e.message); }

  console.log("\n--- Dispute Records ---");
  try {
    const disputes = await program.account.disputeRecord.all();
    console.log("Count:", disputes.length);
    for (const d of disputes) {
      console.log("  PDA:", d.publicKey.toBase58(), "| prizePool:", d.account.prizePool?.toString());
    }
  } catch(e) { console.error("disputeRecord.all() FAILED:", e.message); }
}

main().catch(console.error);
