import {
  ActionPostResponse,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
  createActionHeaders,
} from "@solana/actions";
import { Connection, PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import IDL from "@/lib/idl.json";
import { deriveContentRecordPDA } from "@/lib/constants";

// Create the standard headers for this route (including CORS)
const headers = createActionHeaders();

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const hash = url.searchParams.get("hash");

  // We require a hash to know which media to license
  if (!hash) {
    return new Response("Missing 'hash' query parameter", {
      status: 400,
      headers,
    });
  }

  const payload: ActionGetResponse = {
    title: "License Kredence Media",
    icon: "https://ucarecdn.com/7aa46c85-08a4-4bc7-9376-88ec48bb1f43/-/preview/1000x1000/", // Generic Solana/Kredence placeholder
    description: "Secure the commercial rights to this original content verified by Kredence.",
    label: "License for 0.1 SOL",
  };

  return Response.json(payload, {
    headers,
  });
};

export const OPTIONS = async () => Response.json(null, { headers });

export const POST = async (req: Request) => {
  try {
    const url = new URL(req.url);
    const hash = url.searchParams.get("hash");

    if (!hash) {
      return new Response("Missing 'hash' query parameter", {
        status: 400,
        headers,
      });
    }

    const body: ActionPostRequest = await req.json();
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers,
      });
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
    );
    
    // Create a dummy wallet to initialize the Anchor Provider on the server
    const dummyWallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async () => { throw new Error("Server cannot sign"); },
      signAllTransactions: async () => { throw new Error("Server cannot sign"); },
    };
    
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    const program = new Program(IDL as Idl, provider);

    const [pda] = deriveContentRecordPDA(hash);
    
    let record: any;
    try {
        record = await (program.account as any).contentRecord.fetch(pda);
    } catch(e) {
        return new Response("Content Record not found for this hash.", {
            status: 404,
            headers,
        });
    }

    const creatorWallet = record.creator;

    if (creatorWallet.equals(account)) {
      return new Response("You cannot license your own content.", {
        status: 400,
        headers,
      });
    }

    // Build the instruction
    const ix = await (program.methods as any)
      .purchaseLicense(new BN(100_000_000)) // 0.1 SOL
      .accounts({
        buyer: account,
        creatorWallet,
        contentRecord: pda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const latestBlockhash = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      feePayer: account,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }).add(ix);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: "Successfully purchased Kredence license!",
      },
    });

    return Response.json(payload, {
      headers,
    });
  } catch (err) {
    console.error(err);
    return new Response("An unknown error occurred", { status: 500, headers });
  }
};
