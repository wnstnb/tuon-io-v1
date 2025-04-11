/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Make sure NEXT_PUBLIC_* variables are available on both client and server
    GEMINI_API_KEY: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  },
};

module.exports = nextConfig; 