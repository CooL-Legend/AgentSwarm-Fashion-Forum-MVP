import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const maxDuration = 60;

// Build JWT for GCP service account auth
function createJWT(email: string, key: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    })).toString("base64url");

    const signInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signInput);
    const signature = sign.sign(key, "base64url");

    return `${signInput}.${signature}`;
}

function cleanPrivateKey(raw: string): string {
    // Strip headers/footers, keep only valid base64 chars, rebuild PKCS#8.
    let key = raw.replace(/"/g, "");
    key = key.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "");
    key = key.replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "");
    // Keep only valid base64 characters
    key = key.replace(/[^A-Za-z0-9+/=]/g, "");
    // Rebuild with 64-char lines
    let pem = "-----BEGIN PRIVATE KEY-----\n";
    for (let i = 0; i < key.length; i += 64) {
        pem += key.slice(i, i + 64) + "\n";
    }
    pem += "-----END PRIVATE KEY-----\n";
    return pem;
}

async function getAccessToken(): Promise<string> {
    const email = process.env.GOOGLE_CLIENT_EMAIL?.replace(/"/g, "") || "";
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
    const privateKey = cleanPrivateKey(rawKey);

    const jwt = createJWT(email, privateKey);

    const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OAuth failed: ${text}`);
    }

    const data = await resp.json();
    return data.access_token;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { person_image, cloth_image, cloth_image_url } = body;

        if (!person_image) {
            return NextResponse.json({ error: "Person image is required" }, { status: 400 });
        }

        // Resolve cloth image: either base64 or fetch from URL
        let clothBase64 = cloth_image || "";
        if (!clothBase64 && cloth_image_url) {
            const imgResp = await fetch(cloth_image_url);
            if (!imgResp.ok) {
                return NextResponse.json({ error: "Failed to fetch garment image" }, { status: 400 });
            }
            const buf = await imgResp.arrayBuffer();
            clothBase64 = Buffer.from(buf).toString("base64");
        }

        if (!clothBase64) {
            return NextResponse.json({ error: "Garment image is required" }, { status: 400 });
        }

        // Strip data URL prefix if present
        const personBase64 = person_image.includes(",")
            ? person_image.split(",")[1]
            : person_image;
        const clothClean = clothBase64.includes(",")
            ? clothBase64.split(",")[1]
            : clothBase64;

        const accessToken = await getAccessToken();

        const projectId = process.env.GOOGLE_PROJECT_ID?.replace(/"/g, "") || "";
        const location = "us-central1";
        const model = "virtual-try-on-001";
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

        const payload = {
            instances: [{
                personImage: { image: { bytesBase64Encoded: personBase64 } },
                productImages: [{ image: { bytesBase64Encoded: clothClean } }],
            }],
            parameters: {
                sampleCount: 1,
                personGeneration: "allow_adult",
            },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 50000);

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!resp.ok) {
            const text = await resp.text();
            return NextResponse.json(
                { error: `VTON API error: ${text}` },
                { status: resp.status }
            );
        }

        const result = await resp.json();

        // Extract the generated image from the response
        const predictions = result.predictions || [];
        if (predictions.length === 0) {
            return NextResponse.json({ error: "No result generated" }, { status: 500 });
        }

        // The response contains bytesBase64Encoded in the prediction
        const outputImage = predictions[0]?.bytesBase64Encoded
            || predictions[0]?.image?.bytesBase64Encoded
            || null;

        return NextResponse.json({
            success: true,
            image: outputImage ? `data:image/png;base64,${outputImage}` : null,
            raw: !outputImage ? predictions[0] : undefined,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Try-on failed";
        const isTimeout = err instanceof Error && err.name === "AbortError";
        return NextResponse.json(
            { error: isTimeout ? "Try-on request timed out" : message },
            { status: 502 }
        );
    }
}
