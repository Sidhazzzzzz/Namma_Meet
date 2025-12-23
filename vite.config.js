import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
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
                // TomTom Routing Fallback
                '/api/tomtom-routing': {
                    target: 'https://api.tomtom.com/routing/1',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api\/tomtom-routing/, '')
                },
                // TomTom Search API Proxy (for autocomplete)
                '/api/tomtom-search': {
                    target: 'https://api.tomtom.com',
                    changeOrigin: true,
                    rewrite: (path) => {
                        const url = new URL(path, 'http://localhost');
                        const query = url.searchParams.get('query') || '';
                        const limit = url.searchParams.get('limit') || '5';
                        const lat = url.searchParams.get('lat') || '12.9716';
                        const lon = url.searchParams.get('lon') || '77.5946';
                        return `/search/2/search/${encodeURIComponent(query)}.json?key=${env.VITE_TOMTOM_API_KEY}&limit=${limit}&countrySet=IN&lat=${lat}&lon=${lon}&radius=50000&typeahead=true`;
                    }
                },
                // TomTom Venue Search Proxy
                '/api/tomtom-venue': {
                    target: 'https://api.tomtom.com',
                    changeOrigin: true,
                    rewrite: (path) => {
                        const url = new URL(path, 'http://localhost');
                        const category = url.searchParams.get('category') || 'cafe';
                        const lat = url.searchParams.get('lat') || '12.9716';
                        const lon = url.searchParams.get('lon') || '77.5946';
                        const radius = url.searchParams.get('radius') || '5000';
                        const limit = url.searchParams.get('limit') || '10';
                        return `/search/2/search/${encodeURIComponent(category)}.json?key=${env.VITE_TOMTOM_API_KEY}&lat=${lat}&lon=${lon}&radius=${radius}&limit=${limit}&countrySet=IN`;
                    }
                },
                // TomTom Geocode Proxy
                '/api/tomtom-geocode': {
                    target: 'https://api.tomtom.com',
                    changeOrigin: true,
                    rewrite: (path) => {
                        const url = new URL(path, 'http://localhost');
                        const query = url.searchParams.get('query') || '';
                        return `/search/2/search/${encodeURIComponent(query + ', Bengaluru')}.json?key=${env.VITE_TOMTOM_API_KEY}&limit=1&countrySet=IN`;
                    }
                },
                // TomTom Traffic Incidents Proxy
                '/api/tomtom-traffic': {
                    target: 'https://api.tomtom.com',
                    changeOrigin: true,
                    rewrite: (path) => {
                        const url = new URL(path, 'http://localhost');
                        const bbox = url.searchParams.get('bbox') || '77.300000,12.800000,77.800000,13.200000';
                        const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(c => parseFloat(c).toFixed(6));
                        return `/traffic/services/4/incidentDetails/s3/${minLon},${minLat},${maxLon},${maxLat}/11/-1/json?key=${env.VITE_TOMTOM_API_KEY}&expandCluster=true&projection=EPSG4326`;
                    }
                },
                // OpenWeather API Proxy
                '/api/weather': {
                    target: 'https://api.openweathermap.org',
                    changeOrigin: true,
                    rewrite: (path) => {
                        const url = new URL(path, 'http://localhost');
                        const lat = url.searchParams.get('lat') || '12.9716';
                        const lon = url.searchParams.get('lon') || '77.5946';
                        return `/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${env.VITE_OPENWEATHER_API_KEY}&units=metric`;
                    }
                }
            }
        }
    };
});
