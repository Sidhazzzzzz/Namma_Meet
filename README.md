# 🤝 Namma Meet

A modern web application for finding optimal meeting spots in Bengaluru. Whether you're meeting a friend or coordinating a group meetup, Namma Meet helps you find the perfect central location.

## ✨ Features

### 🧭 Safe Route Mode
- Find safe routes between two locations
- Get up to 3 alternative routes with safety scores
- View nearby facilities (hospitals, police stations, petrol pumps)
- Weather-adjusted travel time estimates

### 👥 Group Meet Mode
- Add multiple participant locations
- Find the optimal meeting point (geographic centroid)
- Choose venue categories: ☕ Café, 🍽️ Restaurant, 🛍️ Mall
- Get ranked venue suggestions with routes for everyone

### 🚌 Public Transit
- **Metro Stations**: View all Namma Metro stations on the map
- **Bus Routes**: Access BMTC bus stop information

### 🛡️ Safety Features
- Accident hotspot visualization
- Safety facility markers (hospitals, police stations)
- Route safety scoring

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **Vite** | Build tool & dev server |
| **MapLibre GL JS** | Interactive map rendering |
| **TomTom API** | Geocoding & routing |
| **OSRM** | Alternative routing engine |
| **Cloudflare Functions** | Secure API proxy |
| **Vanilla JS** | Zero-framework approach |

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Sidhazzzzzz/Namma_Meet.git
cd Namma_Meet

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
Namma_Meet/
├── index.html              # Main entry point
├── app.js                  # Core application logic
├── src/
│   ├── style.css           # Base styles
│   ├── premium-ui.css      # Premium UI components
│   ├── group-meet.css      # Group meet specific styles
│   └── services/
│       ├── routeService.js      # Routing logic
│       ├── meetingService.js    # Group meeting calculations
│       ├── geocodingService.js  # Location search
│       ├── safetyService.js     # Safety scoring
│       ├── facilityData.js      # Facility markers
│       └── accidentData.js      # Accident hotspots
├── functions/api/          # Cloudflare Functions
├── data/                   # Metro station data
└── public/data/            # BMTC bus route data
```

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```env
TOMTOM_API_KEY=your_tomtom_api_key
```

## 🌐 Deployment

This project is configured for **Cloudflare Pages** deployment:

1. Connect your GitHub repository to Cloudflare Pages
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add `TOMTOM_API_KEY` in environment variables

## 📸 Screenshots

*Coming soon*

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


**Made with ❤️ in Bengaluru**
