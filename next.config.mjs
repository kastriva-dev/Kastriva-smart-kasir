/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Logo dan ikon disajikan apa adanya supaya tidak butuh sharp di runtime Vercel/hosting statis.
  images: {unoptimized: true},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {key: "X-Content-Type-Options", value: "nosniff"},
          {key: "X-Frame-Options", value: "SAMEORIGIN"},
          {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
          {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()"},
          {key: "Cross-Origin-Opener-Policy", value: "same-origin"}
        ]
      },
      {
        // Endpoint API tidak boleh tersimpan di cache CDN maupun browser.
        source: "/api/:path*",
        headers: [{key: "Cache-Control", value: "no-store, max-age=0"}]
      }
    ];
  }
};

export default nextConfig;
