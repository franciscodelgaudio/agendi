import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF sai bem menor que WebP na mesma qualidade; 90 deixa o texto dos prints nítido.
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
  },
};

export default nextConfig;
