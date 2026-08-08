# Kredence 🛡️

**Kredence** is a decentralized, on-chain protocol built on Solana that protects digital creators by establishing immutable proof of originality and providing a trustless licensing mechanism. 

## 🚨 The Problem
In the modern digital landscape, content is easily stolen. Memes are reposted without credit, digital art is scraped and sold, and timestamps on centralized platforms (like Instagram or Twitter) can be faked, manipulated, or lost if the platform shuts down. Creators have no mathematically verifiable way to prove they were the original author, nor an easy way to get paid when their content goes viral.

## 💡 The Kredence Solution
Kredence leverages Solana's high throughput and low costs to solve this through a **Commit-Reveal scheme combined with Compressed NFTs (cNFTs)**.

1. **In-Browser Hashing**: We generate a unique SHA-256 fingerprint (pHash) of an image entirely locally. Your unminted art never hits a centralized server before protection is verified.
2. **Immutable Commitment**: We store this fingerprint in a Solana Program Derived Address (PDA). The blockchain timestamps this transaction forever.
3. **cNFT Receipts**: The protocol issues a gas-efficient compressed NFT to the creator's wallet acting as a verifiable receipt.
4. **Trustless Licensing**: Any buyer can verify if an image is claimed and purchase a license in one click, routing a 0.1 SOL royalty directly to the original creator.

## 🏗️ Architecture Flow

```ascii
+-------------+      (1) Upload       +------------------+
|             | --------------------> |                  |
|   Creator   |                       |    IPFS /        |
|   Wallet    | <-------------------- |    Pinata        |
|             |      (2) File URI     +------------------+
+------+------+
       |
       | (3) Hash + URI + Commit 
       v
+-----------------------------+
|    Kredence Anchor          |
|    Smart Contract           |
+------+---------------+------+
       |               |
       | (4) Save PDA  | (5) CPI Mint
       v               v
+------------+  +-----------------+
| Content    |  | Metaplex        |
| Record PDA |  | Bubblegum       |
| (On-Chain) |  | Program         |
+------------+  +--------+--------+
                         |
                         | (6) Issue cNFT
                         v
                  +-------------+
                  |             |
                  |   Merkle    |
                  |   Tree      |
                  |             |
                  +-------------+
                         
+-------------+                        +------------+
|             | (7) Check Originality  |            |
|   Buyer     | ---------------------> |  Kredence  |
|   Wallet    | <--------------------- |  Frontend  |
|             | (8) Royalty (0.1 SOL)  |            |
+-------------+ ---------------------> +------------+
                                        (Pays Creator)
```

## 🔬 Technical Highlights

### 1. Deterministic PDA Collision Prevention
The core state of Kredence is the `ContentRecord` PDA. The seed for this PDA is the actual SHA-256 hash of the image. Because the hash acts as the seed, **it is mathematically impossible to register the same image twice**. The smart contract will automatically reject any subsequent transaction trying to initialize a PDA that already exists, ensuring the original creator's timestamp is preserved forever.

### 2. State Rent Optimization via cNFTs
Traditional NFTs on Solana cost roughly ~0.012 SOL in state rent because they store data in individual accounts. Kredence utilizes **Metaplex Bubblegum** to mint Compressed NFTs (cNFTs) into a shared public Merkle Tree. This pushes the state into the ledger (rather than active RAM), dropping the minting cost to a fraction of a cent per NFT. This makes Kredence scalable for millions of digital assets.

## 🚀 Local Setup Instructions

If you'd like to test the Kredence dApp locally, follow these steps:

### Prerequisites
- Node.js 18+
- Rust & Anchor CLI installed
- Solana Tool Suite installed (`solana-test-validator`)

### 1. Start the Solana Localnet
Open a terminal and start the validator:
```bash
solana-test-validator
```

### 2. Deploy the Smart Contract
In a new terminal, build and deploy the Anchor program:
```bash
cd anchor_kredence
anchor build
anchor deploy
```

### 3. Initialize the Merkle Tree
To support compressed NFTs, you must generate a shared Merkle Tree on your localnet:
```bash
npx tsx scripts/create-tree.ts
```
*Note: Make sure to update `MERKLE_TREE_ADDRESS` in `src/lib/constants.ts` if the script generates a new address.*

### 4. Run the Web App
Configure your environment variables:
```bash
cp .env.local.example .env.local
# Add your Pinata API keys
```

Start the Next.js development server:
```bash
npm install
npm run dev
```
Navigate to `http://localhost:3000` to start protecting and licensing your digital media!

## 🛠 Tech Stack
- **Frontend:** Next.js 15, React 19, TailwindCSS v4, Web3.js
- **Smart Contract:** Solana, Anchor Framework, Rust
- **Infrastructure:** Metaplex Bubblegum (cNFTs), SPL Account Compression, Pinata (IPFS)
