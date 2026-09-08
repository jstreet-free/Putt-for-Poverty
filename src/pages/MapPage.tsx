import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { User, Flag, MapPin, RefreshCw } from 'lucide-react';
import { Participant } from '../types';

// Custom pin icons as inline SVG so we don't need to configure Leaflet's default
// marker image assets (a common Vite/bundler pain point with the stock png icons).
function createPinIcon(isLive: boolean) {
  const color = isLive ? '#10b981' : '#334155'; // emerald-500 for live GPS, slate-700 for registered city
  return L.divIcon({
    className: '',
    html: `
      <div style="position: relative; width: 32px; height: 42px;">
        <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="${color}"/>
          <circle cx="16" cy="16" r="6" fill="white"/>
        </svg>
        ${isLive ? '<div style="position:absolute; top:6px; left:6px; width:20px; height:20px; border-radius:50%; background:#10b981; opacity:0.45;"></div>' : ''}
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

// Session cache so we never geocode the same city label twice
const geocodeCache = new Map<string, { lat: number; lng: number }>();

async function geocodeLabel(label: string): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(label)) return geocodeCache.get(label)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`
    );
    const data = await res.json();
    if (data && data[0]) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(label, coords);
      return coords;
    }
  } catch (error) {
    console.warn(`Geocoding failed for "${label}":`, error);
  }
  return null;
}

export function MapPage() {
  const [rawParticipants, setRawParticipants] = useState<Participant[]>([]);
  const [mappedParticipants, setMappedParticipants] = useState<Participant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);

  // Fetch participants
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'participants'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Participant[];
      setTotalCount(data.length);
      setRawParticipants(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'participants');
    });
    return () => unsubscribe();
  }, []);

  // Geocode participants who only have a city label and no coordinates yet
  useEffect(() => {
    const alreadyGeocoded = rawParticipants.filter(p =>
      (typeof p.currentLocation?.lat === 'number' && typeof p.currentLocation?.lng === 'number') ||
      (typeof p.location?.lat === 'number' && typeof p.location?.lng === 'number')
    );
    setMappedParticipants(alreadyGeocoded);

    const unGeocoded = rawParticipants.filter(p =>
      !p.currentLocation && p.location?.label &&
      (typeof p.location?.lat !== 'number' || typeof p.location?.lng !== 'number')
    );

    if (unGeocoded.length === 0) return;

    let active = true;
    const run = async () => {
      setGeocodingInProgress(true);
      const newlyGeocoded: Participant[] = [];

      for (const p of unGeocoded) {
        if (!active) break;
        if (!p.location?.label) continue;

        // Nominatim's usage policy caps public requests at ~1/sec — stay comfortably under that
        await new Promise(resolve => setTimeout(resolve, 1000));

        const coords = await geocodeLabel(p.location.label);
        if (coords) {
          newlyGeocoded.push({
            ...p,
            location: { ...coords, label: p.location.label }
          });
        }
      }

      if (active && newlyGeocoded.length > 0) {
        setMappedParticipants(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          return [...prev, ...newlyGeocoded.filter(p => !existingIds.has(p.id))];
        });
      }
      setGeocodingInProgress(false);
    };

    run();
    return () => { active = false; };
  }, [rawParticipants]);

  const resolvePosition = (p: Participant) => {
    if (p.currentLocation && typeof p.currentLocation.lat === 'number' && typeof p.currentLocation.lng === 'number') {
      return { ...p.currentLocation, isLive: true };
    }
    if (typeof p.location?.lat === 'number' && typeof p.location?.lng === 'number') {
      return { ...p.location, isLive: false };
    }
    return null;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-12">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">GLOBAL <span className="text-emerald-600">REACH</span></h1>
        <p className="text-slate-500 font-medium text-lg">See where our charitable golfers are right now — live from across the world.</p>
      </div>

      <div className="h-[600px] rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative bg-slate-100">
        <MapContainer
          center={[30, 0]}
          zoom={2.5}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappedParticipants.map(p => {
            const pos = resolvePosition(p);
            if (!pos) return null;
            return (
              <Marker key={p.id} position={[pos.lat, pos.lng]} icon={createPinIcon(!!pos.isLive)}>
                <Popup minWidth={200}>
                  <div className="p-1 space-y-3 font-sans">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <User size={20} />
                      </div>
                      <div>
                        <div className="font-black text-slate-800">{p.name}</div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{pos.label || p.location?.label}</div>
                      </div>
                    </div>
                    {pos.isLive && (
                      <>
                        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 uppercase tracking-widest w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live GPS
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Updated {formatLastUpdated((p.currentLocation as any)?.updatedAt)}
                        </div>
                      </>
                    )}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase">
                        <Flag size={12} />
                        Home Club
                      </div>
                      <div className="font-bold text-slate-700">{p.golfClub}</div>
                    </div>
                    {p.score && (
                      <div className="flex items-center justify-between bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                        <span className="text-xs font-black text-emerald-700 uppercase">Live Points</span>
                        <span className="text-lg font-black text-emerald-900">{p.score}</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {mappedParticipants.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px] pointer-events-none z-[1000]">
            <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-sm space-y-3 pointer-events-auto">
              <MapPin size={40} className="mx-auto text-emerald-500" />
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                {totalCount > 0 ? 'Loading Coordinates...' : 'No Active Pins'}
              </h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                {totalCount > 0
                  ? `We have ${totalCount} registered players! Live GPS pins appear as players open the app during the tournament.`
                  : 'Be the first to put yourself on the map! Register and update your profile location to see your pin here.'}
              </p>
              {geocodingInProgress && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
                  <RefreshCw size={14} className="animate-spin" />
                  Geocoding in progress...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-emerald-900 rounded-3xl p-8 text-white grid grid-cols-1 md:grid-cols-4 gap-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full blur-3xl -mr-32 -mt-32 opacity-50" />
        <div className="text-center space-y-1 relative z-10">
          <div className="text-4xl font-black">{totalCount}</div>
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Registered Golfers</div>
        </div>
        <div className="text-center space-y-1 relative z-10">
          <div className="text-4xl font-black">{mappedParticipants.length}</div>
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Map Pins</div>
        </div>
        <div className="text-center space-y-1 relative z-10">
          <div className="text-4xl font-black">2.4k</div>
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Miles Driven</div>
        </div>
        <div className="text-center space-y-1 relative z-10">
          <div className="text-4xl font-black">£20.2k</div>
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Raised Globally</div>
        </div>
      </div>
    </div>
  );
}

function formatLastUpdated(updatedAt?: string): string {
  if (!updatedAt) return 'just now';
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}