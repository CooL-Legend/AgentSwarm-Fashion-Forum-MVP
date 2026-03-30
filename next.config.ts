import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

// Load project-level env from repo root.
dotenv.config({ path: path.resolve(__dirname, ".env") });

const nextConfig: NextConfig = {
    turbopack: {
        root: __dirname,
    },
    allowedDevOrigins: ['192.168.3.117'],
};

export default nextConfig;
