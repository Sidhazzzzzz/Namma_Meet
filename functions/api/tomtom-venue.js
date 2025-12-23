/**
 * TomTom Venue Search API Proxy
 * Handles venue search for Group Meet feature
 * Keeps API key secure on server-side
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Get query parameters
    const category = url.searchParams.get('category') || 'cafe';
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    const radius = url.searchParams.get('radius') || '5000';
    const limit = url.searchParams.get('limit') || '10';

    if (!lat || !lon) {
        return new Response(JSON.stringify({ error: 'Missing lat/lon parameters' }), {
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

    // Map category to search term
    const categoryMap = {
        'cafe': 'cafe',
        'restaurant': 'restaurant',
        'park': 'park',
        'mall': 'shopping center',
        'bar': 'bar'
    };
    const searchTerm = categoryMap[category] || category;

    // TomTom Search API
    const tomtomUrl = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(searchTerm)}.json`);
    tomtomUrl.searchParams.set('key', apiKey);
    tomtomUrl.searchParams.set('lat', lat);
    tomtomUrl.searchParams.set('lon', lon);
    tomtomUrl.searchParams.set('radius', radius);
    tomtomUrl.searchParams.set('limit', limit);
    tomtomUrl.searchParams.set('countrySet', 'IN');

    try {
        const response = await fetch(tomtomUrl.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('TomTom Venue API error:', response.status, errorText);
            return new Response(JSON.stringify({ error: 'Venue search error', status: response.status }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        // Transform response
        const results = (data.results || []).map(result => ({
            name: result.poi?.name || result.address?.freeformAddress || 'Unknown Venue',
            address: result.address?.freeformAddress || '',
            lat: result.position.lat,
            lon: result.position.lon,
            category: result.poi?.categories?.[0] || category
        }));

        return new Response(JSON.stringify({ results }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300'
            }
        });

    } catch (err) {
        console.error('TomTom Venue proxy error:', err);
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
