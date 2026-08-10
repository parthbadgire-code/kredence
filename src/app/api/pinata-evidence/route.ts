import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string;
    const referenceUrl = formData.get("referenceUrl") as string;

    if (!description) {
      return NextResponse.json(
        { error: "Description is required." },
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

    let imageUri = "";

    // 1. Upload the image to IPFS if provided
    if (file && file.size > 0) {
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
      imageUri = `ipfs://${imageData.IpfsHash}`;
    }

    // 2. Upload the JSON metadata to IPFS
    const metadata = {
      name: "Kredence Dispute Evidence",
      description: description,
      image: imageUri,
      external_url: referenceUrl || "",
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

    return NextResponse.json({ evidenceUrl: metadataUri });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error." },
      { status: 500 }
    );
  }
}
