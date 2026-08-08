# Kredence 🛡️

**Kredence** is a fully functional, decentralized content registry and licensing protocol built on Solana. It solves two major problems for digital creators: proving that they created an asset first, and getting paid directly when someone else wants to license and use it.

## 🌟 Core Features

- **In-Browser Hashing:** Images are hashed locally in your browser using SHA-256 (pHash generation) so unminted raw files never hit a centralized server before protection is verified.
- **On-Chain Originality Proof:** Securely stores the cryptographic fingerprint of your image on the Solana blockchain inside a Program Derived Address (PDA) to prove who registered it first.
- **Compressed NFTs (cNFTs):** Uses Metaplex Bubblegum to instantly mint a compressed NFT to the creator's wallet. This acts as an immutable, gas-efficient receipt of ownership.
- **Trustless Licensing:** A secure payment gateway that enforces licensing rules, preventing self-licensing, and guaranteeing that a 0.1 SOL royalty is routed directly to the original creator's wallet.
- **IPFS Storage:** Metadata is securely pinned to IPFS via Pinata.

## 🏛️ Architecture

### 1. The Smart Contract (Rust / Anchor)
The Anchor program (`anchor_kredence`) handles the core logic and CPIs (Cross-Program Invocations):
- `commit_content`: Registers the image hash securely on-chain.
- `reveal_and_mint`: Executes a CPI to Metaplex Bubblegum to mint a cNFT to a shared public Merkle Tree.
- `purchase_license`: Securely transfers 0.1 SOL from a buyer to the verified creator.

### 2. The Web Application (Next.js / TailwindCSS)
The UI abstracts away the blockchain complexity into a sleek, dark-mode experience with two main actions:
- **Card 1 (Commit & Mint - For Creators)**: Drag-and-drop an image to automatically hash it, upload to IPFS, and mint the receipt on Solana.
- **Card 2 (Verify & License - For Buyers)**: Drag-and-drop any image to instantly query the blockchain. If the image is claimed, it reveals the creator's wallet and provides a 1-click "Purchase License" button.

## 🚀 Getting Started (Localnet)

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
