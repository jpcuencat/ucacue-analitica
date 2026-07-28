/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@langchain/langgraph-sdk"],
  // El binario nativo de canvas (render del gráfico para WhatsApp) no debe
  // empaquetarse: se carga vía require en runtime.
  serverExternalPackages: ["@napi-rs/canvas"],
  rewrites: async () => [
    {
      source: "/api/lg/:path*",
      destination: `${process.env.LANGGRAPH_INTERNAL_URL ?? "http://localhost:2024"}/:path*`,
    },
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Permite embedding como iframe desde cualquier origen (requerido para Azure SWA)
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          // Endurecimiento (OWASP A02): no cambian el comportamiento del embed
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
