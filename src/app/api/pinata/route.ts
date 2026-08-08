import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const pHash = formData.get("pHash") as string;

    if (!file || !pHash) {
      return NextResponse.json(
        { error: "File and pHash are required." },
        { status: 400 }
      );
    }

    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataApiSecret = process.env.PINATA_API_SECRET;

    if (!pinataApiKey || !pinataApiSecret) {
      return NextResponse.json(
        { error: "Pinata credentials are not configured on the server." },
        { status: 500 }
      );
    }

    // 1. Upload the image to IPFS
    const imageFormData = new FormData();
    imageFormData.append("file", file);

    const imageRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataApiSecret,
      },
      body: imageFormData as any,
    });

    if (!imageRes.ok) {
      const err = await imageRes.text();
      console.error("Pinata Image Upload Error:", err);
      return NextResponse.json({ error: "Failed to upload image to IPFS." }, { status: 500 });
    }

    const imageData = await imageRes.json();
    const imageUri = `ipfs://${imageData.IpfsHash}`;

    // 2. Upload the JSON metadata to IPFS
    const metadata = {
      name: "Kredence Original Content",
      symbol: "KRED",
      description: "Proof of Originality anchored on Solana using Commit-Reveal",
      image: imageUri,
      attributes: [
        {
          trait_type: "pHash",
          value: pHash,
        },
      ],
    };

    const metadataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataApiSecret,
      },
      body: JSON.stringify(metadata),
    });

    if (!metadataRes.ok) {
      const err = await metadataRes.text();
      console.error("Pinata Metadata Upload Error:", err);
      return NextResponse.json({ error: "Failed to upload metadata to IPFS." }, { status: 500 });
    }

    const metadataData = await metadataRes.json();
    const metadataUri = `ipfs://${metadataData.IpfsHash}`;

    return NextResponse.json({ metadataUri });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error." },
      { status: 500 }
    );
  }
}
