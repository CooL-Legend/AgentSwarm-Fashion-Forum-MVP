import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    turbopack: {
        root: __dirname,
    },
    allowedDevOrigins: ['192.168.3.117'],
};

export default nextConfig;
