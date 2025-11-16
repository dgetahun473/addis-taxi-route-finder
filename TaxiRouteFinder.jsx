import React, { useState, useEffect, useMemo, useCallback } from 'react';
// The following import assumes Tailwind CSS is configured in the environment.

// --- 0. GEMINI API CONFIGURATION & HELPERS ---
const apiKey = ""; 
// Using the specified model for grounded text generation
const apiUrlText = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
// Using the specified model for Text-to-Speech
const apiUrlTTS = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

// Helper functions for TTS (PCM to WAV conversion)
const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate) => {
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    let offset = 0;

    // RIFF chunk descriptor
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + pcmData.byteLength, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;

    // fmt sub-chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;      // Sub-chunk size
    view.setUint16(offset, 1, true); offset += 2;       // Audio format (1 for PCM)
    view.setUint16(offset, 1, true); offset += 2;       // Number of channels (1 for mono)
    view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
    view.setUint32(offset, sampleRate * 2, true); offset += 4; // Byte rate
    view.setUint16(offset, 2, true); offset += 2;       // Block align
    view.setUint16(offset, 16, true); offset += 2;      // Bits per sample

    // data sub-chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, pcmData.byteLength, true); offset += 4;

    // Write PCM data
    const pcmBytes = new Uint8Array(buffer, 44);
    pcmBytes.set(new Uint8Array(pcmData.buffer));

    return new Blob([buffer], { type: 'audio/wav' });
};

// Generic fetch with retry logic
const fetchGemini = async (url, payload, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 429 && i < maxRetries - 1) {
                    const delay = Math.pow(2, i) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
                throw new Error(`API call failed with status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Gemini API fetch error:", error);
            if (i === maxRetries - 1) throw error;
        }
    }
};

// --- 1. DATA STRUCTURES (Expanded) ---
const ADDIS_CENTER = { lat: 9.0305, lng: 38.7486 }; 

const STATIONS_DATA = [
    { id: 'piazza', am: 'ፒያሳ', en: 'Piazza', coords: { lat: 9.0375, lng: 38.7495 } },
    { id: 'arba_kilo', am: 'አራት ኪሎ', en: 'Arat Kilo', coords: { lat: 9.0360, lng: 38.7610 } },
    { id: 'megnagna', am: 'መገናኛ', en: 'Megnagna', coords: { lat: 9.0200, lng: 38.7980 } },
    { id: 'bole', am: 'ቦሌ', en: 'Bole', coords: { lat: 9.0067, lng: 38.7845 } },
    { id: 'kazanchis', am: 'ካዛንቺስ', en: 'Kazanchis', coords: { lat: 9.0205, lng: 38.7660 } },
    { id: 'ayer_tena', am: 'አየር ጤና', en: 'Ayer Tena', coords: { lat: 8.9800, lng: 38.7200 } },
    { id: 'mexico', am: 'ሜክሲኮ', en: 'Mexico', coords: { lat: 9.0040, lng: 38.7450 } },
    { id: 'gofa', am: 'ጎፋ', en: 'Gofa', coords: { lat: 8.9500, lng: 38.7400 } },
    { id: 'kirkos', am: 'ቂርቆስ', en: 'Kirkos', coords: { lat: 9.0080, lng: 38.7610 } },
    { id: 'simrock', am: 'ሲምሮክ', en: 'Simrock', coords: { lat: 8.9850, lng: 38.8050 } },
    { id: 'summit', am: 'ሰሚት', en: 'Summit', coords: { lat: 9.0600, lng: 38.8300 } },
    { id: 'gerji', am: 'ገርጂ', en: 'Gerji', coords: { lat: 9.0150, lng: 38.8200 } },
    { id: '22_mazoria', am: '22 ማዞሪያ', en: '22 Mazoria', coords: { lat: 9.0450, lng: 38.8000 } },
    { id: 'lebu', am: 'ለቡ', en: 'Lebu', coords: { lat: 8.9500, lng: 38.7700 } },
    { id: 'stadium', am: 'ስታዲየም', en: 'Stadium', coords: { lat: 9.0100, lng: 38.7550 } },
    { id: 'asco', am: 'አስኮ', en: 'Asco', coords: { lat: 9.0250, lng: 38.6900 } },
    { id: 'saris', am: 'ሳሪስ', en: 'Saris', coords: { lat: 8.9400, lng: 38.7900 } },
    { id: 'gotera', am: 'ጎተራ', en: 'Gotera', coords: { lat: 8.9880, lng: 38.7650 } },
    { id: 'michele', am: 'ሚካኤል', en: 'Michel', coords: { lat: 9.0550, lng: 38.7800 } },
    { id: 'lideta', am: 'ልደታ', en: 'Lideta', coords: { lat: 9.0200, lng: 38.7300 } },
    { id: 'cmc', am: 'ሲኤምሲ', en: 'CMC', coords: { lat: 9.0550, lng: 38.8250 } },
    { id: 'shiro_meda', am: 'ሽሮ ሜዳ', en: 'Shiro Meda', coords: { lat: 9.0500, lng: 38.7500 } },
    { id: 'kaliti', am: 'ቃሊቲ', en: 'Kaliti', coords: { lat: 8.9150, lng: 38.7950 } },
    { id: 'adey_abeba', am: 'አደይ አበባ', en: 'Adey Abeba', coords: { lat: 8.9950, lng: 38.7250 } },
    { id: 'balcha', am: 'ባልቻ', en: 'Balcha', coords: { lat: 9.0150, lng: 38.7400 } },
    { id: 'lafto', am: 'ላፍቶ', en: 'Lafto', coords: { lat: 8.9700, lng: 38.7400 } },
];

const stationMap = STATIONS_DATA.reduce((acc, s) => {
    acc[s.id] = { am: s.am, en: s.en, coords: s.coords };
    return acc;
}, {});

const allStationIds = STATIONS_DATA.map(s => s.id).sort();

const ADDIS_TAXI_ROUTES = [
    { id: 1, name_am: "ፒያሳ - አየር ጤና", name_en: "Piazza - Ayer Tena", stations: ['piazza', 'arba_kilo', 'megnagna', 'bole', 'kazanchis', 'ayer_tena'] },
    { id: 2, name_am: "ሜክሲኮ - ሰሚት", name_en: "Mexico - Summit", stations: ['mexico', 'gofa', 'kirkos', 'simrock', 'kazanchis', 'summit'] },
    { id: 3, name_am: "ገርጂ - ለቡ", name_en: "Gerji - Lebu", stations: ['gerji', '22_mazoria', 'kazanchis', 'ayer_tena', 'lebu'] },
    { id: 4, name_am: "ቂርቆስ - አራት ኪሎ", name_en: "Kirkos - Arat Kilo", stations: ['kirkos', 'megnagna', 'arba_kilo', 'stadium'] },
    { id: 5, name_am: "ቦሌ - ስታዲየም", name_en: "Bole - Stadium", stations: ['bole', 'megnagna', 'stadium'] },
    { id: 6, name_am: "ቃሊቲ - ስታዲየም", name_en: "Kaliti - Stadium", stations: ['kaliti', 'saris', 'gotera', 'stadium', 'mexico'] },
    { id: 7, name_am: "ልደታ - ሽሮ ሜዳ", name_en: "Lideta - Shiro Meda", stations: ['lideta', 'mexico', 'balcha', 'piazza', 'shiro_meda', 'arba_kilo'] },
    { id: 8, name_am: "አስኮ - አየር ጤና", name_en: "Asco - Ayer Tena", stations: ['asco', 'adey_abeba', 'lafto', 'ayer_tena', 'lebu'] },
    { id: 9, name_am: "ሲኤምሲ - ሚካኤል", name_en: "CMC - Michel", stations: ['cmc', 'summit', '22_mazoria', 'megnagna', 'michele'] },
    { id: 10, name_am: "ካዛንቺስ - ጎፋ", name_en: "Kazanchis - Gofa", stations: ['kazanchis', 'kirkos', 'gotera', 'gofa', 'lebu'] },
    { id: 11, name_am: "ቦሌ - ሳሪስ", name_en: "Bole - Saris", stations: ['bole', 'simrock', 'saris', 'kaliti'] },
];

const INTERCHANGE_STATION_IDS = [
    'kazanchis', 'ayer_tena', 'megnagna', 'arba_kilo', 'bole', 'mexico', 'stadium', 
    'gotera', 'piazza', 'summit', 'lebu', 'saris'
];

// --- 2. LOCALIZATION (Translations) ---
const translations = {
  en: {
    title: "Addis Taxi Route Finder",
    subtitle: "Find the shortest minibus taxi path across the city.",
    mapHeader: "Live Location & Stations Map (Simulated)",
    startLabel: "Departure Station (From)",
    endLabel: "Destination Station (To)",
    selectStart: "Select starting station",
    selectEnd: "Select destination station",
    searchButton: "Find Route",
    resultsTitle: "Journey Results",
    directRoute: "Direct Route",
    transferRoute: "One Transfer Required",
    stops: "Stops",
    route: "Route",
    transferStation: "Transfer Station",
    firstTrip: "1st Trip:",
    secondTrip: "2nd Trip:",
    noRouteFound: "No direct or single-transfer route found.",
    placeholderText: "Select start and end points and search for a route.",
    languageToggle: "አማርኛ",
    errorTitle: "Oops! An Issue Occurred",
    errorInstruction: "Please ensure your selection is valid.",
    fareGuideButton: "✨ Fare Guide",
    fareGuideTitle: "Taxi Fare Advice",
    phraseGeneratorButton: "✨ Amharic Phrases",
    phraseGeneratorTitle: "Essential Amharic for the Trip",
    phrasePlay: "Play",
    phraseLoading: "Loading Audio...",
    fareLoading: "Calculating Fair Price...",
    // New Features
    advisoryButton: "✨ Route Advisory",
    advisoryTitle: "Current Route Status",
    advisoryLoading: "Checking traffic and road conditions...",
    alternativeButton: "✨ Alternative Transport",
    alternativeTitle: "Mode Comparison",
    alternativeLoading: "Analyzing alternative modes...",
    
  },
  am: {
    title: "ታክሲ ተራ መፈለጊያ",
    subtitle: "የአዲስ አበባን የጉዞ መስመር በቀላሉ ያግኙ",
    mapHeader: "የቀጥታ ቦታ እና የታክሲ ተራዎች ካርታ (የተገመተ)",
    startLabel: "መነሻ (ከየት)",
    endLabel: "መድረሻ (ወዴት)",
    selectStart: "የመነሻ ተራ ይምረጡ",
    selectEnd: "የመድረሻ ተራ ይምረጡ",
    searchButton: "መስመር ፈልግ",
    resultsTitle: "የጉዞ ውጤቶች",
    directRoute: "ቀጥተኛ መስመር",
    transferRoute: "አንድ ጊዜ ቀይር",
    stops: "መቆሚያዎች",
    route: "መስመር",
    transferStation: "መለወጫ ተራ",
    firstTrip: "1ኛ ጉዞ:",
    secondTrip: "2ኛ ጉዞ:",
    noRouteFound: "ቀጥተኛ ወይም አንድ ጊዜ መቀየር የሚቻልበት መንገድ አልተገኘም።",
    placeholderText: "መነሻና መድረሻ ይምረጡና መስመር ይፈልጉ።",
    languageToggle: "English",
    errorTitle: "አይ! ችግር ተፈጥሯል",
    errorInstruction: "የመረጧቸው ተራዎች ትክክል መሆናቸውን ያረጋግጡ።",
    fareGuideButton: "✨ የታሪፍ መመሪያ",
    fareGuideTitle: "የታክሲ ዋጋ ምክር",
    phraseGeneratorButton: "✨ የአማርኛ ቃላት",
    phraseGeneratorTitle: "ለጉዞ የሚያስፈልጉ የአማርኛ ቃላት",
    phrasePlay: "አጫውት",
    phraseLoading: "ድምጽ በመጫን ላይ...",
    fareLoading: "ትክክለኛ ዋጋ በመስራት ላይ...",
    // New Features
    advisoryButton: "✨ የመንገድ ምክር",
    advisoryTitle: "የመንገድ ሁኔታ",
    advisoryLoading: "ትራፊክ እና የመንገድ ሁኔታዎችን በመፈተሽ ላይ...",
    alternativeButton: "✨ አማራጭ ትራንስፖርት",
    alternativeTitle: "የጉዞ አይነቶች ንፅፅር",
    alternativeLoading: "አማራጭ የመጓጓዣ መንገዶችን በመተንተን ላይ...",
  },
};

// --- 3. ICON & UI HELPER COMPONENTS (Inline SVGs) ---

const Icon = ({ name, className = 'w-5 h-5' }) => {
  const getSvg = () => {
    switch (name) {
      case 'MapPin':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>;
      case 'Search':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
      case 'CornerRightDown':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15 15 20 20 15"/><path d="M4 4v7a4 4 0 0 0 4 4h7"/></svg>;
      case 'CornerRightUp':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 9 15 4 20 9"/><path d="M4 20v-7a4 4 0 0 1 4-4h7"/></svg>;
      case 'ArrowRight':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;
      case 'RefreshCw':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 13.5a9 9 0 1 1-2.12-9.9m2.26.13c-.4-.4-1.02-.38-1.42.02"/></svg>;
      case 'LocateFixed':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10 10 10 0 0 0-10-10 10 10 0 0 0-10 10"/><path d="M14 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0"/><path d="M12 2v2"/><path d="M22 12h-2"/><path d="M12 22v-2"/><path d="M4 12H2"/></svg>;
      case 'DollarSign':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
      case 'MessageSquare':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
      case 'Volume2':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M17.08 9.29c.84.85 1.32 1.94 1.32 3.1 0 1.16-.48 2.25-1.32 3.1"/></svg>;
      case 'Sparkle':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-3.9 8.2-8.2 3.9 8.2 3.9 3.9 8.2 3.9-8.2 8.2-3.9-8.2-3.9z"/></svg>;
      case 'AlertTriangle':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12" y1="17" y2="17"/></svg>;
      case 'TrendingUp':
        return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 7 22 17 7 16 7 22 7 22 13"/></svg>;
      default:
        return null;
    }
  };
  return <span className={className}>{getSvg()}</span>;
};


// --- 4. PATHFINDING LOGIC ---

const findRoute = (startId, endId, lang) => {
    if (!startId || !endId) return null;

    const results = [];
    const langKey = lang === 'am' ? 'am' : 'en';

    const getName = (id) => stationMap[id] ? stationMap[id][langKey] : id;
    const getRouteName = (route, key) => key === 'am' ? route.name_am : route.name_en;

    // Step 1: Direct Route Search
    for (const route of ADDIS_TAXI_ROUTES) {
        const stations = route.stations;
        const startIndex = stations.indexOf(startId);
        const endIndex = stations.indexOf(endId);

        if (startIndex !== -1 && endIndex !== -1) {
            const startIdx = Math.min(startIndex, endIndex);
            const endIdx = Math.max(startIndex, endIndex);

            // Capture the stops in the correct direction
            let stops = stations.slice(startIdx, endIdx + 1);
            if (startIndex > endIndex) {
                stops = stops.reverse();
            }
            stops = stops.map(id => getName(id));

            results.push({
                type: 'direct',
                route_name: getRouteName(route, langKey),
                stops: stops,
            });
        }
    }

    if (results.length > 0) return results;

    // Step 2: One-transfer Route Search
    for (const interchangeId of INTERCHANGE_STATION_IDS) {
        if (interchangeId === startId || interchangeId === endId) continue;

        const routesFromStart = ADDIS_TAXI_ROUTES.filter(route =>
            route.stations.includes(startId) && route.stations.includes(interchangeId)
        );

        const routesToEnd = ADDIS_TAXI_ROUTES.filter(route =>
            route.stations.includes(interchangeId) && route.stations.includes(endId)
        );

        // Optimization: Only grab the first valid combination for simplicity
        if (routesFromStart.length > 0 && routesToEnd.length > 0 && results.length < 3) {
            results.push({
                type: 'transfer',
                transfer_station: getName(interchangeId),
                path1: {
                    route_name: getRouteName(routesFromStart[0], langKey),
                    from: getName(startId),
                    to: getName(interchangeId),
                },
                path2: {
                    route_name: getRouteName(routesToEnd[0], langKey),
                    from: getName(interchangeId),
                    to: getName(endId),
                },
            });
        }
    }

    return results.length > 0 ? results : [{ type: 'not_found' }];
};

// --- 5. GOOGLE MAPS SETUP (External Function for Callback) ---
// This function must be globally accessible for the Google Maps script to call it.
let mapInstance = null;
let userMovementInterval = null;
let stationMarkers = [];

window.initMap = (stationNameKey = 'en') => {
    if (typeof window.google === 'undefined') {
        console.error("Google Maps API not loaded.");
        return;
    }

    const mapDiv = document.getElementById("map");
    if (!mapDiv) return;

    // Initialize Map
    mapInstance = new window.google.maps.Map(mapDiv, {
        zoom: 13,
        center: ADDIS_CENTER, 
        disableDefaultUI: true,
        styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] } // Hide points of interest
        ]
    });

    // Clear previous markers and interval
    stationMarkers.forEach(m => m.setMap(null));
    stationMarkers = [];
    if (userMovementInterval) clearInterval(userMovementInterval);

    // 1. Add static markers for all taxi stations
    STATIONS_DATA.forEach(station => {
        const marker = new window.google.maps.Marker({
            position: station.coords,
            map: mapInstance,
            title: station[stationNameKey],
            icon: {
                url: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="%2310B981" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 1 0 5z"/></svg>',
                scaledSize: new window.google.maps.Size(30, 30),
                anchor: new window.google.maps.Point(15, 30)
            }
        });
        stationMarkers.push(marker);
    });

    // 2. Initialize and simulate User Marker
    let simulatedPosition = { ...ADDIS_CENTER }; 
    const userMarker = new window.google.maps.Marker({
        map: mapInstance,
        position: simulatedPosition, 
        icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#3B82F6', 
            fillOpacity: 1,
            strokeColor: '#FFFFFF', 
            strokeWeight: 2,
            scale: 8,
        },
        title: "Your Location (Simulated)",
    });

    // Function to simulate subtle, random movement
    const simulateMovement = () => {
        simulatedPosition.lat += (Math.random() - 0.5) * 0.00005;
        simulatedPosition.lng += (Math.random() - 0.5) * 0.00005;
        userMarker.setP
