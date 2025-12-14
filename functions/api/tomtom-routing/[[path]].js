export async function onRequest(context) {
    const url = new URL(context.request.url);
    // Strip the /api/tomtom-routing prefix
    const path = url.pathname.replace(/^\/api\/tomtom-routing/, '');

    // Get the API key from environment variable
    const apiKey = context.env.VITE_TOMTOM_API_KEY;

    if (!apiKey) {
        return new Response('TomTom API key not configured', { status: 500 });
    }

    // Build TomTom routing URL
    const targetUrl = 'https://api.tomtom.com/routing/1' + path +
        (url.search ? url.search + '&key=' + apiKey : '?key=' + apiKey);

    try {
        const response = await fetch(targetUrl, {
            method: context.request.method,
            headers: {
                'User-Agent': 'NammaDaari/1.0'
            }
        });
        return response;
    } catch (err) {
        return new Response('Proxy Error: ' + err.message, { status: 500 });
    }
}
