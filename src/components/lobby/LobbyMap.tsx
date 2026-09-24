import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LobbyLocation, LobbyMember } from '../../types';
import { subscribeToLobbyLocations } from '../../lib/lobbyService';
import { createAvatarIcon, formatLastUpdated, PlayerPin } from '../../lib/mapIcons';
import { Navigation } from 'lucide-react';

function MapFocus({ pins }: { pins: PlayerPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])).pad(0.3));
  }, [pins, map]);
  return null;
}

export function LobbyMap({ lobbyId, members, currentUserId }: {
  lobbyId: string;
  members: LobbyMember[];
  currentUserId: string;
}) {
  const [locations, setLocations] = useState<LobbyLocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToLobbyLocations(
      lobbyId,
      setLocations,
      () => setError('Could not load live positions.')
    );
    return () => unsub();
  }, [lobbyId]);

  const pins = useMemo<PlayerPin[]>(() => {
    return locations.map((loc) => {
      const member = members.find(m => m.id === loc.userId);
      return {
        id: loc.userId,
        name: member?.name || 'Player',
        avatarUrl: member?.avatarUrl,
        golfClub: member?.golfClub,
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: typeof loc.updatedAt?.toDate === 'function' ? loc.updatedAt.toDate().toISOString() : loc.updatedAt,
        isSelf: loc.userId === currentUserId,
      };
    });
  }, [locations, members, currentUserId]);

  if (error) {
    return <div className="text-sm font-bold text-rose-600 p-4 bg-rose-50 rounded-2xl">{error}</div>;
  }

  return (
    <div className="h-72 rounded-2xl overflow-hidden border-2 border-slate-100 relative bg-slate-900">
      <MapContainer center={[30, 0]} zoom={2.5} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.length > 0 && <MapFocus pins={pins} />}
        {pins.map(pin => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={createAvatarIcon(pin)}>
            <Popup minWidth={160}>
              <div className="p-1 space-y-1 font-sans">
                <div className="font-black text-slate-800">{pin.isSelf ? 'You' : pin.name}</div>
                {pin.updatedAt && (
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Updated {formatLastUpdated(pin.updatedAt)}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {pins.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-white text-sm font-bold gap-2">
          <Navigation size={16} className="animate-pulse" />
          Waiting for players to share their position...
        </div>
      )}
    </div>
  );
}
