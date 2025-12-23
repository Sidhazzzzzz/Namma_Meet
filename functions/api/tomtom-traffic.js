/**
 * TomTom Traffic Incidents API Proxy
 * Handles traffic incident requests securely
 * Keeps API key secure on server-side
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Get query parameters
    const bbox = url.searchParams.get('bbox') || '77.300000,12.800000,77.800000,13.200000';

    // Get API key from environment
    const apiKey = context.env.VITE_TOMTOM_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Parse bounds for TomTom v4 API format: minLon,minLat,maxLon,maxLat
    const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(c => parseFloat(c).toFixed(6));

    // TomTom Traffic Incidents v4 API
    const tomtomUrl = `https://api.tomtom.com/traffic/services/4/incidentDetails/s3/${minLon},${minLat},${maxLon},${maxLat}/11/-1/json?key=${apiKey}&expandCluster=true&projection=EPSG4326`;

    try {
        const response = await fetch(tomtomUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TomTom Traffic API error:', response.status, errorText);
            return new Response(JSON.stringify({ error: 'Traffic API error', status: response.status }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        // v4 API returns data in tm.poi array
        if (!data.tm || !data.tm.poi) {
            return new Response(JSON.stringify({ incidents: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const incidents = data.tm.poi
            .filter(inc => inc.p) // Ensure position exists
            .map(inc => ({
                id: inc.id || `traffic-${Math.random()}`,
                geometry: {
                    type: 'Point',
                    coordinates: [inc.p.x, inc.p.y]
                },
                point: { lat: inc.p.y, lon: inc.p.x },
                severity: inc.ty === 1 ? 'Major' : 'Moderate',
                delay: inc.dl || 0,
                description: inc.d || 'Traffic Incident',
                from: inc.f || '',
                to: inc.t || ''
            }));

        return new Response(JSON.stringify({ incidents }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60' // Cache for 1 minute
            }
        });

    } catch (err) {
        console.error('TomTom Traffic proxy error:', err);
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
