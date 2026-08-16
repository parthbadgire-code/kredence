const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const fs = require("fs");

const IDL = JSON.parse(fs.readFileSync("/Users/parthbadgire/projects/kredence/src/lib/idl.json", "utf8"));
const connection = new Connection("https://devnet.helius-rpc.com/?api-key=607fb582-f22d-48ff-be88-cde253c0f014", "confirmed");
const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" });
const program = new Program(IDL, provider);

async function main() {
  const NEW_DISPUTE_SIZE = 123;
  const rawAccounts = await connection.getProgramAccounts(program.programId, {
    filters: [{ dataSize: NEW_DISPUTE_SIZE }],
  });
  for (const a of rawAccounts) {
    const decoded = program.coder.accounts.decode("disputeRecord", a.account.data);
    console.log("PDA:", a.pubkey.toBase58());
    console.log("  isResolved:", decoded.isResolved);
    console.log("  endTime:", new Date(decoded.endTime.toNumber() * 1000).toLocaleString());
    const timeLeft = decoded.endTime.toNumber() - Math.floor(Date.now() / 1000);
    console.log("  timeLeft (s):", timeLeft);
  }
}
main().catch(console.error);
