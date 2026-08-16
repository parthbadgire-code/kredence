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
  } catch(e) { console.error("contentRecord.all() FAILED:", e.message); }

  console.log("\n--- Dispute Records ---");
  try {
    const NEW_DISPUTE_SIZE = 123;
    const rawAccounts = await connection.getProgramAccounts(program.programId, {
      filters: [{ dataSize: NEW_DISPUTE_SIZE }],
    });
    console.log("Raw Accounts size 123 Count:", rawAccounts.length);
    for (const a of rawAccounts) {
      try {
        const decoded = program.coder.accounts.decode("disputeRecord", a.account.data);
        console.log("  Decoded OK:", a.pubkey.toBase58());
      } catch(e) {
        console.log("  Decode FAILED for", a.pubkey.toBase58(), ":", e.message);
      }
    }
  } catch(e) { console.error("dispute records FAILED:", e.message); }
}

main().catch(console.error);
