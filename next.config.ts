import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',        // gera pasta out/ para Firebase Hosting
  reactCompiler: true,
  images: {
    unoptimized: true,     // obrigatório em static export
  },
};

export default nextConfig;
