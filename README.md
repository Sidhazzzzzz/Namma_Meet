# 🤝 Namma Meet

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![MapLibre](https://img.shields.io/badge/MapLibre-212121?style=for-the-badge&logo=maplibre&logoColor=white)](https://maplibre.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**Find your perfect meeting spot in Bengaluru—safely and efficiently.**

Namma Meet is a modern, mobile-responsive web application designed for the residents of Bengaluru. It solves the everyday struggle of finding a central meeting point for groups while prioritizing safety, public transit accessibility, and real-time weather conditions.

---

## 🌟 Why Namma Meet?

In a city as sprawling as Bengaluru, coordinating a meetup can be a logistical headache. Namma Meet takes the guesswork out of planning by calculating the optimal "fair" meeting spot and suggesting routes that aren't just fast, but **safe**.

### 🧠 Meeting Intelligence
- **Group Centroid Calculation**: Automatically finds the geographic center between multiple participants.
- **Smart Recommendations**: Suggests top-rated Cafes, Restaurants, Parks, and Malls near the meeting point.
- **Fairness First**: Minimizes travel time for all participants, ensuring no one has to cross the entire city alone.

### 🛡️ Safety-First Navigation
- **Safety Scoring**: Every route is analyzed against accident hotspot data and neighborhood safety levels.
- **Secure Facilities**: One-click overlays for Hospitals, Police Stations, and Petrol Pumps along your route.
- **SOS Integration**: A dedicated floating SOS button for high-priority alerts.

### 🚇 Pulse of the City
- **Public Transit Native**: Built-in support for Namma Metro stations and BMTC bus networks.
- **Real-time Weather**: Live weather updates at your start and end points to help you decide between an auto or the metro.
- **Premium UI**: A sleek, glassmorphic design that feels at home on both desktop and mobile.

---

## 🛠️ Technology Behind the Scenes

We believe in high performance with minimal bloat.

| Tech | Role |
| :--- | :--- |
| **Vanilla JS** | Core logic for a lightning-fast, zero-framework footprint. |
| **Vite** | Modern build tooling and optimized asset loading. |
| **MapLibre GL JS** | High-performance, vector-tile based map rendering. |
| **TomTom & OSRM** | Dual-engine routing and geocoding for maximum accuracy. |
| **Cloudflare Functions** | Secure API handling and serverless performance. |

---

## 🚀 Speed Run (Local Setup)

Get the project running on your machine in under two minutes.

### 1. Clone & Enter
```bash
git clone https://github.com/Sidhazzzzzz/Namma_Meet.git
cd Namma_Meet
```

### 2. Dependencies
```bash
npm install
```

### 3. Environment Config
Create a `.env` file in the root:
```env
TOMTOM_API_KEY=your_actual_key_here
```

### 4. Ignite
```bash
npm run dev
```
Visit `http://localhost:5173` and start exploring!

---

## 📁 Inside the Engine

```text
Namma_Meet/
├── app.js                  # The brain: Main application controller
├── src/
│   ├── premium-ui.css      # Custom glassmorphic design system
│   └── services/           # Decoupled business logic
│       ├── safetyService.js # Route analysis & scoring
│       └── meetingService.js # Centroid & venue calculations
├── functions/api/          # Serverless API proxies (Cloudflare)
├── data/                   # Transit & accident datasets
└── public/                 # Static assets & icons
```

---

## 🤝 Join the Journey

Bengaluru's traffic and safety needs constant attention. If you have ideas for better routing algorithms, more data on accident hotspots, or just want to polish the UI, we'd love your help!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**Made with ❤️ in Bengaluru**
*"Because meeting people shouldn't be a chore."*

