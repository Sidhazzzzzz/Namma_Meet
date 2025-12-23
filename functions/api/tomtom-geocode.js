/**
 * TomTom Geocoding API Proxy
 * Handles location geocoding requests
 * Keeps API key secure on server-side
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Get query parameters
    const query = url.searchParams.get('query');
    const limit = url.searchParams.get('limit') || '1';

    if (!query) {
        return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get API key from environment
    const apiKey = context.env.VITE_TOMTOM_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // TomTom Geocoding API
    const searchQuery = `${query}, Bengaluru`;
    const tomtomUrl = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(searchQuery)}.json`);
    tomtomUrl.searchParams.set('key', apiKey);
    tomtomUrl.searchParams.set('limit', limit);
    tomtomUrl.searchParams.set('countrySet', 'IN');

    try {
        const response = await fetch(tomtomUrl.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TomTom Geocode API error:', response.status, errorText);
            return new Response(JSON.stringify({ error: 'Geocode error', status: response.status }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            return new Response(JSON.stringify({
                lat: result.position.lat,
                lon: result.position.lon,
                name: query,
                address: result.address?.freeformAddress || query
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }

        return new Response(JSON.stringify({ error: 'Location not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('TomTom Geocode proxy error:', err);
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
