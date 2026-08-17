# Kredence 🛡️

**Kredence** is a decentralized, on-chain protocol built on Solana that protects digital creators by establishing immutable proof of originality, providing trustless licensing mechanisms, and maintaining a community-governed dispute resolution system. 

## 🚨 The Problem
In the modern digital landscape, content is easily stolen. Memes are reposted without credit, digital art is scraped and sold, and timestamps on centralized platforms (like Instagram or Twitter) can be faked, manipulated, or lost if the platform shuts down. Creators have no mathematically verifiable way to prove they were the original author, nor an easy way to get paid when their content goes viral. Furthermore, when art *is* stolen and minted, decentralized networks lack a built-in mechanism to flag and punish bad actors.

## 💡 The Kredence Solution
Kredence leverages Solana's high throughput and low costs to solve this through a **Commit-Reveal scheme combined with Compressed NFTs (cNFTs) and Game-Theoretic Disputes**.

1. **In-Browser Hashing**: We generate a unique SHA-256 fingerprint (pHash) of an image entirely locally. Your unminted art never hits a centralized server before protection is verified.
2. **Immutable Commitment**: We store this fingerprint in a Solana Program Derived Address (PDA). The blockchain timestamps this transaction forever.
3. **cNFT Receipts**: The protocol issues a gas-efficient compressed NFT to the creator's wallet acting as a verifiable receipt.
4. **Community Disputes**: Anyone can stake SOL to challenge the originality of content. The community votes using a reputation token, and if proven stolen, **ownership of the content is programmatically transferred to the whistleblower**.
5. **Trustless Licensing**: Any buyer can verify if an image is claimed and purchase a license in one click, routing a 0.1 SOL royalty directly to the verified creator.

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
```

## ⚖️ The Dispute & Whistleblower System
Kredence is self-policing. If a bad actor uploads someone else's art, the community can challenge it.

1. **Stake to Challenge**: A whistleblower (Challenger) stakes 0.05 SOL to open a `DisputeRecord` on-chain.
2. **Reputation Voting**: The community has a 2-minute window to vote using `KRED_REP` (a Token-2022 reputation token). The smart contract tallies the votes.
3. **Whistleblower Ownership Transfer**: If the Challenger wins, the smart contract physically mutates the `ContentRecord` PDA, replacing the `creator` public key with the `challenger` public key. The Challenger becomes the permanent owner, and the staked SOL is distributed pro-rata to voters who chose the winning side.

## 🔬 Technical Highlights

### 1. Deterministic PDA Collision Prevention
The core state of Kredence is the `ContentRecord` PDA. The seed for this PDA is the actual SHA-256 hash of the image. Because the hash acts as the seed, **it is mathematically impossible to register the same image twice**. The smart contract automatically rejects any transaction trying to initialize a PDA that already exists.

### 2. State Rent Optimization via cNFTs
Traditional NFTs on Solana cost roughly ~0.012 SOL in state rent. Kredence utilizes **Metaplex Bubblegum** to mint Compressed NFTs (cNFTs) into a shared public Merkle Tree. The actual data is pushed to the Solana ledger via the SPL Noop (Log Wrapper) program, dropping the minting cost to a fraction of a cent.

### 3. Cross-Program Invocations (CPI)
Kredence makes advanced use of CPIs to directly communicate with the Metaplex Bubblegum program to mint cNFTs securely. The Kredence PDA programmatically signs the transaction using its bump seeds.

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
- **Infrastructure:** Metaplex Bubblegum (cNFTs), SPL Account Compression, Token-2022, Pinata (IPFS)
