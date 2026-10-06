import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Evita que o Next escolha uma pasta acima do projeto quando há outro package-lock.json
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  images: {
    // Fotos servidas em AVIF/WebP no tamanho exato de cada tela (Retina/4K inclusos)
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1440, 1920, 2560, 3840],
    imageSizes: [48, 64, 96, 128, 192, 256, 384, 512],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
