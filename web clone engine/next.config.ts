import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Phones on the same network open the dev server by its LAN address. Without this, Next refuses the HMR
  // socket from that origin and the page never hydrates (taps and swipes do nothing). Dev-only setting.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
