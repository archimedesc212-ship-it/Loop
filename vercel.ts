// Vercel serves the Vite build and reverse-proxies /api to the persistent
// Render Express service. The browser stays on one origin, preserving the
// existing SameSite=Strict cookies and CSRF flow.
const apiOrigin = process.env.LOOP_API_ORIGIN;

if (!apiOrigin) {
  throw new Error(
    'Missing LOOP_API_ORIGIN. Set it in Vercel Project Settings to the HTTPS origin of the Render API service.',
  );
}

const parsedApiOrigin = new URL(apiOrigin);
if (parsedApiOrigin.protocol !== 'https:' || parsedApiOrigin.pathname !== '/' ||
    parsedApiOrigin.search || parsedApiOrigin.hash || parsedApiOrigin.username ||
    parsedApiOrigin.password) {
  throw new Error('LOOP_API_ORIGIN must be a bare HTTPS origin, e.g. https://loop-muse.onrender.com');
}

export const config = {
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'frontend/dist',
  rewrites: [
    {
      source: '/api/:path*',
      destination: `${parsedApiOrigin.origin}/api/:path*`,
    },
    {
      source: '/:path*',
      destination: '/index.html',
    },
  ],
};
