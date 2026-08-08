# Devnet Deployment Guide

Follow these exact CLI commands to configure your local environment for Devnet, airdrop SOL, build, and deploy the Kredence smart contract.

### 1. Configure Solana CLI for Devnet
First, ensure your Solana CLI is targeting the Devnet cluster instead of Localnet.

```bash
solana config set --url devnet
```

### 2. Airdrop Devnet SOL
You need Devnet SOL to pay for the deployment costs. Run this command to airdrop 2 SOL to your default keypair:

```bash
solana airdrop 2
```
*Note: If the airdrop fails due to rate limits, try airdropping 1 SOL instead, or use the [Solana Faucet website](https://faucet.solana.com).*

### 3. Build the Anchor Program
Navigate to the `anchor_kredence` directory and build the program to ensure the artifacts are up-to-date.

```bash
cd anchor_kredence
anchor build
```

### 4. Deploy the Program
Now deploy the compiled program to Devnet using Anchor. Anchor uses the `[provider]` cluster settings in `Anchor.toml`, which is now set to `devnet`.

```bash
anchor deploy
```

### 5. Create a Devnet Merkle Tree
After the contract is successfully deployed, you'll need to create a new public Merkle Tree on Devnet for compressed NFTs.

```bash
cd ..  # Go back to the root kredence directory
npx tsx scripts/create-tree.ts
```
*Wait for the script to finish and print the new Merkle Tree address.*

### 6. Update Environment Variables
Once deployed and the tree is created, update your `.env.local` file with the Devnet configurations:

```env
NEXT_PUBLIC_RPC_URL="https://api.devnet.solana.com"
NEXT_PUBLIC_PROGRAM_ID="J8zY5tEUxTsz5U6EUPyreRn4vU2ZrxutWAWZtxyJptbp"
```

Also, don't forget to update the `MERKLE_TREE_ADDRESS` in `src/lib/constants.ts` with the new address generated in Step 5!

After making these updates, restart your Next.js server (`npm run dev`) and you're fully running on Devnet!
