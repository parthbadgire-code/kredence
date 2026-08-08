import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, generateSigner } from "@metaplex-foundation/umi";
import { createTree } from "@metaplex-foundation/mpl-bubblegum";
import * as fs from "fs";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com");
  
  // Use local solana keypair
  const secretKey = new Uint8Array(
    JSON.parse(fs.readFileSync("/Users/parthbadgire/.config/solana/id.json", "utf-8"))
  );
  const myKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  umi.use(keypairIdentity(myKeypair));

  const merkleTree = generateSigner(umi);
  console.log("Creating Merkle Tree...", merkleTree.publicKey);

  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    public: true,
  });

  await builder.sendAndConfirm(umi);

  console.log("Tree created successfully!");
  console.log("Address:", merkleTree.publicKey);
}

main().catch(console.error);
