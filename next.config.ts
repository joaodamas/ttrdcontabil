import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Firebase Admin SDK usa módulos Node.js — precisa rodar no servidor
  serverExternalPackages: ['firebase-admin'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
};

export default nextConfig;
