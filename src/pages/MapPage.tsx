import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lock, Radio, Clock, Users, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { Lobby, LobbyLocation, LobbyMember } from '../types';
import { getMyLobbies, subscribeToLobbyLocations } from '../lib/lobbyService';
import { createAvatarIcon, formatLastUpdated, PlayerPin } from '../lib/mapIcons';

// Keeps the viewport on the pins as they load / move.
function MapFocus({ pins }: { pins: PlayerPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 13, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])).pad(0.3));
  }, [pins, map]);
  return null;
}

export function MapPage({ user }: { user: FirebaseUser | null }) {
  const [myLobbies, setMyLobbies] = useState<Lobby[]>([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(true);
  const [lobbiesError, setLobbiesError] = useState<string | null>(null);
  const [ownPosition, setOwnPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [locationsByLobby, setLocationsByLobby] = useState<Record<string, LobbyLocation[]>>({});
  const [membersByLobby, setMembersByLobby] = useState<Record<string, LobbyMember[]>>({});

  useEffect(() => {
    if (!user) {
      setMyLobbies([]);
      setLobbiesLoading(false);
      setLobbiesError(null);
      return;
    }
    let active = true;
    setLobbiesLoading(true);
    getMyLobbies(user.uid)
      .then((lobbies) => {
        if (!active) return;
        setMyLobbies(lobbies);
        setLobbiesError(null);
      })
      .catch((err) => {
        console.error('Could not load your lobbies:', err);
        if (active) setLobbiesError('We could not load your lobbies just now.');
      })
      .finally(() => { if (active) setLobbiesLoading(false); });
    return () => { active = false; };
  }, [user]);

  const liveLobbies = useMemo(() => myLobbies.filter(l => l.status === 'live'), [myLobbies]);
  const liveLobbyIds = useMemo(() => liveLobbies.map(l => l.id).join(','), [liveLobbies]);

  // Own position comes straight from the device, so it is available before an
  // event starts — when nothing is being shared with (or by) anyone yet.
  useEffect(() => {
    if (!user || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoDenied(false);
        setOwnPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user]);

  // Live co-player positions + the roster needed to label them.
  useEffect(() => {
    if (liveLobbies.length === 0) {
      setLocationsByLobby({});
      setMembersByLobby({});
      return;
    }

    const unsubs = liveLobbies.map(lobby =>
      subscribeToLobbyLocations(
        lobby.id,
        (locations) => setLocationsByLobby(prev => ({ ...prev, [lobby.id]: locations })),
        (err) => console.warn(`Could not read locations for lobby ${lobby.id}:`, err)
      )
    );

    let active = true;
    Promise.all(liveLobbies.map(async (lobby) => {
      const snap = await getDocs(collection(db, 'lobbies', lobby.id, 'members'));
      return [lobby.id, snap.docs.map(d => ({ id: d.id, ...d.data() } as LobbyMember))] as const;
    }))
      .then((entries) => { if (active) setMembersByLobby(Object.fromEntries(entries)); })
      .catch((err) => console.warn('Could not load lobby rosters:', err));

    return () => {
      active = false;
      unsubs.forEach(unsub => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLobbyIds]);

  const isInAnyLobby = myLobbies.some(l => l.status === 'scheduled' || l.status === 'live');
  const isEventLive = liveLobbies.length > 0;

  const pins = useMemo<PlayerPin[]>(() => {
    if (!user) return [];

    const byUser = new Map<string, PlayerPin>();

    if (isEventLive) {
      for (const lobby of liveLobbies) {
        const roster = membersByLobby[lobby.id] || [];
        for (const location of locationsByLobby[lobby.id] || []) {
          const member = roster.find(m => m.id === location.userId);
          byUser.set(location.userId, {
            id: location.userId,
            name: member?.name || 'Player',
            avatarUrl: member?.avatarUrl || undefined,
            golfClub: member?.golfClub,
            lat: location.lat,
            lng: location.lng,
            updatedAt: typeof (location.updatedAt as any)?.toDate === 'function'
              ? (location.updatedAt as any).toDate().toISOString()
              : location.updatedAt,
            isSelf: location.userId === user.uid,
          });
        }
      }
    }

    // Always prefer the device's own reading for yourself — it is fresher than
    // the shared copy, and it exists pre-event too (before anything's shared).
    if (ownPosition) {
      const ownMember = Object.values(membersByLobby)
        .flat()
        .find(m => m.id === user.uid);
      byUser.set(user.uid, {
        id: user.uid,
        name: 'You',
        avatarUrl: ownMember?.avatarUrl || undefined,
        lat: ownPosition.lat,
        lng: ownPosition.lng,
        isSelf: true,
      });
    }

    return Array.from(byUser.values());
  }, [user, isEventLive, liveLobbies, locationsByLobby, membersByLobby, ownPosition]);

  const otherPlayerCount = pins.filter(p => !p.isSelf).length;
  const showPins = isInAnyLobby && pins.length > 0;
  const dimMap = !isInAnyLobby;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-12">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">PLAYER <span className="text-emerald-600">MAP</span></h1>
        <p className="text-slate-500 font-medium text-lg">
          {isEventLive
            ? 'Your lobby is live — here is where everyone is playing right now.'
            : 'Live positions are shared inside your lobby while its event is running.'}
        </p>
      </div>

      <div className="h-[600px] rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative bg-slate-900">
        <div className={dimMap ? 'w-full h-full [&_.leaflet-tile-pane]:brightness-[0.35] [&_.leaflet-tile-pane]:grayscale' : 'w-full h-full'}>
          <MapContainer
            center={[30, 0]}
            zoom={2.5}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom={!dimMap}
            dragging={!dimMap}
            zoomControl={!dimMap}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {showPins && <MapFocus pins={pins} />}
            {showPins && pins.map(pin => (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={createAvatarIcon(pin)}>
                <Popup minWidth={180}>
                  <div className="p-1 space-y-2 font-sans">
                    <div className="font-black text-slate-800">{pin.isSelf ? 'You' : pin.name}</div>
                    {pin.golfClub && (
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{pin.golfClub}</div>
                    )}
                    {pin.updatedAt && !pin.isSelf && (
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Updated {formatLastUpdated(pin.updatedAt)}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Not in a lobby — nothing to show at all. */}
        {!lobbiesLoading && !isInAnyLobby && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-900/70 backdrop-blur-[2px] p-6">
            <div className="text-center max-w-sm space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto text-white">
                <Lock size={28} />
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                {lobbiesError || 'You need to join a lobby to see other players locations'}
              </h3>
              <p className="text-slate-300 font-medium text-sm">
                Positions are only shared between members of the same lobby, while its event is running.
              </p>
              <Link
                to="/lobbies"
                className="inline-flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-emerald-400 transition-colors"
              >
                <Users size={16} />
                BROWSE LOBBIES
              </Link>
            </div>
          </div>
        )}

        {/* Live badge */}
        {isEventLive && (
          <div className="absolute top-5 left-5 z-[1000] flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg">
            <Radio size={14} className="animate-pulse" />
            Event Live
          </div>
        )}
      </div>

      {/* In a lobby, waiting for the event to start. */}
      {isInAnyLobby && !isEventLive && (
        <div className="bg-amber-50 border-2 border-amber-100 rounded-3xl p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div className="space-y-1">
            <p className="font-black text-amber-900">
              Other player position is going to be shown during an event
            </p>
            <p className="text-sm text-amber-700 font-medium">
              {geoDenied
                ? 'Allow location access in your browser to see your own pin here.'
                : ownPosition
                  ? 'Right now the map only shows your own position.'
                  : 'Finding your position...'}
            </p>
          </div>
        </div>
      )}

      {isEventLive && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard icon={Users} label="Players Sharing" value={String(otherPlayerCount + (ownPosition ? 1 : 0))} tone="emerald" />
          <StatCard icon={Radio} label="Live Lobbies" value={String(liveLobbies.length)} tone="blue" />
          <StatCard icon={Navigation} label="Your Position" value={ownPosition ? 'Sharing' : geoDenied ? 'Blocked' : 'Locating'} tone="amber" />
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: string; tone: 'emerald' | 'blue' | 'amber';
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-black text-slate-900">{value}</div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
      </div>
    </div>
  );
}
