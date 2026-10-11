/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:4000';

const nextConfig = {
  // Proxy /api/* to the Express server so the browser only ever talks to one
  // origin. That keeps the httpOnly auth cookie same-site and avoids CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
