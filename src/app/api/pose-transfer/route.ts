import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const maxDuration = 60;

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
    let key = raw.replace(/"/g, "");
    key = key.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "");
    key = key.replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "");
    key = key.replace(/[^A-Za-z0-9+/=]/g, "");
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

const POSE_TRANSFER_PROMPT = `You are given two input images:

- Image 1 (Ground Truth / Source Image): the authoritative source for the person's identity, face, body shape, skin tone, hairstyle, and the exact garment appearance.
- Image 2 (Pose Reference Image): use this image only for the target pose, body orientation, arm placement, leg placement, camera framing, and overall composition.

## Task
Generate a new image where:
- the person and garment come from Image 1
- the pose and body arrangement come from Image 2

## Strict constraints
1. Preserve identity from Image 1
   - keep the same face
   - keep the same hairstyle, skin tone, body proportions, and overall appearance
   - do not change the person into someone else

2. Preserve garment from Image 1 exactly
   - keep the same garment type
   - keep the same color
   - keep the same print/pattern
   - keep the same texture/material appearance
   - keep the same fit, length, silhouette, sleeves, neckline, and garment details
   - do not redesign, restyle, embellish, simplify, or replace the garment

3. Use Image 2 only for pose
   - transfer only the pose, body posture, limb placement, and viewpoint/composition
   - do not copy the identity, face, hair, clothing, or background from Image 2

4. Output requirements
   - generate a realistic single-person image
   - maintain natural anatomy
   - maintain correct garment drape under the new pose
   - preserve folds and tension in a realistic way
   - avoid deformation, duplication of limbs, warped hands, broken garment edges, or inconsistent sleeves
   - no extra garments, no accessories unless already present in Image 1
   - no extra people

5. Background behavior
   - keep background clean and neutral unless explicitly instructed otherwise
   - do not copy distracting background elements from either input unless required

## Priority order
If there is any conflict, follow this order:
1. identity from Image 1
2. garment fidelity from Image 1
3. pose from Image 2
4. clean realistic composition

## Negative instructions
Do not:
- change the garment design
- change garment colors
- mix clothing from the two images
- copy face/identity from Image 2
- generate multiple people
- crop out important garment regions
- hallucinate unseen garment features unless absolutely required for pose realism

## Final output
Return one realistic pose-transferred image of the same person from Image 1 wearing the same garment from Image 1, but posed according to Image 2.`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { result_image, pose_image } = body;

        if (!result_image) {
            return NextResponse.json({ error: "Result image is required" }, { status: 400 });
        }
        if (!pose_image) {
            return NextResponse.json({ error: "Pose image is required" }, { status: 400 });
        }

        // Strip data URL prefix from both images
        const resultBase64 = result_image.includes(",")
            ? result_image.split(",")[1]
            : result_image;
        const poseBase64 = pose_image.includes(",")
            ? pose_image.split(",")[1]
            : pose_image;

        const accessToken = await getAccessToken();

        const projectId = process.env.GOOGLE_PROJECT_ID?.replace(/"/g, "") || "";
        const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-image-preview";
        const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:generateContent`;

        const payload = {
            contents: [{
                role: "user",
                parts: [
                    { inlineData: { mimeType: "image/png", data: resultBase64 } },
                    { inlineData: { mimeType: "image/png", data: poseBase64 } },
                    { text: POSE_TRANSFER_PROMPT },
                ],
            }],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
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
                { error: `Gemini API error: ${text}` },
                { status: resp.status },
            );
        }

        const result = await resp.json();

        const parts = result.candidates?.[0]?.content?.parts || [];
        let outputImage: string | null = null;

        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith("image/")) {
                const mime = part.inlineData.mimeType;
                outputImage = `data:${mime};base64,${part.inlineData.data}`;
                break;
            }
        }

        if (!outputImage) {
            return NextResponse.json({ error: "No image generated by model" }, { status: 500 });
        }

        return NextResponse.json({ success: true, image: outputImage });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pose transfer failed";
        const isTimeout = err instanceof Error && err.name === "AbortError";
        return NextResponse.json(
            { error: isTimeout ? "Pose transfer request timed out" : message },
            { status: 502 },
        );
    }
}
