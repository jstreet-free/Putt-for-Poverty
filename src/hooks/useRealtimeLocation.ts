import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Lobby } from '../types';
import { getMyLobbies, isLobbyLive, writeLobbyLocation } from '../lib/lobbyService';

const MIN_UPDATE_INTERVAL_MS = 60_000;
const MIN_MOVEMENT_METERS = 100;
const LOBBY_REFRESH_MS = 5 * 60_000;

interface GeoPoint {
  lat: number;
  lng: number;
}

// Positions are rounded to ~1.1km before being shared with the rest of the
// lobby — close enough to see who is out playing where, without broadcasting
// anyone's exact real-time position.
function roundForSharing(value: number): number {
  return Math.round(value * 100) / 100;
}

function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Shares the signed-in player's position with every lobby of theirs whose
// event is currently running. Outside an event window nothing is written —
// the matching firestore.rules condition rejects it anyway.
export function useRealtimeLocation(user: User | null) {
  const [tracking, setTracking] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [liveLobbies, setLiveLobbies] = useState<Lobby[]>([]);
  const lastWriteRef = useRef(0);
  const lastPositionRef = useRef<GeoPoint | null>(null);
  const liveLobbiesRef = useRef<Lobby[]>([]);

  liveLobbiesRef.current = liveLobbies;

  useEffect(() => {
    if (!user) {
      setLiveLobbies([]);
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const lobbies = await getMyLobbies(user.uid);
        if (!active) return;
        setLiveLobbies(lobbies.filter(l => isLobbyLive(l)));
      } catch (error) {
        console.warn('Could not load lobbies for location sharing:', error);
      }
    };

    refresh();
    const interval = setInterval(refresh, LOBBY_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  // Keyed on the ids rather than the array so a refresh that finds the same
  // lobbies doesn't tear down and restart the GPS watcher.
  const liveLobbyIds = liveLobbies.map(l => l.id).sort().join(',');

  useEffect(() => {
    if (!user || !liveLobbyIds) {
      setTracking(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation API not available in this browser.');
      return;
    }

    const shouldWrite = (position: GeolocationPosition): boolean => {
      const now = Date.now();
      if (now - lastWriteRef.current < MIN_UPDATE_INTERVAL_MS) return false;
      if (!lastPositionRef.current) return true;
      const moved = haversineDistance(lastPositionRef.current, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      return moved >= MIN_MOVEMENT_METERS;
    };

    const handlePosition = (position: GeolocationPosition) => {
      setTracking(true);
      setPermissionDenied(false);
      if (!shouldWrite(position)) return;

      lastWriteRef.current = Date.now();
      lastPositionRef.current = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const lat = roundForSharing(position.coords.latitude);
      const lng = roundForSharing(position.coords.longitude);

      for (const lobby of liveLobbiesRef.current) {
        writeLobbyLocation(lobby.id, user.uid, lat, lng).catch((error) => {
          console.warn(`Could not share location with lobby ${lobby.id}:`, error);
        });
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('Geolocation error:', error.message);
      if (error.code === error.PERMISSION_DENIED) setPermissionDenied(true);
      setTracking(false);
    };

    const watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 30_000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, liveLobbyIds]);

  return { tracking, permissionDenied, liveLobbies };
}
