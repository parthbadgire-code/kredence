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

const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("mint_authority")],
  PROGRAM_ID
);
console.log("mint_authority_pda:", mintAuthorityPda.toBase58());

async function main() {
  const disputes = await program.account.disputeRecord.all();
  console.log("Active disputes:", disputes.length);
  for (const d of disputes) {
    console.log("Dispute PDA:", d.publicKey.toBase58());
    console.log("  content_mint:", d.account.contentMint.toBase58());
    console.log("  creator:", d.account.creator.toBase58());
    console.log("  end_time:", d.account.endTime.toNumber());
    console.log("  is_resolved:", d.account.isResolved);
    console.log("  original_votes:", d.account.originalVotes.toString());
    console.log("  counterfeit_votes:", d.account.counterfeitVotes.toString());
  }
}

main().catch(console.error);
