export async function onRequest(context) {
    const url = new URL(context.request.url);
    // Strip the /api/osrm-car prefix to get the path for the upstream server
    const path = url.pathname.replace(/^\/api\/osrm-car/, '');
    const targetUrl = 'https://routing.openstreetmap.de/routed-car' + path + url.search;

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
