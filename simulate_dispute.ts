import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import * as fs from "fs";

const IDL = JSON.parse(fs.readFileSync("/Users/parthbadgire/projects/kredence/src/lib/idl.json", "utf8"));
const PROGRAM_ID = new PublicKey(IDL.address || "EMrHDb9yk3cjnnj2czRa7MRi6PTjWJukUnZ2Zt3jWNv6");
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014", "confirmed");

// create a dummy wallet
const keypair = Keypair.generate();
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
const program = new Program(IDL as Idl, provider);

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
      } as any)
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
