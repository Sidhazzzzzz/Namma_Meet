/**
 * OpenWeather API Proxy
 * Handles weather requests securely
 * Keeps API key secure on server-side
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Get query parameters
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');

    if (!lat || !lon) {
        return new Response(JSON.stringify({ error: 'Missing lat/lon parameters' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get API key from environment
    const apiKey = context.env.VITE_OPENWEATHER_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // OpenWeather Current Weather API
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    try {
        const response = await fetch(weatherUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenWeather API error:', response.status, errorText);
            return new Response(JSON.stringify({ error: 'Weather API error', status: response.status }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            }
        });

    } catch (err) {
        console.error('OpenWeather proxy error:', err);
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
