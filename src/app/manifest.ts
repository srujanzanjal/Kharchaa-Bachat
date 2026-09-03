import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kharchaa Bachat",
    short_name: "Kharchaa",
    description: "Track discretionary food spending for two.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#131211",
    theme_color: "#131211",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
