import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Upload de materiais passa por Server Action; o padrão do Next é 1 MB.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
