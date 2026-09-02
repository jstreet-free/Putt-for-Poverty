import { useState, useEffect } from 'react';
import { Map, Marker, InfoWindow, useApiIsLoaded, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Trophy, User, Flag, MapPin, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { Participant } from '../types';

export function MapPage() {
  const [rawParticipants, setRawParticipants] = useState<Participant[]>([]);
  const [mappedParticipants, setMappedParticipants] = useState<Participant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const [authError, setAuthError] = useState(false);
  const isApiLoaded = useApiIsLoaded();
  const geocodingLib = useMapsLibrary('geocoding');

  // Listen to google maps auth failure
  useEffect(() => {
    const originalGmAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      console.error("Google Maps API authentication failed.");
      setAuthError(true);
      if (originalGmAuthFailure) originalGmAuthFailure();
    };
    return () => {
      (window as any).gm_authFailure = originalGmAuthFailure;
    };
  }, []);

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

  // On-the-fly client-side geocoding fallback for participants with labels but no coordinates
  useEffect(() => {
    // 1. Start with participants who already have complete lat/lng coordinates
    //    (either live GPS via currentLocation or registered city via location)
    const alreadyGeocoded = rawParticipants.filter(p =>
      (typeof p.currentLocation?.lat === 'number' && typeof p.currentLocation?.lng === 'number') ||
      (typeof p.location?.lat === 'number' && typeof p.location?.lng === 'number')
    );
    setMappedParticipants(alreadyGeocoded);

    // 2. If the geocoding library is not ready or they are already on the map, don't do anything
    if (!geocodingLib || rawParticipants.length === 0) return;

    // 3. Find participants that have some city/location label but NO actual coordinates
    const unGeocoded = rawParticipants.filter(p => !p.currentLocation && p.location?.label && (typeof p.location?.lat !== 'number' || typeof p.location?.lng !== 'number'));

    if (unGeocoded.length === 0) return;

    let active = true;
    const processGeocoding = async () => {
      setGeocodingInProgress(true);
      const geocoder = new geocodingLib.Geocoder();
      const newlyGeocoded: Participant[] = [];

      for (const p of unGeocoded) {
        if (!active) break;
        if (!p.location?.label) continue;

        try {
          // Delay to stay safe from rapid geocode hits and quotas
          await new Promise(resolve => setTimeout(resolve, 300));

          const response = await new Promise<google.maps.GeocoderResponse>((resolve, reject) => {
            geocoder.geocode({ address: p.location!.label }, (results, status) => {
              if (status === 'OK' && results) resolve({ results });
              else reject(new Error(status));
            });
          });

          if (response.results && response.results[0]) {
            const loc = response.results[0].geometry.location;
            newlyGeocoded.push({
              ...p,
              location: {
                lat: loc.lat(),
                lng: loc.lng(),
                label: p.location.label
              }
            });
          }
        } catch (error) {
          console.warn(`Dynamic geocoding failed for ${p.name}:`, error);
        }
      }

      if (active && newlyGeocoded.length > 0) {
        setMappedParticipants(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const filteredNew = newlyGeocoded.filter(p => !existingIds.has(p.id));
          return [...prev, ...filteredNew];
        });
      }
      setGeocodingInProgress(false);
    };

    processGeocoding();

    return () => {
      active = false;
    };
  }, [rawParticipants, geocodingLib]);

  // Resolve a participant's map position: real-time GPS when available, else registered city
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

       {authError && (
         <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-3xl text-rose-800 space-y-4 max-w-3xl mx-auto shadow-sm">
           <div className="flex gap-3 items-start">
             <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center shrink-0">
               <XCircle size={22} className="stroke-[2.5]" />
             </div>
             <div className="space-y-1">
               <h3 className="font-extrabold text-lg uppercase tracking-tight">Google Maps error: ApiTargetBlockedMapError</h3>
               <p className="text-sm font-semibold leading-relaxed">
                 Your Google Maps API key is loaded, but the **Maps JavaScript API** is blocked or deactivated in your Google Cloud Project.
               </p>
             </div>
           </div>
           
           <div className="bg-white/60 p-5 rounded-2xl border border-rose-100/50 space-y-3 font-medium text-xs leading-relaxed text-slate-700">
             <div className="font-black text-rose-700 uppercase tracking-widest text-[10px]">How to resolve this in 2 minutes:</div>
             <ol className="list-decimal pl-4 space-y-2">
               <li>Go to the <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-bold">Google Cloud APIs & Library Console</a>.</li>
               <li>Ensure you have selected the correct project in the top project selector.</li>
               <li>Search for and click **"Maps JavaScript API"**, then click the blue **"Enable"** button.</li>
               <li>Search for and click **"Geocoding API"** and click **"Enable"**.</li>
               <li>Search for and click **"Places API"** (or Places API (New)) and click **"Enable"**.</li>
               <li>No app rebuild is required! Once enabled, refresh this page and the map will render perfectly.</li>
             </ol>
           </div>
         </div>
       )}

       <div className="h-[600px] rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative bg-slate-100">
          {isApiLoaded ? (
            <Map
              defaultCenter={{ lat: 30, lng: 0 }}
              defaultZoom={2.5}
              style={{ width: '100%', height: '100%' }}
              gestureHandling="greedy"
              disableDefaultUI={false}
            >
              <MapContent 
                participants={mappedParticipants} 
                selectedId={selectedId} 
                setSelectedId={setSelectedId} 
                resolvePosition={resolvePosition}
              />
            </Map>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-50">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Loading Maps...</p>
              </div>
            </div>
          )}

          {mappedParticipants.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px] pointer-events-none">
              <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-sm space-y-3 pointer-events-auto">
                <MapPin size={40} className="mx-auto text-emerald-500" />
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                  {totalCount > 0 ? 'Loading Coordinates...' : 'No Active Pins'}
                </h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  {totalCount > 0 
                    ? `We have ${totalCount} registered players! Live GPS pins appear as players open the app during the tournament.`
                    : 'Be the first to put yourself on the map! Register and update your profile location to see your pin here.'
                  }
                </p>
                {geocodingInProgress && (
                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
                    <RefreshCw size={14} className="animate-spin" />
                    Geocoding in progress...
                  </div>
                )}
                {totalCount > 0 && !geocodingInProgress && (
                  <div className="pt-2">
                    <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100 inline-flex flex-col gap-1 items-center">
                      <span className="uppercase">Geocoding APIs Blocked?</span>
                      <span className="font-medium text-[9px] text-slate-500 lowercase">Maps services may be deactivated on this API Key.</span>
                    </div>
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

function MapContent({ participants, selectedId, setSelectedId, resolvePosition }: any) {
  const map = useMap();
  
  if (!map) return null;

  return (
    <>
      {participants.map((p: any) => {
        const pos = resolvePosition(p);
        if (!pos) return null;
        return (
          <ParticipantMarker 
            key={p.id} 
            participant={p} 
            position={pos}
            isSelected={selectedId === p.id}
            onSelect={() => setSelectedId(p.id)}
            onClose={() => setSelectedId(null)}
          />
        );
      })}
    </>
  );
}

function ParticipantMarker({ participant, position, isSelected, onSelect, onClose }: any) {
  const isLive = !!position.isLive;
  return (
    <>
      <Marker
        position={{ lat: position.lat, lng: position.lng }}
        onClick={onSelect}
      />
      {isSelected && (
        <InfoWindow position={{ lat: position.lat, lng: position.lng }} onCloseClick={onClose} minWidth={200}>
          <div className="p-2 space-y-3 font-sans">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                 <User size={20} />
               </div>
               <div>
                  <div className="font-black text-slate-800">{participant.name}</div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{position.label || participant.location?.label}</div>
               </div>
            </div>
            {isLive && <>
              <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 uppercase tracking-widest w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live GPS
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Updated {formatLastUpdated(position.updatedAt)}
              </div>
            </>}
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
               <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase">
                  <Flag size={12} />
                  Home Club
               </div>
               <div className="font-bold text-slate-700">{participant.golfClub}</div>
            </div>
            {participant.score && (
              <div className="flex items-center justify-between bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                 <span className="text-xs font-black text-emerald-700 uppercase">Live Points</span>
                 <span className="text-lg font-black text-emerald-900">{participant.score}</span>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function formatLastUpdated(updatedAt: string): string {
  if (!updatedAt) return 'just now';
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}
