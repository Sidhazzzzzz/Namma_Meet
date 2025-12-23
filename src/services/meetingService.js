// ========================================
// Meeting Service - Group Meet Functionality
// ========================================

// Person colors for markers and routes
export const PERSON_COLORS = [
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#ec4899'  // Pink
];

// Haversine distance calculation
export function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Calculate centroid (center point) of multiple locations
export function calculateCentroid(locations) {
    if (!locations || locations.length === 0) return null;

    const totalLat = locations.reduce((sum, loc) => sum + loc.lat, 0);
    const totalLon = locations.reduce((sum, loc) => sum + loc.lon, 0);

    return {
        lat: totalLat / locations.length,
        lon: totalLon / locations.length
    };
}

// Calculate fairness score based on how equal distances are
export function calculateFairnessScore(venue, userLocations) {
    if (!userLocations || userLocations.length < 2) return 100;

    const distances = userLocations.map(user =>
        getDistanceFromLatLonInKm(user.lat, user.lon, venue.lat, venue.lon)
    );

    const maxDist = Math.max(...distances);
    const minDist = Math.min(...distances);
    const gap = maxDist - minDist;

    // Score decreases as gap increases (4 points per km of gap)
    let fairnessScore = 100 - (gap * 4);
    return Math.max(0, Math.min(100, fairnessScore));
}

// Calculate proximity score (how close to centroid)
export function calculateProximityScore(venue, centroid) {
    const distToCenter = getDistanceFromLatLonInKm(
        centroid.lat, centroid.lon,
        venue.lat, venue.lon
    );

    // Penalize 10 points per km away from center
    let proximityScore = 100 - (distToCenter * 10);
    return Math.max(0, Math.min(100, proximityScore));
}

// Calculate total venue score
export function calculateVenueScore(venue, userLocations, centroid) {
    const fairnessScore = calculateFairnessScore(venue, userLocations);
    const proximityScore = calculateProximityScore(venue, centroid);
    const ratingScore = (venue.rating || 4.0) * 20; // Convert 0-5 to 0-100

    // Weight: 40% Fairness, 40% Proximity, 20% Rating
    const totalScore = (fairnessScore * 0.4) + (proximityScore * 0.4) + (ratingScore * 0.2);

    return {
        total: Math.round(totalScore),
        fairness: Math.round(fairnessScore),
        proximity: Math.round(proximityScore),
        rating: venue.rating || 4.0
    };
}

// Search for venues using secure proxy endpoint
export async function searchVenues(centroid, category, userLocations) {
    try {
        // Use secure proxy endpoint (API key is on server-side)
        const url = `/api/tomtom-venue?` +
            `category=${encodeURIComponent(category)}` +
            `&lat=${centroid.lat}` +
            `&lon=${centroid.lon}` +
            `&radius=5000` +
            `&limit=10`;

        const response = await fetch(url);
        const data = await response.json();

        // Handle both proxy-transformed and raw TomTom response formats
        const results = data.results || [];

        if (results.length === 0) {
            // Fallback to Nominatim if proxy returns nothing
            return await searchVenuesNominatim(centroid, category, userLocations);
        }

        // Process and score venues
        const venues = results.map(result => {
            const venue = {
                name: result.name || result.poi?.name || result.address?.freeformAddress || 'Unknown Venue',
                address: result.address || result.address?.freeformAddress || '',
                lat: result.lat || result.position?.lat,
                lon: result.lon || result.position?.lon,
                rating: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1), // Mock rating
                category: result.category || result.poi?.categories?.[0] || category
            };

            venue.scores = calculateVenueScore(venue, userLocations, centroid);
            return venue;
        });

        // Sort by total score descending
        venues.sort((a, b) => b.scores.total - a.scores.total);

        return venues.slice(0, 5); // Return top 5

    } catch (error) {
        console.error('Venue search error:', error);
        return await searchVenuesNominatim(centroid, category, userLocations);
    }
}

// Fallback venue search using Nominatim
async function searchVenuesNominatim(centroid, category, userLocations) {
    try {
        const offset = 0.05; // ~5km
        const viewbox = `${centroid.lon - offset},${centroid.lat - offset},${centroid.lon + offset},${centroid.lat + offset}`;

        const url = `https://nominatim.openstreetmap.org/search?` +
            `format=json` +
            `&q=${encodeURIComponent(category + ' bengaluru')}` +
            `&viewbox=${viewbox}` +
            `&bounded=1` +
            `&limit=10`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'NammaMeet/1.0' }
        });
        const data = await response.json();

        const venues = data.map(result => {
            const venue = {
                name: result.display_name.split(',')[0],
                address: result.display_name,
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                rating: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1),
                category: category
            };

            venue.scores = calculateVenueScore(venue, userLocations, centroid);
            return venue;
        });

        venues.sort((a, b) => b.scores.total - a.scores.total);
        return venues.slice(0, 5);

    } catch (error) {
        console.error('Nominatim venue search error:', error);
        return [];
    }
}

// Geocode a location string to coordinates using secure proxy
export async function geocodeLocation(locationString) {
    try {
        // Use secure proxy endpoint (API key is on server-side)
        const url = `/api/tomtom-geocode?query=${encodeURIComponent(locationString)}`;

        const response = await fetch(url);

        if (!response.ok) {
            // Fallback to Nominatim
            return await geocodeLocationNominatim(locationString);
        }

        const data = await response.json();

        // Handle both proxy-transformed and raw TomTom response formats
        // Proxy returns {lat, lon, address} directly
        // Raw TomTom returns {results: [{position: {lat, lon}, address: {...}}]}
        if (data.lat && data.lon) {
            return {
                lat: data.lat,
                lon: data.lon,
                name: locationString,
                address: data.address || locationString
            };
        } else if (data.results && data.results.length > 0) {
            const result = data.results[0];
            return {
                lat: result.position?.lat,
                lon: result.position?.lon,
                name: locationString,
                address: result.address?.freeformAddress || locationString
            };
        }

        // Fallback to Nominatim
        return await geocodeLocationNominatim(locationString);

    } catch (error) {
        console.error('Geocode error:', error);
        return await geocodeLocationNominatim(locationString);
    }
}

// Fallback geocoding with Nominatim
async function geocodeLocationNominatim(locationString) {
    try {
        const query = `${locationString}, Bengaluru`;
        const url = `https://nominatim.openstreetmap.org/search?` +
            `format=json` +
            `&q=${encodeURIComponent(query)}` +
            `&limit=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'NammaMeet/1.0' }
        });
        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                name: locationString,
                address: data[0].display_name
            };
        }

        return null;

    } catch (error) {
        console.error('Nominatim geocode error:', error);
        return null;
    }
}

// Generate Google Maps direction URL
export function generateDirectionsUrl(fromLat, fromLon, toLat, toLon) {
    return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLon}&destination=${toLat},${toLon}&travelmode=driving`;
}

// Calculate route using OSRM (for drawing on map)
export async function calculateRoute(from, to) {
    try {
        // Use proxy endpoint to avoid CORS issues and improve consistency
        const url = `/api/osrm/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
                coordinates: route.geometry.coordinates, // [lon, lat] pairs
                duration: route.duration, // seconds
                distance: route.distance // meters
            };
        }

        return null;

    } catch (error) {
        console.error('OSRM route error:', error);
        return null;
    }
}
