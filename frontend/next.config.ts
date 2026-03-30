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
};

export default nextConfig;
