import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

// Load shared repo-level env so frontend can run from ./frontend while using ../.env.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {
    turbopack: {
        root: __dirname,
    },
    allowedDevOrigins: ['192.168.3.117'],
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
    async rewrites() {
        const backendUrl =
            process.env.BACKEND_URL ||
            process.env.NEXT_PUBLIC_BACKEND_URL ||
            process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL ||
            'http://127.0.0.1:8080';
        return [
            {
                source: '/go-api/:path*',
                destination: `${backendUrl}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
