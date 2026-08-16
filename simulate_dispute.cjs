const { Connection, PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const fs = require("fs");

const IDL = JSON.parse(fs.readFileSync("/Users/parthbadgire/projects/kredence/src/lib/idl.json", "utf8"));
const PROGRAM_ID = new PublicKey(IDL.address || "EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014", "confirmed");

// Use an existing Devnet wallet for fee payer to avoid AccountNotFound
const keypairPath = require("os").homedir() + "/.config/solana/id.json";
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(IDL, provider);

async function main() {
  try {
    const contentMint = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;

    const [disputeRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dispute"), contentMint.toBuffer()],
      program.programId
    );

    console.log("Creating dispute for", contentMint.toBase58());
    const tx = await program.methods
      .createDispute()
      .accounts({
        disputeRecord: disputeRecordPda,
        contentMint: contentMint,
        creator: creator,
        challenger: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    console.log("Simulating transaction...");
    const sim = await connection.simulateTransaction(tx, [keypair]);
    console.log(JSON.stringify(sim.value, null, 2));

  } catch (e) {
    console.error(e);
  }
}

main();
