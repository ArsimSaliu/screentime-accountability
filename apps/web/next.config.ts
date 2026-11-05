import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Every page here depends on the signed-in user, so we use classic dynamic
  // rendering instead of Cache Components.
  transpilePackages: ['@screentime/shared'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
