import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 8080,
        open: true,
        proxy: {
            // OSRM Primary - Project OSRM
            '/api/osrm': {
                target: 'https://router.project-osrm.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/osrm/, '')
            },
            // OSRM Fallback 1 - OpenStreetMap Germany (car)
            '/api/osrm2': {
                target: 'https://routing.openstreetmap.de/routed-car',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/osrm2/, '')
            },
            // OSRM Fallback 2 - Project OSRM (retry)
            '/api/osrm3': {
                target: 'https://router.project-osrm.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/osrm3/, '')
            }
        }
    }
});


