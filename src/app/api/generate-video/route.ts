import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";

export const maxDuration = 300; // 5 min timeout for video generation

export async function POST(req: NextRequest) {
    try {
        const { image_base64, gender } = await req.json();

        if (!image_base64) {
            return NextResponse.json({ error: "image_base64 is required" }, { status: 400 });
        }

        const hfToken = process.env.HF_TOKEN;
        if (!hfToken) {
            return NextResponse.json({ error: "HF_TOKEN not configured" }, { status: 500 });
        }

        const pronoun = gender === "male" ? "he" : "she";

        const prompt = `Using the provided image as the starting frame, the subject performs a slow, perfectly smooth 360-degree rotation on a studio turntable. Action: The subject performs a slow, deliberate, and complete 360-degree pivot on the spot, showing the front, profile, and exact back of the outfit. Upon returning to the 0-degree front-facing position, ${pronoun} fluidly transitions into dynamic fashion poses including a runway walk and a hand-on-hip stance. The garments are locked; the clothing features zero texture popping, zero morphing, and remains 100% physically consistent from all angles. Camera: Locked-off, static tripod shot, eye-level. Environment: Infinite white cyc-wall studio with bright, softbox lighting. Highly detailed, photorealistic, flawless temporal consistency.`;

        // Convert base64 to blob
        const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const imageBlob = new Blob([imageBuffer], { type: "image/png" });

        const client = await Client.connect("zerogpu-aoti/wan2-2-fp8da-aoti-faster", {
            token: hfToken as `hf_${string}`,
        });

        const result = await client.predict("/generate_video", {
            input_image: imageBlob,
            prompt,
            steps: 6,
            negative_prompt: "色调艳丽, 过曝, 静态, 细节模糊不清, 字幕, 风格, 作品, 画作, 画面, 静止, 整体发灰, 最差质量, 低质量, JPEG压缩残留, 丑陋的, 残缺的, 多余的手指, 画得不好的手部, 画得不好的脸部, 畸形的, 毁容的, 形态畸形的肢体, 手指融合, 静止不动的画面, 杂乱的背景, 三条腿, 背景人很多, 倒着走",
            duration_seconds: 5,
            guidance_scale: 1,
            guidance_scale_2: 1,
            seed: 42,
            randomize_seed: true,
        });

        const data = result.data as Array<{ url?: string; path?: string }>;

        // The result typically contains a video file URL or path
        if (data && data.length > 0) {
            const videoInfo = data[0];

            // If we get a URL, fetch the video and return as base64
            if (videoInfo && typeof videoInfo === "object" && videoInfo.url) {
                const videoResp = await fetch(videoInfo.url);
                const videoBuffer = await videoResp.arrayBuffer();
                const videoBase64 = Buffer.from(videoBuffer).toString("base64");
                return NextResponse.json({
                    video: `data:video/mp4;base64,${videoBase64}`,
                });
            }

            // If it's a direct value
            return NextResponse.json({ video: data[0] });
        }

        return NextResponse.json({ error: "No video generated" }, { status: 500 });
    } catch (err: unknown) {
        console.error("Video generation error:", err);
        const message = err instanceof Error ? err.message : "Video generation failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
