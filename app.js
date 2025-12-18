// ========================================
// Safe Route Finder - Standalone Version
// ========================================

// ========================================
// ========================================
// Crime Service
// ========================================
const TOMTOM_API_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

import { ACCIDENT_DATA } from './src/services/accidentData.js';
import { getCrimeData, calculateSafetyScore, getSafetyLevel, getRouteColor } from './src/services/safetyService.js';
import { getRoutes, formatDistance, formatDuration, findNearestFacilities, calculateAdjustedDuration } from './src/services/routeService.js';
import { HOSPITALS, POLICE_STATIONS } from './src/services/facilityData.js';
import { metroData } from './data/metroData.js';
import {
    PERSON_COLORS,
    calculateCentroid,
    searchVenues,
    geocodeLocation as geocodeLocationMeeting,
    calculateRoute,
    generateDirectionsUrl
} from './src/services/meetingService.js';




// ========================================
// Geocoding Service
// ========================================
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Fetch with timeout for geocoding (longer timeout than autocomplete)
 */
async function geocodeFetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Geocoding request timed out');
        }
        throw error;
    }
}

async function geocodeLocation(locationString, retries = 3) {
    try {
        console.log(`Geocoding: "${locationString}"`);
        const params = new URLSearchParams({
            q: locationString,
            format: 'json',
            limit: '1',
            countrycodes: 'in',
        });

        const response = await geocodeFetchWithTimeout(
            `${NOMINATIM_BASE_URL}/search?${params}`,
            {
                headers: {
                    'User-Agent': 'SafeRouteFinderApp/1.0'
                }
            },
            8000 // 8 second timeout
        );

        if (!response.ok) {
            // Retry on server errors
            if ((response.status >= 500 || response.status === 429) && retries > 0) {
                console.warn(`Nominatim geocoding returned ${response.status}, retrying... (${retries} left)`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return geocodeLocation(locationString, retries - 1);
            }
            throw new Error(`Geocoding failed: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.length === 0) {
            throw new Error('Location not found');
        }

        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            display_name: data[0].display_name
        };
    } catch (error) {
        console.error('Geocoding error:', error);
        // Retry on timeout or network errors
        if (retries > 0 && (error.message.includes('timed out') || error.name === 'TypeError')) {
            console.warn(`Geocoding failed, retrying... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return geocodeLocation(locationString, retries - 1);
        }
        throw error;
    }
}

// ========================================
// Autocomplete Service (TomTom Search API)
// ========================================
let debounceTimer;
let userLocation = { lat: 12.9716, lon: 77.5946 }; // Default to Bengaluru

// Update user location when available (called from showUserLocation)
function updateUserLocationForSearch(lat, lon) {
    userLocation = { lat, lon };
    console.log('Search location bias updated to:', userLocation);
}

/**
 * Fetch with timeout helper
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    }
}

/**
 * Fetch suggestions from TomTom Search API (with fuzzy matching)
 * @param {string} query - Search query
 * @param {number} retries - Number of retries
 * @returns {Promise<Array>} Array of suggestion objects
 */
async function fetchSuggestions(query, retries = 1) {
    if (!query || query.length < 2) return []; // TomTom works with 2+ chars

    try {
        const TOMTOM_API_KEY = 'sdzQqXJ0hQKanaHi0jmyNwqcuBokTRwY';
        const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?` +
            `key=${TOMTOM_API_KEY}` +
            `&limit=5` +
            `&countrySet=IN` +
            `&lat=${userLocation.lat}` +
            `&lon=${userLocation.lon}` +
            `&radius=50000`;

        const response = await fetchWithTimeout(url, {}, 5000);

        if (!response.ok) {
            if ((response.status >= 500 || response.status === 429) && retries > 0) {
                console.warn(`TomTom Search returned ${response.status}, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                return fetchSuggestions(query, retries - 1);
            }
            console.error('TomTom Search error:', response.status);
            return [];
        }

        const data = await response.json();

        // Transform to format expected by showSuggestions
        return (data.results || []).map(result => ({
            display_name: result.address?.freeformAddress || result.poi?.name || 'Unknown',
            lat: result.position.lat,
            lon: result.position.lon
        }));
    } catch (error) {
        console.error('Autocomplete error:', error);
        if (retries > 0 && (error.message === 'Request timed out' || error.name === 'TypeError')) {
            console.warn('Autocomplete failed, retrying...');
            await new Promise(resolve => setTimeout(resolve, 500));
            return fetchSuggestions(query, retries - 1);
        }
        return [];
    }
}

function showSuggestions(suggestions, inputElement) {
    let list = inputElement.nextElementSibling;
    if (!list || !list.classList.contains('autocomplete-items')) {
        list = document.createElement('div');
        list.setAttribute('class', 'autocomplete-items');
        inputElement.parentNode.appendChild(list);
    }

    list.innerHTML = '';

    if (suggestions.length === 0) {
        list.innerHTML = '<div class="autocomplete-item">No results found</div>';
        return;
    }

    suggestions.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('autocomplete-item');
        div.innerHTML = `<strong>${item.display_name.split(',')[0]}</strong><small>${item.display_name}</small>`;
        div.addEventListener('click', function () {
            inputElement.value = item.display_name;
            // Store coordinates to avoid re-geocoding
            inputElement.dataset.lat = item.lat;
            inputElement.dataset.lon = item.lon;
            list.remove(); // Remove dropdown entirely from DOM

            // Sync mobile inputs to main inputs
            if (inputElement.id === 'mobile-start-input') {
                const mainInput = document.getElementById('start-location');
                if (mainInput) {
                    mainInput.value = item.display_name;
                    mainInput.dataset.lat = item.lat;
                    mainInput.dataset.lon = item.lon;
                }
            } else if (inputElement.id === 'mobile-end-input') {
                const mainInput = document.getElementById('end-location');
                if (mainInput) {
                    mainInput.value = item.display_name;
                    mainInput.dataset.lat = item.lat;
                    mainInput.dataset.lon = item.lon;
                }
            }

            // Only show preview markers and fly on DESKTOP - skip on mobile
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);

            if (!isMobile && !isNaN(lat) && !isNaN(lon) && map) {
                const isStart = inputElement.id === 'start-location';

                // Remove existing preview markers
                if (isStart && window.startPreviewMarker) {
                    window.startPreviewMarker.remove();
                }
                if (!isStart && window.endPreviewMarker) {
                    window.endPreviewMarker.remove();
                }

                // Create preview marker
                const previewEl = document.createElement('div');
                previewEl.className = 'preview-marker';
                previewEl.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:0;margin:0;';
                previewEl.innerHTML = isStart
                    ? `<svg width="25" height="25" viewBox="0 0 20 20" style="display:block;">
                        <circle cx="10" cy="10" r="8" fill="#22c55e"/>
                        <circle cx="10" cy="10" r="3" fill="#fff"/>
                    </svg>`
                    : `<svg width="25" height="35" viewBox="0 0 20 28" style="display:block;">
                        <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 18 10 18s10-10.5 10-18C20 4.5 15.5 0 10 0z" fill="#ef4444"/>
                        <circle cx="10" cy="9" r="3.5" fill="#fff"/>
                    </svg>`;

                const marker = new maplibregl.Marker({
                    element: previewEl,
                    anchor: isStart ? 'center' : 'bottom'
                })
                    .setLngLat([lon, lat])
                    .addTo(map);

                if (isStart) {
                    window.startPreviewMarker = marker;
                } else {
                    window.endPreviewMarker = marker;
                }

                // Check if both locations are set
                const startInput = document.getElementById('start-location');
                const endInput = document.getElementById('end-location');
                const startLat = parseFloat(startInput.dataset.lat);
                const startLon = parseFloat(startInput.dataset.lon);
                const endLat = parseFloat(endInput.dataset.lat);
                const endLon = parseFloat(endInput.dataset.lon);

                if (!isNaN(startLat) && !isNaN(startLon) && !isNaN(endLat) && !isNaN(endLon)) {
                    // Both locations set - fit bounds to show both
                    const bounds = new maplibregl.LngLatBounds()
                        .extend([startLon, startLat])
                        .extend([endLon, endLat]);

                    map.fitBounds(bounds, {
                        padding: { top: 80, bottom: 80, left: 450, right: 80 },
                        duration: 1500
                    });
                } else {
                    // Only one location - zoom to it
                    map.flyTo({
                        center: [lon, lat],
                        zoom: 15,
                        duration: 1200,
                        padding: { left: 420 }
                    });
                }
            }
        });
        list.appendChild(div);
    });
}

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        // Clear stored coordinates on user input
        delete this.dataset.lat;
        delete this.dataset.lon;
        const query = this.value;
        const inputElement = this;

        // Defer DOM removal to next frame to avoid blocking INP
        requestAnimationFrame(() => {
            let list = inputElement.nextElementSibling;
            if (list && list.classList.contains('autocomplete-items')) {
                list.remove();
            }
        });

        if (!query) return;

        debounceTimer = setTimeout(async () => {
            const suggestions = await fetchSuggestions(query);
            showSuggestions(suggestions, inputElement);
        }, 300);
    });

    // Zoom to location when user leaves input field - debounced to avoid blocking
    let blurTimeout;
    input.addEventListener('blur', function () {
        const lat = parseFloat(this.dataset.lat);
        const lon = parseFloat(this.dataset.lon);

        // Defer map animation to avoid blocking INP
        clearTimeout(blurTimeout);
        blurTimeout = setTimeout(() => {
            if (!isNaN(lat) && !isNaN(lon) && map) {
                map.flyTo({
                    center: [lon, lat],
                    zoom: 14,
                    duration: 1500,
                    padding: { left: 420 } // Account for sidebar
                });
            }
        }, 100);
    });

    // Close dropdown when clicking outside - use passive listener
    document.addEventListener('click', function (e) {
        if (e.target !== input) {
            // Defer DOM removal to next frame
            requestAnimationFrame(() => {
                let list = input.nextElementSibling;
                if (list && list.classList.contains('autocomplete-items')) {
                    list.remove();
                }
            });
        }
    }, { passive: true });
}

// ========================================
// Weather Service
// ========================================
async function getWeather(lat, lon) {
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
        );

        if (!response.ok) {
            throw new Error('Weather data fetch failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Weather fetch error:', error);
        return null;
    }
}

function renderWeatherInfo(startWeather, endWeather) {
    const container = document.getElementById('weather-container');
    const startCard = document.getElementById('start-weather');
    const endCard = document.getElementById('end-weather');

    if (!startWeather && !endWeather) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    if (startWeather) {
        startCard.innerHTML = `
            <div class="weather-location">Start</div>
            <img src="https://openweathermap.org/img/wn/${startWeather.weather[0].icon}.png" alt="Weather icon" class="weather-icon">
            <div class="weather-temp">${startWeather.main.temp.toFixed(1)}°C</div>
            <div class="weather-desc">${startWeather.weather[0].description}</div>
        `;
    }

    if (endWeather) {
        endCard.innerHTML = `
            <div class="weather-location">Destination</div>
            <img src="https://openweathermap.org/img/wn/${endWeather.weather[0].icon}.png" alt="Weather icon" class="weather-icon">
            <div class="weather-temp">${endWeather.main.temp.toFixed(1)}°C</div>
            <div class="weather-desc">${endWeather.weather[0].description}</div>
        `;
    }
}

// ========================================
// Route Service
// ========================================


// ========================================
// Global State
// ========================================
let map;
let currentRoutes = [];
let selectedRouteId = null;
let startMarker = null;
let endMarker = null;
let currentPopup = null;

// ========================================
// Map Initialization
// ========================================
function initializeMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'osm-tiles': {
                    type: 'raster',
                    tiles: [
                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }
            },
            layers: [
                {
                    id: 'osm-tiles',
                    type: 'raster',
                    source: 'osm-tiles',
                    minzoom: 0,
                    maxzoom: 19
                }
            ],
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
        },
        center: [77.5946, 12.9716],
        zoom: 12,
        attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

    map.on('load', () => {
        addCrimeDataLayer();
        addTrafficIncidentsLayer(); // Changed from addTrafficLayer
        addMetroLayer();
        addBmtcLayer();
        addAccidentLayer();
        addFacilityLayer();

        document.getElementById('accidents-btn').addEventListener('click', toggleAccidents);
        document.getElementById('facilities-btn').addEventListener('click', toggleFacilities);

        // Show user location on load
        showUserLocation();
    });
}

function showUserLocation() {
    if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by your browser');
        return;
    }

    console.log('Requesting user location...');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            console.log(`Location found: ${latitude}, ${longitude} (Accuracy: ${accuracy}m)`);

            // Update search location bias for autocomplete
            updateUserLocationForSearch(latitude, longitude);

            // Create the HTML element for the marker
            const el = document.createElement('div');
            el.className = 'user-location-container';
            el.innerHTML = `
                <div class="user-location-pulse"></div>
                <div class="user-location-dot"></div>
            `;

            // Add marker to map
            new maplibregl.Marker({ element: el })
                .setLngLat([longitude, latitude])
                .addTo(map);

            // Fly to location
            map.flyTo({
                center: [longitude, latitude],
                zoom: 14,
                essential: true
            });
        },
        (error) => {
            console.error('Error getting user location:', error.message, error.code);
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 10000
        }
    );
}

// ========================================
// Traffic Data Visualization
// ========================================
// ========================================
// Traffic Data Visualization (High Severity Only)
// ========================================
let globalTrafficIncidents = [];

async function fetchTrafficIncidents(bbox) {
    try {
        // Default to Bengaluru bounds if no bbox provided
        const bounds = bbox || '77.300000,12.800000,77.800000,13.200000';

        // Parse bounds for TomTom v4 API format: minLon,minLat,maxLon,maxLat
        const [minLon, minLat, maxLon, maxLat] = bounds.split(',').map(c => parseFloat(c).toFixed(6));

        // Use TomTom Traffic Incidents v4 API (tile-based, works reliably)
        // Format: /traffic/services/4/incidentDetails/s3/{minLon},{minLat},{maxLon},{maxLat}/{zoom}/-1/{format}
        const url = `https://api.tomtom.com/traffic/services/4/incidentDetails/s3/${minLon},${minLat},${maxLon},${maxLat}/11/-1/json?key=${TOMTOM_API_KEY}&expandCluster=true&projection=EPSG4326`;

        console.log(`[Traffic Debug] BBox: ${bounds}`);
        if (!TOMTOM_API_KEY) console.error('[Traffic Error] TOMTOM_API_KEY is missing!');

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Traffic Error] API returned ${response.status}`);
            return [];
        }

        const data = await response.json();

        // v4 API returns data in tm.poi array
        if (!data.tm || !data.tm.poi) {
            console.log('[Traffic] No incidents found in area');
            return [];
        }

        const incidents = data.tm.poi;
        console.log(`[Traffic] Fetched ${incidents.length} traffic incidents.`);

        return incidents
            .filter(inc => inc.p) // Ensure position exists
            .map(inc => ({
                id: inc.id || `traffic-${Math.random()}`,
                geometry: {
                    type: 'Point',
                    coordinates: [inc.p.x, inc.p.y]
                },
                point: { lat: inc.p.y, lon: inc.p.x },
                severity: inc.ty === 1 ? 'Major' : 'Moderate', // ty: incident type
                delay: inc.dl || 0, // delay in seconds
                description: inc.d || 'Traffic Incident',
                from: inc.f || '',
                to: inc.t || ''
            }));
    } catch (error) {
        console.error('Error fetching traffic incidents:', error);
        return [];
    }
}

function addTrafficIncidentsLayer() {
    map.addSource('traffic-incidents', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    // Layer for LineString Traffic (Red Lines along road)
    map.addLayer({
        id: 'traffic-incidents-line',
        type: 'line',
        source: 'traffic-incidents',
        filter: ['==', '$type', 'LineString'],
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#dc2626', // Red
            'line-width': 6,
            'line-opacity': 1.0
        }
    }, 'crime-points');

    // Layer for Point Traffic
    map.addLayer({
        id: 'traffic-incidents-point',
        type: 'circle',
        source: 'traffic-incidents',
        filter: ['==', '$type', 'Point'],
        paint: {
            'circle-radius': 6,
            'circle-color': '#dc2626',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    }, 'crime-points');

    // Popup logic
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    const showPopup = (e) => {
        map.getCanvas().style.cursor = 'pointer';
        let coordinates = [e.lngLat.lng, e.lngLat.lat];
        if (e.features[0].geometry.type === 'Point') {
            coordinates = e.features[0].geometry.coordinates.slice();
        }

        const { description, severity } = e.features[0].properties;

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        popup.setLngLat(coordinates)
            .setHTML(`
                <div style="padding: 8px; color: #000;">
                    <strong style="color: #dc2626;">Traffic Incident</strong><br>
                    ${description}<br>
                    <small>Severity: ${severity}</small>
                </div>
            `)
            .addTo(map);
    };

    const hidePopup = () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    };

    map.on('mouseenter', 'traffic-incidents-line', showPopup);
    map.on('mouseleave', 'traffic-incidents-line', hidePopup);
    map.on('mouseenter', 'traffic-incidents-point', showPopup);
    map.on('mouseleave', 'traffic-incidents-point', hidePopup);

    // Initial load
    updateTrafficLayer();
}

async function updateTrafficLayer(bboxOrIncidents) {
    let incidents = [];
    if (Array.isArray(bboxOrIncidents)) {
        incidents = bboxOrIncidents;
    } else {
        incidents = await fetchTrafficIncidents(bboxOrIncidents);
        globalTrafficIncidents = incidents;
    }

    const geojson = {
        type: 'FeatureCollection',
        features: incidents.map(inc => ({
            type: 'Feature',
            geometry: inc.geometry,
            properties: {
                id: inc.id,
                description: inc.description,
                severity: inc.severity
            }
        }))
    };

    if (map.getSource('traffic-incidents')) {
        map.getSource('traffic-incidents').setData(geojson);
    }
}

// ========================================
// Crime Data Visualization
// ========================================
function addCrimeDataLayer() {
    const crimeData = getCrimeData();

    const geojson = {
        type: 'FeatureCollection',
        features: crimeData.map(crime => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [crime.lon, crime.lat]
            },
            properties: {
                severity: crime.severity,
                area: crime.area
            }
        }))
    };

    map.addSource('crime-data', {
        type: 'geojson',
        data: geojson
    });

    map.addLayer({
        id: 'crime-points',
        type: 'circle',
        source: 'crime-data',
        paint: {
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['get', 'severity'],
                1, 4,
                10, 12
            ],
            'circle-color': [
                'interpolate',
                ['linear'],
                ['get', 'severity'],
                1, '#10b981',
                5, '#f59e0b',
                10, '#ef4444'
            ],
            'circle-opacity': 0.4,
            'circle-stroke-width': 2,
            'circle-stroke-color': [
                'interpolate',
                ['linear'],
                ['get', 'severity'],
                1, '#10b981',
                5, '#f59e0b',
                10, '#ef4444'
            ],
            'circle-stroke-opacity': 0.6
        }
    });

    let currentPopup = null; // Local scope for popup to avoid collision if global one exists

    map.on('mouseenter', 'crime-points', (e) => {
        map.getCanvas().style.cursor = 'pointer';

        if (currentPopup) {
            currentPopup.remove();
        }

        const coordinates = e.features[0].geometry.coordinates.slice();
        const { severity, area } = e.features[0].properties;

        currentPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false
        })
            .setLngLat(coordinates)
            .setHTML(`
        <div style="padding: 8px; font-family: Inter, sans-serif;">
          <strong style="color: #000000;">${area}</strong><br>
          <span style="color: #10b981;">Severity: ${severity}/10</span>
        </div>
      `)
            .addTo(map);
    });

    map.on('mouseleave', 'crime-points', () => {
        map.getCanvas().style.cursor = '';
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
    });
}

// ========================================
// Metro Data Visualization
// ========================================
function addMetroLayer() {
    // if (typeof metroData === 'undefined') {
    //     console.error('Metro data not loaded');
    //     return;
    // }

    // Add metro data source
    map.addSource('metro-data', {
        type: 'geojson',
        data: metroData
    });

    // Add metro lines layer
    map.addLayer({
        id: 'metro-lines',
        type: 'line',
        source: 'metro-data',
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none'
        },
        paint: {
            'line-color': [
                'match',
                ['get', 'line'],
                'purple', '#9a339a',
                'green', '#4caf50',
                'yellow', '#ffeb3b',
                '#000000' // default color
            ],
            'line-width': 4
        }
    });

    // Add metro stations circle layer
    map.addLayer({
        id: 'metro-stations',
        type: 'circle',
        source: 'metro-data',
        filter: ['==', '$type', 'Point'],
        layout: {
            'visibility': 'none'
        },
        paint: {
            'circle-radius': 7,
            'circle-color': [
                'match',
                ['get', 'line'],
                'purple', '#9a339a',
                'green', '#4caf50',
                'yellow', '#ffeb3b',
                '#000000'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    // Add metro labels layer (M symbol)
    map.addLayer({
        id: 'metro-labels',
        type: 'symbol',
        source: 'metro-data',
        filter: ['==', '$type', 'Point'],
        minzoom: 10, // Show M symbol earlier
        layout: {
            'visibility': 'none',
            'text-field': 'M',
            'text-font': ['Open Sans Semibold'],
            'text-size': 8,
            'text-allow-overlap': true
        },
        paint: {
            'text-color': [
                'match',
                ['get', 'line'],
                'yellow', '#000000',
                '#ffffff'
            ]
        }
    });

    // Create a popup, but don't add it to the map yet.
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    // Add click event for metro stations (optional, maybe zoom in?)
    map.on('click', 'metro-stations', (e) => {
        map.flyTo({
            center: e.features[0].geometry.coordinates,
            zoom: 14
        });
    });

    // Change cursor and show popup on hover
    map.on('mouseenter', 'metro-stations', (e) => {
        map.getCanvas().style.cursor = 'pointer';

        const coordinates = e.features[0].geometry.coordinates.slice();
        const description = e.features[0].properties.name;

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        popup.setLngLat(coordinates).setHTML(`<strong style="color: #000000;">${description}</strong>`).addTo(map);
    });

    map.on('mouseleave', 'metro-stations', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });
}

function toggleMetroStops() {
    const visibility = map.getLayoutProperty('metro-stations', 'visibility');
    const newVisibility = visibility === 'visible' ? 'none' : 'visible';

    if (map.getLayer('metro-lines')) {
        map.setLayoutProperty('metro-lines', 'visibility', newVisibility);
    }
    if (map.getLayer('metro-stations')) {
        map.setLayoutProperty('metro-stations', 'visibility', newVisibility);
    }
    if (map.getLayer('metro-labels')) {
        map.setLayoutProperty('metro-labels', 'visibility', newVisibility);
    }

    const btn = document.getElementById('metro-btn');
    const label = btn.querySelector('.btn-label');
    if (newVisibility === 'visible') {
        btn.classList.add('active');
        if (label) label.textContent = 'Hide Metro';

        // Check if mobile for different padding
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        if (isMobile) {
            // Mobile: Get actual top bar and panel heights
            const topBar = document.querySelector('.mobile-top-bar');
            const panel = document.querySelector('.sidebar');
            const topPadding = topBar ? topBar.offsetHeight + 15 : 75;
            const bottomPadding = panel ? panel.offsetHeight + 15 : 100;

            map.flyTo({
                center: [77.5946, 12.9716],
                zoom: 11,
                padding: { top: topPadding, bottom: bottomPadding, left: 25, right: 25 }
            });
        } else {
            // Desktop: Original padding with sidebar offset
            map.flyTo({
                center: [77.5946, 12.9716],
                zoom: 11,
                padding: { left: 450, right: 50 }
            });
        }
    } else {
        btn.classList.remove('active');
        if (label) label.textContent = 'Metro Stations';
    }
}

// ========================================
// BMTC Data Visualization
// ========================================
function addBmtcLayer() {
    // Load Stops
    fetch('data/bmtc_stops.json')
        .then(response => response.json())
        .then(data => {
            map.addSource('bmtc-stops', {
                type: 'geojson',
                data: data
            });

            map.addLayer({
                id: 'bmtc-stops-layer',
                type: 'circle',
                source: 'bmtc-stops',
                layout: {
                    'visibility': 'none'
                },
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#dc2626', // Red color for BMTC
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Popup for stops
            const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false
            });

            map.on('mouseenter', 'bmtc-stops-layer', (e) => {
                map.getCanvas().style.cursor = 'pointer';
                const coordinates = e.features[0].geometry.coordinates.slice();
                const description = e.features[0].properties.stop_name;

                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                popup.setLngLat(coordinates).setHTML(`<strong style="color: #000000;">${description}</strong>`).addTo(map);
            });

            map.on('mouseleave', 'bmtc-stops-layer', () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });
        })
        .catch(err => console.error('Error loading BMTC stops:', err));

    // Load Routes (Split into parts due to size limits)
    Promise.all([
        fetch('data/bmtc_routes_part1.json').then(res => res.json()),
        fetch('data/bmtc_routes_part2.json').then(res => res.json()),
        fetch('data/bmtc_routes_part3.json').then(res => res.json())
    ])
        .then(results => {
            // Merge features from all parts
            const allFeatures = results.flatMap(data => data.features);
            const mergedData = {
                type: "FeatureCollection",
                features: allFeatures
            };

            map.addSource('bmtc-routes', {
                type: 'geojson',
                data: mergedData,
                lineMetrics: true
            });

            map.addLayer({
                id: 'bmtc-routes-layer',
                type: 'line',
                source: 'bmtc-routes',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round',
                    'visibility': 'none'
                },
                paint: {
                    'line-color': '#dc2626', // Red color for BMTC
                    'line-width': 2,
                    'line-opacity': 0.7
                }
            }, 'bmtc-stops-layer');

            // Add popup for routes
            const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false
            });

            map.on('mouseenter', 'bmtc-routes-layer', (e) => {
                map.getCanvas().style.cursor = 'pointer';

                const properties = e.features[0].properties;
                const description = properties.route_no || properties.route_id || 'BMTC Route';

                popup.setLngLat(e.lngLat)
                    .setHTML(`<strong style="color: #000000;">${description}</strong>`)
                    .addTo(map);
            });

            map.on('mouseleave', 'bmtc-routes-layer', () => {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });
        })
        .catch(err => console.error('Error loading BMTC routes:', err));
}

function toggleBmtcRoutes() {
    const visibility = map.getLayoutProperty('bmtc-stops-layer', 'visibility');
    const newVisibility = visibility === 'visible' ? 'none' : 'visible';

    if (map.getLayer('bmtc-stops-layer')) {
        map.setLayoutProperty('bmtc-stops-layer', 'visibility', newVisibility);
    }
    if (map.getLayer('bmtc-routes-layer')) {
        map.setLayoutProperty('bmtc-routes-layer', 'visibility', newVisibility);
    }

    const btn = document.getElementById('bmtc-btn');
    const label = btn.querySelector('.btn-label');
    if (newVisibility === 'visible') {
        btn.classList.add('active');
        if (label) label.textContent = 'Hide BMTC';
    } else {
        btn.classList.remove('active');
        if (label) label.textContent = 'BMTC Routes';
    }
}

// ========================================
// Facility Data Visualization (Hospitals & Police)
// ========================================
let facilityMarkers = [];

function addFacilityLayer() {
    // Clear existing markers if any
    facilityMarkers.forEach(m => m.marker.remove());
    facilityMarkers = [];

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 25
    });

    // Hospitals
    HOSPITALS.forEach(h => {
        const el = document.createElement('div');
        el.className = 'hospital-marker';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="hGrad${h.lat}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#EF4444"/>
                    <stop offset="100%" stop-color="#B91C1C"/>
                </linearGradient>
            </defs>
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 16 12 16s12-7 12-16c0-6.6-5.4-12-12-12z" fill="url(#hGrad${h.lat})"/>
            <rect x="10" y="6" width="4" height="12" rx="0.5" fill="#fff"/>
            <rect x="6" y="10" width="12" height="4" rx="0.5" fill="#fff"/>
        </svg>`;
        el.style.display = 'none';

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([h.lon, h.lat])
            .addTo(map);

        el.addEventListener('mouseenter', () => {
            popup.setLngLat([h.lon, h.lat])
                .setHTML(`
                    <div style="padding: 8px; font-family: Inter, sans-serif; color: #000;">
                        <strong>${h.name}</strong><br>
                        <span style="color: #ef4444;">Hospital</span>
                    </div>
                `)
                .addTo(map);
        });

        el.addEventListener('mouseleave', () => {
            popup.remove();
        });

        facilityMarkers.push({ marker, element: el });
    });

    // Police Stations
    POLICE_STATIONS.forEach(p => {
        const el = document.createElement('div');
        el.className = 'police-marker';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="pGrad${p.lat}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#3B82F6"/>
                    <stop offset="100%" stop-color="#1E3A8A"/>
                </linearGradient>
            </defs>
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 16 12 16s12-7 12-16c0-6.6-5.4-12-12-12z" fill="url(#pGrad${p.lat})"/>
            <path d="M12 5l-5 3.5v4c0 3 2 5.5 5 7 3-1.5 5-4 5-7v-4L12 5z" fill="#fff"/>
        </svg>`;
        el.style.display = 'none';

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([p.lon, p.lat])
            .addTo(map);

        el.addEventListener('mouseenter', () => {
            popup.setLngLat([p.lon, p.lat])
                .setHTML(`
                    <div style="padding: 8px; font-family: Inter, sans-serif; color: #000;">
                        <strong>${p.area}</strong><br>
                        <span style="color: #1e3a8a;">Police Station</span>
                    </div>
                `)
                .addTo(map);
        });

        el.addEventListener('mouseleave', () => {
            popup.remove();
        });

        facilityMarkers.push({ marker, element: el });
    });
}

function toggleFacilities() {
    const btn = document.getElementById('facilities-btn');
    const isVisible = btn.getAttribute('data-visible') === 'true';
    const newVisibility = !isVisible;

    facilityMarkers.forEach(item => {
        item.element.style.display = newVisibility ? 'flex' : 'none';
    });

    btn.setAttribute('data-visible', newVisibility);
    const label = btn.querySelector('.btn-label');

    if (newVisibility) {
        btn.classList.add('active');
        if (label) label.textContent = 'Hide Facilities';
    } else {
        btn.classList.remove('active');
        if (label) label.textContent = 'Hospitals & Police Stations';
    }
}

// ========================================
// Accident Data Visualization
// ========================================
let accidentMarkers = [];

function addAccidentLayer() {
    accidentMarkers.forEach(m => m.marker.remove());
    accidentMarkers = [];

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 25
    });

    ACCIDENT_DATA.forEach(accident => {
        const el = document.createElement('div');
        el.className = 'accident-marker';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3L3 19h18L12 3z" fill="#D97706" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
            <path d="M12 9v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="15.5" r="1" fill="#fff"/>
        </svg>`;
        el.style.display = 'none';

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([accident.lon, accident.lat])
            .addTo(map);

        el.addEventListener('mouseenter', () => {
            popup.setLngLat([accident.lon, accident.lat])
                .setHTML(`
                    <div style="padding: 8px; font-family: Inter, sans-serif; color: #000;">
                        <strong>${accident.area}</strong><br>
                        <span style="color: #ea580c;">Severity: ${accident.severity}/10</span>
                    </div>
                `)
                .addTo(map);
        });

        el.addEventListener('mouseleave', () => {
            popup.remove();
        });

        accidentMarkers.push({ marker, element: el });
    });
}

function toggleAccidents() {
    const btn = document.getElementById('accidents-btn');
    const isVisible = btn.getAttribute('data-visible') === 'true';
    const newVisibility = !isVisible;

    // Update button state immediately for responsiveness
    btn.setAttribute('data-visible', newVisibility);
    const label = btn.querySelector('.btn-label');

    if (newVisibility) {
        btn.classList.add('active');
        if (label) label.textContent = 'Hide Accidents';
    } else {
        btn.classList.remove('active');
        if (label) label.textContent = 'Accident Zones';
    }

    // Defer heavy marker updates to next frame to avoid blocking INP
    requestAnimationFrame(() => {
        accidentMarkers.forEach(item => {
            item.element.style.display = newVisibility ? 'flex' : 'none';
        });
    });
}


// ========================================
// Route Rendering
// ========================================
function renderRoutesOnMap(routes) {
    clearRoutes();

    routes.forEach((route, index) => {
        try {
            const sourceId = `route-${route.id}`;
            const layerId = `route-layer-${route.id}`;

            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: route.geometry
                }
            });

            // Add route layer BELOW traffic incidents so red lines appear on top
            const beforeLayer = map.getLayer('traffic-incidents-line') ? 'traffic-incidents-line' : 'crime-points';

            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': index === 0 ? '#10b981' : (index === 1 ? '#f59e0b' : '#94a3b8'),
                    'line-width': route.id === selectedRouteId ? 6 : 4,
                    'line-opacity': route.id === selectedRouteId ? 1 : 0.6
                }
            }, beforeLayer);

            map.on('click', layerId, () => {
                selectRoute(route.id);
            });

            map.on('mouseenter', layerId, () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
            });
        } catch (error) {
            console.error(`Error adding route ${index + 1}:`, error);
        }
    });

    if (routes.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        routes.forEach(route => {
            route.geometry.coordinates.forEach(coord => {
                bounds.extend(coord);
            });
        });

        // Check if mobile
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        if (isMobile) {
            // Mobile: Minimize panel and fit to route
            const panel = document.querySelector('.sidebar');
            if (panel) {
                panel.classList.remove('expanded');
                panel.classList.add('minimized');
            }

            // Simple direct fit bounds - no dramatic zoom out on mobile
            // Wait for panel to minimize first
            setTimeout(() => {
                console.log('Mobile fitBounds called');
                console.log('Map exists:', !!map);
                console.log('Bounds:', bounds);
                console.log('Bounds array:', bounds.toArray ? bounds.toArray() : 'N/A');

                if (map && !bounds.isEmpty()) {
                    map.fitBounds(bounds, {
                        padding: { top: 100, bottom: 110, left: 40, right: 40 },
                        maxZoom: 14,
                        duration: 1500
                    });
                    console.log('fitBounds executed');
                } else {
                    console.error('Cannot fitBounds - map:', !!map, 'bounds empty:', bounds.isEmpty ? bounds.isEmpty() : 'unknown');
                }
            }, 500);
        } else {
            // Desktop: Original animation sequence
            // 1. Fly to Bengaluru center (zoom out)
            // 2. Then fit bounds to the route (zoom in)
            map.flyTo({
                center: [77.5946, 12.9716],
                zoom: 9,
                padding: { left: 450, right: 50 },
                duration: 2000,
                essential: true
            });

            setTimeout(() => {
                map.fitBounds(bounds, {
                    padding: { top: 100, bottom: 20, left: 430, right: 20 },
                    duration: 2000
                });
            }, 2000);
        }
    }
}

function clearRoutes() {
    currentRoutes.forEach(route => {
        const sourceId = `route-${route.id}`;
        const layerId = `route-layer-${route.id}`;

        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    });
}

// ========================================
// Marker Management
// ========================================
function clearMarkers() {
    if (startMarker) {
        startMarker.remove();
        startMarker = null;
    }
    if (endMarker) {
        endMarker.remove();
        endMarker = null;
    }
}

function addMarkers(startCoords, endCoords) {
    clearMarkers();

    // Start marker - simple green circle (Google Maps style origin)
    const startEl = document.createElement('div');
    startEl.className = 'route-marker start-marker';
    startEl.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:0;margin:0;';
    startEl.innerHTML = `<svg width="25" height="25" viewBox="0 0 20 20" style="display:block;">
        <circle cx="10" cy="10" r="8" fill="#22c55e"/>
        <circle cx="10" cy="10" r="3" fill="#fff"/>
    </svg>`;

    startMarker = new maplibregl.Marker({ element: startEl, anchor: 'center' })
        .setLngLat([startCoords.lon, startCoords.lat])
        .addTo(map);

    // End marker - classic red pin (Google Maps style destination)
    const endEl = document.createElement('div');
    endEl.className = 'route-marker end-marker';
    endEl.style.cssText = 'display:flex;align-items:flex-end;justify-content:center;padding:0;margin:0;';
    endEl.innerHTML = `<svg width="25" height="35" viewBox="0 0 20 28" style="display:block;">
        <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 18 10 18s10-10.5 10-18C20 4.5 15.5 0 10 0z" fill="#ef4444"/>
        <circle cx="10" cy="9" r="3.5" fill="#fff"/>
    </svg>`;

    endMarker = new maplibregl.Marker({ element: endEl, anchor: 'bottom' })
        .setLngLat([endCoords.lon, endCoords.lat])
        .addTo(map);
}

// ========================================
// Route Selection
// ========================================
function selectRoute(routeId) {
    selectedRouteId = routeId;

    currentRoutes.forEach((route, index) => {
        const layerId = `route-layer-${route.id}`;
        if (map.getLayer(layerId)) {
            const isSelected = route.id === routeId;

            // Intrinsic colors: Index 0 = Green, Index 1 = Yellow, Others = Gray
            const color = index === 0 ? '#10b981' : (index === 1 ? '#f59e0b' : '#94a3b8');

            map.setPaintProperty(layerId, 'line-width', isSelected ? 6 : 4);
            map.setPaintProperty(layerId, 'line-opacity', isSelected ? 1 : 0.4);
            map.setPaintProperty(layerId, 'line-color', color);

            // Move selected route to top
            if (isSelected) {
                map.moveLayer(layerId);
            }
        }
    });

    document.querySelectorAll('.route-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.routeId === routeId);
    });
}

// ========================================
// UI Rendering
// ========================================
function renderRoutesList(routes) {
    const routesList = document.getElementById('routes-list');
    const routesContainer = document.getElementById('routes-container');

    routesList.innerHTML = '';

    routes.forEach((route, index) => {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.dataset.routeId = route.id;
        card.style.setProperty('--route-color', route.color);

        if (index === 0) {
            card.classList.add('selected');
            selectedRouteId = route.id;
        }

        const safetyLevel = getSafetyLevel(route.safetyScore);
        const safetyText = safetyLevel === 'high' ? 'Safest' :
            safetyLevel === 'medium' ? 'Moderate' : 'Caution';

        const nearest = findNearestFacilities(route.geometry);

        card.innerHTML = `
      <div class="route-header">
        <h3 class="route-name">Route ${index + 1}</h3>
        <span class="safety-badge ${safetyLevel}">${safetyText}</span>
      </div>
      <div class="route-details">
        <div class="route-stat">
          <span class="stat-label">Safety Score</span>
          <span class="safety-score ${safetyLevel}">${route.safetyScore}/100</span>
        </div>
        <div class="route-stat">
          <span class="stat-label">Distance</span>
          <span class="stat-value">${formatDistance(route.distance)}</span>
        </div>
        <div class="route-stat">
          <span class="stat-label">Duration</span>
          <span class="stat-value">${formatDuration(route.duration)}</span>
        </div>
      </div>
      ${route.delayDetails && route.delayDetails.length > 0 ? `
        <div class="delay-info" style="margin-top: 8px; padding: 4px 8px; background: rgba(220, 38, 38, 0.1); border-radius: 4px; border: 1px solid rgba(220, 38, 38, 0.2);">
           ${route.delayDetails.map(d => `<div style="font-size: 0.8rem; color: #fca5a5;">⚠️ ${d.message}</div>`).join('')}
        </div>
      ` : ''}
      <div class="route-facilities" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; font-size: 0.85rem; color: #cbd5e1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">🏥 ${nearest.hospital.name}</span>
            <span style="color: #fff; white-space: nowrap; min-width: 60px; text-align: right;">${formatDistance(nearest.hospital.distance * 1000)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">👮 ${nearest.police.name}</span>
            <span style="color: #fff; white-space: nowrap; min-width: 60px; text-align: right;">${formatDistance(nearest.police.distance * 1000)}</span>
        </div>
      </div>
    `;

        card.addEventListener('click', () => {
            selectRoute(route.id);
        });

        routesList.appendChild(card);
    });

    routesContainer.classList.add('visible');
}

// ========================================
// Main Route Finding Logic
// ========================================
async function findSafeRoutes() {
    const startInput = document.getElementById('start-location').value.trim();
    const endInput = document.getElementById('end-location').value.trim();
    const loadingOverlay = document.getElementById('loading-overlay');
    const findButton = document.getElementById('find-routes-btn');

    if (!startInput || !endInput) {
        alert('Please enter both starting point and destination');
        return;
    }

    try {
        loadingOverlay.classList.remove('hidden');
        findButton.disabled = true;

        // Check if we have stored coordinates from autocomplete
        const startEl = document.getElementById('start-location');
        const endEl = document.getElementById('end-location');

        let startCoords, endCoords;

        if (startEl.dataset.lat && startEl.dataset.lon) {
            console.log('Using stored start coordinates');
            startCoords = {
                lat: parseFloat(startEl.dataset.lat),
                lon: parseFloat(startEl.dataset.lon),
                display_name: startInput
            };
        } else {
            // Geocode start location
            startCoords = await geocodeLocation(startInput);
            // Add delay if we need to geocode the next one too
            if (!endEl.dataset.lat) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (endEl.dataset.lat && endEl.dataset.lon) {
            console.log('Using stored end coordinates');
            endCoords = {
                lat: parseFloat(endEl.dataset.lat),
                lon: parseFloat(endEl.dataset.lon),
                display_name: endInput
            };
        } else {
            // Geocode end location
            endCoords = await geocodeLocation(endInput);
        }

        console.log('Start:', startCoords);
        console.log('End:', endCoords);

        // Fetch weather data in parallel
        const [startWeather, endWeather] = await Promise.all([
            getWeather(startCoords.lat, startCoords.lon),
            getWeather(endCoords.lat, endCoords.lon)
        ]);

        renderWeatherInfo(startWeather, endWeather);



        // Add markers for start and destination
        addMarkers(startCoords, endCoords);

        // Fetch Routes from OSRM
        const routes = await getRoutes(startCoords, endCoords);
        console.log('Routes fetched:', routes.length);

        const routesWithSafety = routes.map(route => ({
            ...route,
            safetyScore: calculateSafetyScore(route.geometry),
            color: getRouteColor(calculateSafetyScore(route.geometry))
        }));

        // Calculate bounding box for traffic data
        const minLon = Math.min(startCoords.lon, endCoords.lon) - 0.05;
        const minLat = Math.min(startCoords.lat, endCoords.lat) - 0.05;
        const maxLon = Math.max(startCoords.lon, endCoords.lon) + 0.05;
        const maxLat = Math.max(startCoords.lat, endCoords.lat) + 0.05;
        const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;

        await updateTrafficLayer(bbox);

        // 2. Adjust Duration based on Weather & Traffic
        // 2. Adjust Duration based on Weather & Traffic
        // Initial pass to set durations for all routes
        routesWithSafety.forEach((route, index) => {
            // Use START weather for simplicity (could average start/end)
            const weather = startWeather || endWeather;
            const adjustment = calculateAdjustedDuration(route.duration, weather, globalTrafficIncidents, route.geometry);

            route.duration = adjustment.duration; // Update to adjusted duration
            route.originalDuration = route.originalDuration || route.duration;
            route.delayDetails = adjustment.delays;
        });

        // 3. Smart Sorting: Safety Tier > Time (if diff > 20min) > Safety Score (if diff > 10) > Duration
        routesWithSafety.sort((a, b) => {
            // Helper to get tier (3=High, 2=Medium, 1=Low)
            const getTier = (score) => {
                if (score >= 75) return 3; // Match High threshold
                if (score >= 50) return 2; // Match Medium threshold
                return 1;
            };

            const tierA = getTier(a.safetyScore);
            const tierB = getTier(b.safetyScore);

            // Priority 1: Safety Tier (Higher is better)
            if (tierA !== tierB) {
                return tierB - tierA;
            }

            // Within same tier, check thresholds
            const scoreDiff = Math.abs(a.safetyScore - b.safetyScore);
            const timeDiff = Math.abs(a.duration - b.duration); // in seconds
            const timeDiffMinutes = timeDiff / 60;

            // Priority 2: If time difference > 20 minutes, prioritize faster route
            if (timeDiffMinutes > 20) {
                return a.duration - b.duration;
            }

            // Priority 3: If safety score difference > 10, prioritize higher safety
            if (scoreDiff > 10) {
                return b.safetyScore - a.safetyScore;
            }

            // Priority 4: Otherwise, prioritize faster duration
            return a.duration - b.duration;
        });

        // 4. Update Traffic Visuals for the BEST route
        // We do this AFTER sorting to ensure we show traffic for the top-ranked route
        let routeSpecificIncidents = [];
        if (routesWithSafety.length > 0) {
            // Re-calculate adjustment for the winner to get its specific incidents
            // (Efficient enough to re-run for just one, or we could have stored it)
            const bestRoute = routesWithSafety[0];
            const weather = startWeather || endWeather;
            const adjustment = calculateAdjustedDuration(bestRoute.duration, weather, globalTrafficIncidents, bestRoute.geometry);
            routeSpecificIncidents = adjustment.matchedIncidents || [];
        }

        if (routeSpecificIncidents.length > 0) {
            updateTrafficLayer(routeSpecificIncidents);
        } else {
            updateTrafficLayer([]);
        }

        console.log('Routes with safety scores:', routesWithSafety);

        currentRoutes = routesWithSafety;

        // Select the first route by default so it renders as selected (cyan)
        if (currentRoutes.length > 0) {
            selectedRouteId = currentRoutes[0].id;
        }

        renderRoutesOnMap(routesWithSafety);
        renderRoutesList(routesWithSafety);

    } catch (error) {
        console.error('Error finding routes:', error);
        alert(`Error: ${error.message}`);
    } finally {
        loadingOverlay.classList.add('hidden');
        findButton.disabled = false;
    }
}

// ========================================
// Event Listeners & Initialization
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();

    // Find Routes Button
    const findRoutesBtn = document.getElementById('find-routes-btn');
    if (findRoutesBtn) {
        findRoutesBtn.addEventListener('click', findSafeRoutes);
    }

    // Input field enter key handlers
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');

    if (startInput) {
        startInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') findSafeRoutes();
        });
        setupAutocomplete('start-location');
    }

    if (endInput) {
        endInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') findSafeRoutes();
        });
        setupAutocomplete('end-location');
    }

    // Quick Action Buttons
    const metroBtn = document.getElementById('metro-btn');
    const bmtcBtn = document.getElementById('bmtc-btn');
    const accidentsBtn = document.getElementById('accidents-btn');
    const facilitiesBtn = document.getElementById('facilities-btn');

    if (metroBtn) metroBtn.addEventListener('click', toggleMetroStops);
    if (bmtcBtn) bmtcBtn.addEventListener('click', toggleBmtcRoutes);
    if (accidentsBtn) accidentsBtn.addEventListener('click', toggleAccidents);
    if (facilitiesBtn) facilitiesBtn.addEventListener('click', toggleFacilities);

    // SOS Button Handler
    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
        sosBtn.addEventListener('click', () => {
            alert('Emergency message sent! Help is on the way.');
        });
    }

    // ========================================
    // Unified Sidebar Mode Switching
    // ========================================
    initUnifiedSidebar();

    // ========================================
    // Group Meet Panel Functionality
    // ========================================
    initGroupMeetPanel();
});

// ========================================
// Unified Sidebar Mode & Collapse
// ========================================
function initUnifiedSidebar() {
    const sidebar = document.getElementById('floating-sidebar');
    const soloModeBtn = document.getElementById('solo-mode-btn');
    const groupModeBtn = document.getElementById('group-mode-btn');
    const soloContent = document.getElementById('solo-content');
    const groupContent = document.getElementById('group-content');
    const collapseBtn = document.getElementById('sidebar-collapse');
    const expandBtn = document.getElementById('sidebar-expand');

    // Mode switching
    if (soloModeBtn && groupModeBtn) {
        soloModeBtn.addEventListener('click', () => {
            soloModeBtn.classList.add('active');
            groupModeBtn.classList.remove('active');
            if (soloContent) soloContent.classList.remove('hidden');
            if (groupContent) groupContent.classList.add('hidden');
            clearGroupFromMap();
        });

        groupModeBtn.addEventListener('click', () => {
            groupModeBtn.classList.add('active');
            soloModeBtn.classList.remove('active');
            if (groupContent) groupContent.classList.remove('hidden');
            if (soloContent) soloContent.classList.add('hidden');
            clearRoutes();
            renderPersonInputs();
        });
    }

    // Sidebar collapse/expand
    if (collapseBtn && sidebar && expandBtn) {
        collapseBtn.addEventListener('click', () => {
            sidebar.classList.add('collapsed');
            expandBtn.classList.remove('hidden');
        });

        expandBtn.addEventListener('click', () => {
            sidebar.classList.remove('collapsed');
            expandBtn.classList.add('hidden');
        });
    }

    // Category chip selection
    const categoryChips = document.querySelectorAll('.category-chip');
    const categoryInput = document.getElementById('venue-category');

    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            if (categoryInput) {
                categoryInput.value = chip.dataset.category;
            }
        });
    });
}

// ========================================
// Mobile Panel Drag & State Management
// ========================================
function initMobilePanel() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    const panel = document.querySelector('.sidebar');
    const handle = document.querySelector('.panel-drag-handle');

    if (!panel || !handle) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    let hasMoved = false;

    // Helper function to refit route bounds based on panel state
    function refitRouteBounds() {
        if (!currentRoutes || currentRoutes.length === 0) return;
        if (!map) return;

        const bounds = new maplibregl.LngLatBounds();
        currentRoutes.forEach(route => {
            if (route.geometry && route.geometry.coordinates) {
                route.geometry.coordinates.forEach(coord => {
                    bounds.extend(coord);
                });
            }
        });

        if (bounds.isEmpty()) return;

        // Get actual measurements
        const panelHeight = panel.offsetHeight || 0;

        // Get top bar height (search bar + SOS button area)
        const topBar = document.querySelector('.mobile-top-bar');
        const topBarHeight = topBar ? topBar.offsetHeight : 60;

        // Top padding = top bar height + buffer
        const topPadding = topBarHeight + 15;

        // Bottom padding = panel height + buffer
        const bottomPadding = panelHeight + 15;

        console.log('Refit:', { topPadding, bottomPadding, panelHeight, topBarHeight });

        map.fitBounds(bounds, {
            padding: {
                top: topPadding,
                bottom: bottomPadding,
                left: 25,
                right: 25
            },
            maxZoom: 15,
            duration: 500
        });
    }

    // Touch start on drag handle - begin potential drag
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        hasMoved = false;
        startY = e.touches[0].clientY;
        startHeight = panel.offsetHeight;
        panel.style.transition = 'none';
    }, { passive: true });

    // Touch move - this is the actual dragging
    handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        hasMoved = true;

        const currentY = e.touches[0].clientY;
        const deltaY = startY - currentY;
        const newHeight = startHeight + deltaY;
        const vh = window.innerHeight;

        // Clamp between 70px (minimized) and 70vh (expanded)
        const clampedHeight = Math.min(Math.max(newHeight, 70), vh * 0.70);
        panel.style.height = `${clampedHeight}px`;
    }, { passive: true });

    // Touch end - snap to nearest state
    handle.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;

        panel.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)';

        // If user didn't move much, treat as a tap
        if (!hasMoved) {
            // Toggle between states on tap
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
                setTimeout(refitRouteBounds, 400);
            } else if (panel.classList.contains('expanded')) {
                panel.classList.remove('expanded');
                setTimeout(refitRouteBounds, 400);
            } else {
                panel.classList.add('expanded');
                setTimeout(refitRouteBounds, 400);
            }
            return;
        }

        const currentHeight = panel.offsetHeight;
        const vh = window.innerHeight;

        // Snap thresholds: below 20% = minimized, above 50% = expanded
        const minimizedThreshold = vh * 0.20;
        const expandedThreshold = vh * 0.50;

        panel.classList.remove('minimized', 'expanded');
        panel.style.height = '';

        if (currentHeight < minimizedThreshold) {
            panel.classList.add('minimized');
        } else if (currentHeight > expandedThreshold) {
            panel.classList.add('expanded');
        }

        // Refit route after state change
        setTimeout(refitRouteBounds, 400);
    });

    // MAP CLICK: Minimize panel when clicking on the map
    if (map) {
        map.on('click', (e) => {
            // Check if click is on a route layer (don't minimize if selecting route)
            const features = map.queryRenderedFeatures(e.point);
            const clickedOnRoute = features.some(f => f.layer && f.layer.id && f.layer.id.startsWith('route-layer-'));

            if (!clickedOnRoute && !panel.classList.contains('minimized')) {
                panel.classList.remove('expanded');
                panel.classList.add('minimized');
                setTimeout(refitRouteBounds, 400);
            }
        });
    }

    // DO NOT expand on input focus - keep panel at default size
    // (Removed the input focus listener that was expanding the panel)

    // Handle resize - reinitialize if crossing mobile breakpoint
    let wasMobile = isMobile;
    window.addEventListener('resize', () => {
        const nowMobile = window.matchMedia('(max-width: 768px)').matches;
        if (nowMobile !== wasMobile) {
            wasMobile = nowMobile;
            if (nowMobile) {
                initMobilePanel();
                initMobileSearchPanel();
            } else {
                // Reset panel state on desktop
                panel.classList.remove('minimized', 'expanded');
                panel.style.height = '';
            }
        }
    });

    // Make refitRouteBounds globally accessible for use elsewhere
    window.refitMobileRouteBounds = refitRouteBounds;
}

// ========================================
// Mobile Expandable Search Panel
// ========================================
function initMobileSearchPanel() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    const collapsedSearch = document.getElementById('mobile-search-collapsed');
    const expandedSearch = document.getElementById('mobile-search-expanded');
    const backBtn = document.getElementById('search-back-btn');
    const mobileStartInput = document.getElementById('mobile-start-input');
    const mobileEndInput = document.getElementById('mobile-end-input');
    const mainStartInput = document.getElementById('start-location');
    const mainEndInput = document.getElementById('end-location');

    if (!collapsedSearch || !expandedSearch) return;

    // Setup autocomplete for mobile inputs
    setupAutocomplete('mobile-start-input');
    setupAutocomplete('mobile-end-input');

    // Mobile SOS button - trigger emergency modal
    const mobileSosBtn = document.getElementById('mobile-sos-btn');
    if (mobileSosBtn) {
        mobileSosBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't open search panel
            const sosBtn = document.getElementById('sos-btn');
            if (sosBtn) sosBtn.click();
        });
    }

    // Open expanded search when collapsed bar is tapped
    collapsedSearch.addEventListener('click', () => {
        expandedSearch.classList.remove('hidden');
        collapsedSearch.style.opacity = '0';
        collapsedSearch.style.pointerEvents = 'none';

        // Minimize bottom panel when search is opened
        const panel = document.querySelector('.sidebar');
        if (panel) {
            panel.classList.remove('expanded');
            panel.classList.add('minimized');
        }

        // Sync values from main inputs
        if (mobileStartInput && mainStartInput) {
            mobileStartInput.value = mainStartInput.value;
        }
        if (mobileEndInput && mainEndInput) {
            mobileEndInput.value = mainEndInput.value;
        }

        // Focus first input after animation
        setTimeout(() => {
            if (mobileStartInput) mobileStartInput.focus();
        }, 300);
    });

    // Minimize bottom panel when inputs are focused
    const minimizePanelOnFocus = () => {
        const panel = document.querySelector('.sidebar');
        if (panel && !panel.classList.contains('minimized')) {
            panel.classList.remove('expanded');
            panel.classList.add('minimized');
        }
    };

    if (mobileStartInput) {
        mobileStartInput.addEventListener('focus', minimizePanelOnFocus);
    }
    if (mobileEndInput) {
        mobileEndInput.addEventListener('focus', minimizePanelOnFocus);
    }

    // Close expanded search when back button is tapped
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            expandedSearch.classList.add('hidden');
            collapsedSearch.style.opacity = '1';
            collapsedSearch.style.pointerEvents = 'auto';

            // Sync values back to main inputs
            if (mobileStartInput && mainStartInput) {
                mainStartInput.value = mobileStartInput.value;
            }
            if (mobileEndInput && mainEndInput) {
                mainEndInput.value = mobileEndInput.value;
            }
        });
    }

    // Sync mobile inputs with main inputs and trigger geocoding on Enter
    if (mobileStartInput) {
        mobileStartInput.addEventListener('input', () => {
            // Defer sync to avoid blocking INP
            requestAnimationFrame(() => {
                if (mainStartInput) mainStartInput.value = mobileStartInput.value;
            });
        });

        mobileStartInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (mobileEndInput) mobileEndInput.focus();
            }
        });
    }

    if (mobileEndInput) {
        mobileEndInput.addEventListener('input', () => {
            // Defer sync to avoid blocking INP
            requestAnimationFrame(() => {
                if (mainEndInput) mainEndInput.value = mobileEndInput.value;
            });
        });

        mobileEndInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // Close expanded search and trigger route finding
                expandedSearch.classList.add('hidden');
                collapsedSearch.style.opacity = '1';
                collapsedSearch.style.pointerEvents = 'auto';

                // Sync and find routes
                if (mainStartInput) mainStartInput.value = mobileStartInput.value;
                if (mainEndInput) mainEndInput.value = mobileEndInput.value;

                // Trigger route finding
                const findBtn = document.getElementById('find-routes-btn');
                if (findBtn) findBtn.click();
            }
        });
    }

    // Mobile Find Routes Button
    const mobileFindBtn = document.getElementById('mobile-find-routes-btn');
    if (mobileFindBtn) {
        mobileFindBtn.addEventListener('click', () => {
            // Sync values and coordinates to main inputs
            if (mobileStartInput && mainStartInput) {
                mainStartInput.value = mobileStartInput.value;
                // Also sync coordinates if available
                if (mobileStartInput.dataset.lat) {
                    mainStartInput.dataset.lat = mobileStartInput.dataset.lat;
                    mainStartInput.dataset.lon = mobileStartInput.dataset.lon;
                }
            }
            if (mobileEndInput && mainEndInput) {
                mainEndInput.value = mobileEndInput.value;
                // Also sync coordinates if available
                if (mobileEndInput.dataset.lat) {
                    mainEndInput.dataset.lat = mobileEndInput.dataset.lat;
                    mainEndInput.dataset.lon = mobileEndInput.dataset.lon;
                }
            }

            // Close expanded search panel
            expandedSearch.classList.add('hidden');
            collapsedSearch.style.opacity = '1';
            collapsedSearch.style.pointerEvents = 'auto';

            // Trigger route finding
            const findBtn = document.getElementById('find-routes-btn');
            if (findBtn) findBtn.click();
        });
    }
}

// ========================================
// Mobile Bottom Sheet - Google Maps Style Draggable
// ========================================
function initMobileBottomSheet() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    const sheet = document.getElementById('mobile-sheet');
    const handle = document.getElementById('sheet-handle');
    const content = document.getElementById('sheet-content');

    if (!sheet || !handle) return;

    // Sheet state
    let startY = 0;
    let startTranslateY = 0;
    let isDragging = false;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    // Snap positions (percentage of sheet height visible)
    const SNAP_PEEK = 140;      // px from bottom
    const SNAP_HALF = 50;        // percentage
    const SNAP_EXPANDED = 0;     // percentage (fully visible)

    // Get current translateY from transform
    function getTranslateY() {
        const transform = window.getComputedStyle(sheet).transform;
        if (transform === 'none') return 0;
        const matrix = new DOMMatrix(transform);
        return matrix.m42;
    }

    // Calculate snap position based on velocity and current position
    function getSnapPosition(currentY, vel) {
        const sheetHeight = sheet.offsetHeight;
        const vh = window.innerHeight;

        const peekY = sheetHeight - SNAP_PEEK;
        const halfY = sheetHeight * (SNAP_HALF / 100);
        const expandedY = SNAP_EXPANDED;

        // If strong upward velocity, go to expanded or half
        if (vel < -0.5) {
            if (currentY > halfY) return halfY;
            return expandedY;
        }

        // If strong downward velocity, go to half or peek
        if (vel > 0.5) {
            if (currentY < halfY) return halfY;
            return peekY;
        }

        // Otherwise snap to nearest
        const distToPeek = Math.abs(currentY - peekY);
        const distToHalf = Math.abs(currentY - halfY);
        const distToExpanded = Math.abs(currentY - expandedY);

        const minDist = Math.min(distToPeek, distToHalf, distToExpanded);

        if (minDist === distToExpanded) return expandedY;
        if (minDist === distToHalf) return halfY;
        return peekY;
    }

    // Update sheet class based on position
    function updateSheetClass(translateY) {
        const sheetHeight = sheet.offsetHeight;
        const peekY = sheetHeight - SNAP_PEEK;
        const halfY = sheetHeight * (SNAP_HALF / 100);

        sheet.classList.remove('peek', 'half', 'expanded');

        if (translateY >= peekY - 20) {
            sheet.classList.add('peek');
        } else if (translateY <= 20) {
            sheet.classList.add('expanded');
        } else {
            sheet.classList.add('half');
        }
    }

    // Pointer/Touch start
    function onDragStart(e) {
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        isDragging = true;
        startY = clientY;
        startTranslateY = getTranslateY();
        lastY = clientY;
        lastTime = Date.now();
        velocity = 0;

        sheet.classList.add('dragging');
    }

    // Pointer/Touch move
    function onDragMove(e) {
        if (!isDragging) return;

        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = clientY - startY;
        let newTranslateY = startTranslateY + deltaY;

        // Clamp to valid range
        const sheetHeight = sheet.offsetHeight;
        const maxTranslateY = sheetHeight - SNAP_PEEK;
        newTranslateY = Math.max(0, Math.min(newTranslateY, maxTranslateY));

        // Calculate velocity
        const now = Date.now();
        const dt = now - lastTime;
        if (dt > 0) {
            velocity = (clientY - lastY) / dt;
        }
        lastY = clientY;
        lastTime = now;

        sheet.style.transform = `translateY(${newTranslateY}px)`;
    }

    // Pointer/Touch end
    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;

        sheet.classList.remove('dragging');

        const currentTranslateY = getTranslateY();
        const snapPosition = getSnapPosition(currentTranslateY, velocity);

        sheet.style.transform = `translateY(${snapPosition}px)`;
        updateSheetClass(snapPosition);
    }

    // Add event listeners for drag
    handle.addEventListener('touchstart', onDragStart, { passive: true });
    handle.addEventListener('mousedown', onDragStart);

    document.addEventListener('touchmove', onDragMove, { passive: true });
    document.addEventListener('mousemove', onDragMove);

    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('mouseup', onDragEnd);

    // Allow dragging from content when not at scroll top and expanded
    content.addEventListener('touchstart', (e) => {
        if (sheet.classList.contains('expanded') && content.scrollTop > 0) {
            return; // Allow normal scroll
        }
        if (!sheet.classList.contains('expanded')) {
            onDragStart(e);
        }
    }, { passive: true });

    // Initialize in peek state
    const sheetHeight = sheet.offsetHeight;
    sheet.style.transform = `translateY(${sheetHeight - SNAP_PEEK}px)`;
    sheet.classList.add('peek');

    // Handle tap on handle to toggle states
    let tapStartTime = 0;
    let tapStartY = 0;

    handle.addEventListener('touchstart', (e) => {
        tapStartTime = Date.now();
        tapStartY = e.touches[0].clientY;
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
        const tapDuration = Date.now() - tapStartTime;
        const tapDistance = Math.abs(e.changedTouches[0].clientY - tapStartY);

        // If it was a tap (short duration, small movement)
        if (tapDuration < 200 && tapDistance < 10) {
            const sheetHeight = sheet.offsetHeight;
            const currentY = getTranslateY();
            const peekY = sheetHeight - SNAP_PEEK;
            const halfY = sheetHeight * (SNAP_HALF / 100);

            // Cycle through states: peek -> half -> expanded -> peek
            let newY;
            if (currentY > halfY) {
                newY = halfY;
            } else if (currentY > 20) {
                newY = 0;
            } else {
                newY = peekY;
            }

            sheet.style.transform = `translateY(${newY}px)`;
            updateSheetClass(newY);
        }
    });

    // ========================================
    // Sync Mobile Inputs with Desktop
    // ========================================
    const mobileStartInput = document.getElementById('mobile-start-location');
    const mobileEndInput = document.getElementById('mobile-end-location');
    const desktopStartInput = document.getElementById('start-location');
    const desktopEndInput = document.getElementById('end-location');

    // Setup autocomplete for mobile inputs
    setupAutocomplete('mobile-start-location');
    setupAutocomplete('mobile-end-location');

    // Sync mobile -> desktop
    if (mobileStartInput) {
        mobileStartInput.addEventListener('input', () => {
            requestAnimationFrame(() => {
                if (desktopStartInput) desktopStartInput.value = mobileStartInput.value;
            });
        });
    }

    if (mobileEndInput) {
        mobileEndInput.addEventListener('input', () => {
            requestAnimationFrame(() => {
                if (desktopEndInput) desktopEndInput.value = mobileEndInput.value;
            });
        });
    }

    // Mobile Find Routes button
    const mobileFindRoutesBtn = document.getElementById('mobile-find-routes-btn');
    if (mobileFindRoutesBtn) {
        mobileFindRoutesBtn.addEventListener('click', () => {
            // Sync coordinates if available
            if (mobileStartInput && desktopStartInput) {
                desktopStartInput.value = mobileStartInput.value;
                if (mobileStartInput.dataset.lat) {
                    desktopStartInput.dataset.lat = mobileStartInput.dataset.lat;
                    desktopStartInput.dataset.lon = mobileStartInput.dataset.lon;
                }
            }
            if (mobileEndInput && desktopEndInput) {
                desktopEndInput.value = mobileEndInput.value;
                if (mobileEndInput.dataset.lat) {
                    desktopEndInput.dataset.lat = mobileEndInput.dataset.lat;
                    desktopEndInput.dataset.lon = mobileEndInput.dataset.lon;
                }
            }

            // Trigger route finding
            findSafeRoutes();

            // Expand sheet to show results
            setTimeout(() => {
                const halfY = sheet.offsetHeight * (SNAP_HALF / 100);
                sheet.style.transform = `translateY(${halfY}px)`;
                updateSheetClass(halfY);
            }, 500);
        });
    }

    // ========================================
    // Mobile Mode Toggle
    // ========================================
    const mobileSoloBtn = document.getElementById('mobile-solo-mode-btn');
    const mobileGroupBtn = document.getElementById('mobile-group-mode-btn');
    const mobileSoloContent = document.getElementById('mobile-solo-content');
    const mobileGroupContent = document.getElementById('mobile-group-content');

    // Also sync with desktop mode buttons
    const desktopSoloBtn = document.getElementById('solo-mode-btn');
    const desktopGroupBtn = document.getElementById('group-mode-btn');

    function setMobileMode(mode) {
        if (mode === 'solo') {
            mobileSoloBtn?.classList.add('active');
            mobileGroupBtn?.classList.remove('active');
            mobileSoloContent?.classList.remove('hidden');
            mobileGroupContent?.classList.add('hidden');
            // Sync desktop
            desktopSoloBtn?.click();
        } else {
            mobileSoloBtn?.classList.remove('active');
            mobileGroupBtn?.classList.add('active');
            mobileSoloContent?.classList.add('hidden');
            mobileGroupContent?.classList.remove('hidden');
            // Sync desktop
            desktopGroupBtn?.click();
            // Initialize mobile group inputs
            initMobileGroupMeet();
        }
    }

    mobileSoloBtn?.addEventListener('click', () => setMobileMode('solo'));
    mobileGroupBtn?.addEventListener('click', () => setMobileMode('group'));

    // ========================================
    // Mobile Quick Actions
    // ========================================
    document.getElementById('mobile-metro-btn')?.addEventListener('click', () => {
        document.getElementById('metro-btn')?.click();
    });
    document.getElementById('mobile-bmtc-btn')?.addEventListener('click', () => {
        document.getElementById('bmtc-btn')?.click();
    });
    document.getElementById('mobile-accidents-btn')?.addEventListener('click', () => {
        document.getElementById('accidents-btn')?.click();
    });

    // Expand sheet when inputs are focused
    if (mobileStartInput) {
        mobileStartInput.addEventListener('focus', () => {
            sheet.style.transform = 'translateY(0)';
            updateSheetClass(0);
        });
    }
    if (mobileEndInput) {
        mobileEndInput.addEventListener('focus', () => {
            sheet.style.transform = 'translateY(0)';
            updateSheetClass(0);
        });
    }
}

// Initialize mobile group meet for the mobile sheet
function initMobileGroupMeet() {
    const mobileAddBtn = document.getElementById('mobile-add-person-btn');
    const mobileFindMeetingBtn = document.getElementById('mobile-find-meeting-btn');
    const mobileLocationsList = document.getElementById('mobile-group-locations-list');
    const mobileCategoryChips = document.querySelectorAll('#mobile-group-content .category-chip');

    if (!mobileLocationsList) return;

    // Render person inputs for mobile
    mobileLocationsList.innerHTML = '';

    groupLocations.forEach((person, index) => {
        const row = document.createElement('div');
        row.className = 'person-input-row';
        row.innerHTML = `
            <span class="person-color-dot" style="background-color: ${PERSON_COLORS[index]}"></span>
            <span class="person-label">Person ${index + 1}</span>
            <input 
                type="text" 
                class="person-input mobile-person-input" 
                placeholder="Enter location..."
                value="${person.name}"
                data-person-id="${person.id}"
                autocomplete="off"
            >
            <button class="remove-person-btn ${groupLocations.length <= 2 ? 'disabled' : ''}" data-person-id="${person.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
            </button>
        `;

        mobileLocationsList.appendChild(row);

        const input = row.querySelector('.person-input');
        setupPersonAutocomplete(input, person.id);

        const removeBtn = row.querySelector('.remove-person-btn');
        if (removeBtn && groupLocations.length > 2) {
            removeBtn.addEventListener('click', () => {
                groupLocations = groupLocations.filter(p => p.id !== person.id);
                renderPersonInputs(); // Desktop
                initMobileGroupMeet(); // Mobile
            });
        }
    });

    // Add person button
    if (mobileAddBtn) {
        mobileAddBtn.onclick = () => {
            if (groupLocations.length < 6) {
                groupLocations.push({
                    id: nextPersonId++,
                    name: '',
                    lat: null,
                    lon: null
                });
                renderPersonInputs(); // Desktop
                initMobileGroupMeet(); // Mobile
            }
        };
        mobileAddBtn.disabled = groupLocations.length >= 6;
    }

    // Category chips
    mobileCategoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            mobileCategoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            document.getElementById('mobile-venue-category').value = chip.dataset.category;
            // Sync desktop
            document.getElementById('venue-category').value = chip.dataset.category;
        });
    });

    // Find meeting spot button
    if (mobileFindMeetingBtn) {
        mobileFindMeetingBtn.onclick = findMeetingSpot;
    }
}

// Call initMobileBottomSheet on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMobileBottomSheet, 100);
});

// ========================================
// Group Meet Panel Functionality
// ========================================

// Group Meet State
let groupLocations = [
    { id: 1, name: '', lat: null, lon: null },
    { id: 2, name: '', lat: null, lon: null }
];
let nextPersonId = 3;
let groupMarkers = [];
let groupRouteLines = [];
let meetingPointMarker = null;
let selectedVenue = null;

function initGroupMeetPanel() {
    const addPersonBtn = document.getElementById('add-person-btn');
    const findMeetingBtn = document.getElementById('find-meeting-btn');

    // Add person button
    if (addPersonBtn) {
        addPersonBtn.addEventListener('click', () => {
            if (groupLocations.length < 6) {
                groupLocations.push({
                    id: nextPersonId++,
                    name: '',
                    lat: null,
                    lon: null
                });
                renderPersonInputs();
                updateAddButtonState();
            }
        });
    }

    // Find meeting spot button
    if (findMeetingBtn) {
        findMeetingBtn.addEventListener('click', findMeetingSpot);
    }

    // Initial render of person inputs
    renderPersonInputs();
}

function renderPersonInputs() {
    const container = document.getElementById('group-locations-list');
    if (!container) return;

    container.innerHTML = '';

    groupLocations.forEach((person, index) => {
        const row = document.createElement('div');
        row.className = 'person-input-row';
        row.innerHTML = `
            <span class="person-color-dot person-color-${index + 1}" style="background-color: ${PERSON_COLORS[index]}"></span>
            <span class="person-label">Person ${index + 1}</span>
            <input 
                type="text" 
                class="person-input" 
                placeholder="Enter location..."
                value="${person.name}"
                data-person-id="${person.id}"
                autocomplete="off"
            >
            <button class="remove-person-btn ${groupLocations.length <= 2 ? 'disabled' : ''}" data-person-id="${person.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
            </button>
        `;

        container.appendChild(row);

        // Setup autocomplete for person input
        const input = row.querySelector('.person-input');
        setupPersonAutocomplete(input, person.id);

        // Remove person handler
        const removeBtn = row.querySelector('.remove-person-btn');
        if (removeBtn && groupLocations.length > 2) {
            removeBtn.addEventListener('click', () => {
                groupLocations = groupLocations.filter(p => p.id !== person.id);
                renderPersonInputs();
                updateAddButtonState();
            });
        }
    });

    updateAddButtonState();
}

function setupPersonAutocomplete(input, personId) {
    let debounceTimer;

    input.addEventListener('input', function () {
        const query = this.value;
        const personIndex = groupLocations.findIndex(p => p.id === personId);

        if (personIndex !== -1) {
            groupLocations[personIndex].name = query;
            groupLocations[personIndex].lat = null;
            groupLocations[personIndex].lon = null;
        }

        clearTimeout(debounceTimer);

        // Remove existing dropdown
        const existingList = input.parentNode.querySelector('.group-autocomplete-items');
        if (existingList) existingList.remove();

        if (!query || query.length < 2) return;

        debounceTimer = setTimeout(async () => {
            try {
                const suggestions = await fetchGroupSuggestions(query);
                showGroupSuggestions(suggestions, input, personId);
            } catch (error) {
                console.error('Autocomplete error:', error);
            }
        }, 300);
    });

    // Close dropdown on blur
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const list = input.parentNode.querySelector('.group-autocomplete-items');
            if (list) list.remove();
        }, 200);
    });
}

async function fetchGroupSuggestions(query) {
    try {
        const TOMTOM_API_KEY = 'sdzQqXJ0hQKanaHi0jmyNwqcuBokTRwY';
        const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?` +
            `key=${TOMTOM_API_KEY}` +
            `&limit=5` +
            `&countrySet=IN` +
            `&lat=12.9716` +
            `&lon=77.5946` +
            `&radius=50000`;

        const response = await fetch(url);
        const data = await response.json();

        return (data.results || []).map(result => ({
            display_name: result.address?.freeformAddress || result.poi?.name || 'Unknown',
            lat: result.position.lat,
            lon: result.position.lon
        }));
    } catch (error) {
        console.error('TomTom search error:', error);
        return [];
    }
}

function showGroupSuggestions(suggestions, inputElement, personId) {
    // Remove existing dropdown
    const existingList = inputElement.parentNode.querySelector('.group-autocomplete-items');
    if (existingList) existingList.remove();

    if (suggestions.length === 0) return;

    const list = document.createElement('div');
    list.className = 'group-autocomplete-items autocomplete-items';
    list.style.cssText = 'position: absolute; top: 100%; left: 0; right: 0; z-index: 3000; background: rgba(20,20,30,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto;';

    suggestions.forEach(item => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); color: #fff; font-size: 0.85rem;';
        div.innerHTML = `<strong>${item.display_name.split(',')[0]}</strong><br><small style="color: rgba(255,255,255,0.5)">${item.display_name}</small>`;

        div.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur
            inputElement.value = item.display_name.split(',')[0];

            const personIndex = groupLocations.findIndex(p => p.id === personId);
            if (personIndex !== -1) {
                groupLocations[personIndex].name = item.display_name.split(',')[0];
                groupLocations[personIndex].lat = item.lat;
                groupLocations[personIndex].lon = item.lon;
            }

            list.remove();
        });

        div.addEventListener('mouseenter', () => {
            div.style.background = 'rgba(99,102,241,0.2)';
        });
        div.addEventListener('mouseleave', () => {
            div.style.background = 'transparent';
        });

        list.appendChild(div);
    });

    inputElement.parentNode.style.position = 'relative';
    inputElement.parentNode.appendChild(list);
}

function updateAddButtonState() {
    const addBtn = document.getElementById('add-person-btn');
    if (addBtn) {
        addBtn.disabled = groupLocations.length >= 6;
    }
}

async function findMeetingSpot() {
    const findBtn = document.getElementById('find-meeting-btn');
    const resultsContainer = document.getElementById('meeting-results');
    const venueList = document.getElementById('venue-list');
    const category = document.getElementById('venue-category')?.value || 'cafe';

    // Validate locations
    const validLocations = groupLocations.filter(p => p.lat && p.lon);
    if (validLocations.length < 2) {
        alert('Please enter at least 2 valid locations');
        return;
    }

    // Show loading state
    if (findBtn) {
        findBtn.classList.add('loading');
        findBtn.disabled = true;
    }

    try {
        // Geocode any locations that don't have coordinates
        for (let i = 0; i < groupLocations.length; i++) {
            const person = groupLocations[i];
            if (person.name && !person.lat) {
                const result = await geocodeLocationMeeting(person.name);
                if (result) {
                    person.lat = result.lat;
                    person.lon = result.lon;
                }
            }
        }

        const locationsWithCoords = groupLocations.filter(p => p.lat && p.lon);
        if (locationsWithCoords.length < 2) {
            alert('Could not find coordinates for some locations. Please try different addresses.');
            return;
        }

        // Calculate centroid
        const centroid = calculateCentroid(locationsWithCoords.map(p => ({
            lat: p.lat,
            lon: p.lon
        })));

        // Search for venues
        const venues = await searchVenues(centroid, category, locationsWithCoords.map(p => ({
            lat: p.lat,
            lon: p.lon
        })));

        if (venues.length === 0) {
            if (venueList) venueList.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center;">No venues found. Try a different category.</p>';
            if (resultsContainer) resultsContainer.classList.remove('hidden');
            return;
        }

        // Display venues
        renderVenueList(venues, locationsWithCoords);
        if (resultsContainer) resultsContainer.classList.remove('hidden');

        // Show markers and routes on map
        await showGroupOnMap(locationsWithCoords, venues[0]);

    } catch (error) {
        console.error('Error finding meeting spot:', error);
        alert('An error occurred. Please try again.');
    } finally {
        if (findBtn) {
            findBtn.classList.remove('loading');
            findBtn.disabled = false;
        }
    }
}

function renderVenueList(venues, userLocations) {
    const venueList = document.getElementById('venue-list');
    if (!venueList) return;

    venueList.innerHTML = '';

    venues.forEach((venue, index) => {
        const card = document.createElement('div');
        card.className = `venue-card ${index === 0 ? 'selected' : ''}`;
        card.innerHTML = `
            <div class="venue-card-header">
                <h4 class="venue-name">${venue.name}</h4>
                <span class="venue-score">⭐ ${venue.scores.total}</span>
            </div>
            <p class="venue-address">${venue.address}</p>
            <div class="venue-stats">
                <span class="venue-stat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Fairness: ${venue.scores.fairness}%
                </span>
                <span class="venue-stat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    Proximity: ${venue.scores.proximity}%
                </span>
            </div>
        `;

        card.addEventListener('click', async () => {
            // Update selection
            venueList.querySelectorAll('.venue-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedVenue = venue;

            // Update map
            await showGroupOnMap(userLocations, venue);
        });

        venueList.appendChild(card);
    });
}

async function showGroupOnMap(userLocations, venue) {
    if (!map) return;

    // Clear previous group markers and routes
    clearGroupFromMap();

    // Add user markers
    userLocations.forEach((person, index) => {
        const el = document.createElement('div');
        el.className = 'group-user-marker';
        el.style.backgroundColor = PERSON_COLORS[index];
        el.textContent = index + 1;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([person.lon, person.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setText(`Person ${index + 1}: ${groupLocations[index]?.name || 'Unknown'}`))
            .addTo(map);

        groupMarkers.push(marker);
    });

    // Add meeting point marker with professional SVG icon
    const meetingEl = document.createElement('div');
    meetingEl.className = 'meeting-point-marker';
    meetingEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
        </svg>
    `;

    meetingPointMarker = new maplibregl.Marker({ element: meetingEl, anchor: 'center' })
        .setLngLat([venue.lon, venue.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px;">
                <strong style="color: #6366f1;">${venue.name}</strong><br>
                <small>Score: ${venue.scores.total}/100</small>
            </div>
        `))
        .addTo(map);

    // Draw routes from each user to meeting point
    for (let i = 0; i < userLocations.length; i++) {
        const person = userLocations[i];
        try {
            const route = await calculateRoute(
                { lat: person.lat, lon: person.lon },
                { lat: venue.lat, lon: venue.lon }
            );

            if (route && route.coordinates) {
                const sourceId = `group-route-${i}`;
                const layerId = `group-route-line-${i}`;

                // Add route source and layer
                if (map.getSource(sourceId)) {
                    map.getSource(sourceId).setData({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: route.coordinates
                        }
                    });
                } else {
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: route.coordinates
                            }
                        }
                    });

                    map.addLayer({
                        id: layerId,
                        type: 'line',
                        source: sourceId,
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': PERSON_COLORS[i],
                            'line-width': 4,
                            'line-opacity': 0.8,
                            'line-dasharray': [2, 1]
                        }
                    });
                }

                groupRouteLines.push({ sourceId, layerId });
            }
        } catch (error) {
            console.error(`Error calculating route for person ${i + 1}:`, error);
        }
    }

    // Fit map to show all markers
    const bounds = new maplibregl.LngLatBounds();
    userLocations.forEach(p => bounds.extend([p.lon, p.lat]));
    bounds.extend([venue.lon, venue.lat]);

    map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 100, right: 420 },
        duration: 1500
    });
}

function clearGroupFromMap() {
    // Remove user markers
    groupMarkers.forEach(marker => marker.remove());
    groupMarkers = [];

    // Remove meeting point marker
    if (meetingPointMarker) {
        meetingPointMarker.remove();
        meetingPointMarker = null;
    }

    // Remove route layers and sources
    groupRouteLines.forEach(({ sourceId, layerId }) => {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    });
    groupRouteLines = [];
}

