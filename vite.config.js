import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 8080,
        open: true,
        proxy: {
            // OSRM Primary - Project OSRM (driving)
            '/api/osrm': {
                target: 'https://router.project-osrm.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/osrm/, '')
            },
            // OSRM Fallback - OpenStreetMap Germany (car)
            '/api/osrm-car': {
                target: 'https://routing.openstreetmap.de/routed-car',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/osrm-car/, '')
            },
            // TomTom Routing Fallback (uses existing API key)
            '/api/tomtom-routing': {
                target: 'https://api.tomtom.com/routing/1',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/tomtom-routing/, '')
            }
        }
    }
});
