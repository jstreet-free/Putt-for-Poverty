import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { writeLobbyLocation } from '../lib/lobbyService';

const MIN_UPDATE_INTERVAL_MS = 15_000;
const MIN_MOVEMENT_METERS = 10;

interface GeoPoint {
  lat: number;
  lng: number;
}

// Trims GPS noise (a stationary phone can jitter a few metres between
// readings) without meaningfully reducing precision — this is shared with a
// live lobby's own members, not broadcast publicly, so there's no privacy
// reason to round further than that.
function roundForSharing(value: number): number {
  return Math.round(value * 100000) / 100000;
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

// Shares the signed-in player's position with their one active lobby, but
// only while it is actually live and they are a charged member (a spectator
// never shares or needs to — firestore.rules would reject the write anyway).
export function useRealtimeLocation(user: User | null) {
  const [tracking, setTracking] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const [lobbyStatus, setLobbyStatus] = useState<string | null>(null);
  const [isChargedMember, setIsChargedMember] = useState(false);
  const lastWriteRef = useRef(0);
  const lastPositionRef = useRef<GeoPoint | null>(null);

  // Layer 1: find the user's one active (scheduled/live) lobby by watching
  // their membership index — this is small and changes rarely.
  useEffect(() => {
    if (!user) {
      setActiveLobbyId(null);
      return;
    }

    const unsub = onSnapshot(collection(db, 'users', user.uid, 'lobbyMemberships'), async (snap) => {
      for (const membership of snap.docs) {
        try {
          const lobbySnap = await getDoc(doc(db, 'lobbies', membership.id));
          const status = lobbySnap.data()?.status;
          if (status === 'scheduled' || status === 'live') {
            setActiveLobbyId(membership.id);
            return;
          }
        } catch {
          // ignore — try the next membership entry
        }
      }
      setActiveLobbyId(null);
    }, () => setActiveLobbyId(null));

    return () => unsub();
  }, [user]);

  // Layer 2: watch that lobby's status so tracking starts/stops the instant
  // the host presses Start or Finish.
  useEffect(() => {
    if (!activeLobbyId) {
      setLobbyStatus(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'lobbies', activeLobbyId), (snap) => {
      setLobbyStatus(snap.exists() ? snap.data().status : null);
    }, () => setLobbyStatus(null));
    return () => unsub();
  }, [activeLobbyId]);

  // Layer 3: watch the user's own member doc for chargeStatus — a spectator
  // (no credit when the host started) never shares location.
  useEffect(() => {
    if (!user || !activeLobbyId) {
      setIsChargedMember(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'lobbies', activeLobbyId, 'members', user.uid), (snap) => {
      setIsChargedMember(snap.data()?.chargeStatus === 'charged');
    }, () => setIsChargedMember(false));
    return () => unsub();
  }, [user, activeLobbyId]);

  const shouldTrack = !!user && !!activeLobbyId && lobbyStatus === 'live' && isChargedMember;

  useEffect(() => {
    if (!shouldTrack) {
      setTracking(false);
      lastPositionRef.current = null;
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

      writeLobbyLocation(
        activeLobbyId as string,
        (user as User).uid,
        roundForSharing(position.coords.latitude),
        roundForSharing(position.coords.longitude)
      ).catch((error) => {
        console.warn(`Could not share location with lobby ${activeLobbyId}:`, error);
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('Geolocation error:', error.message);
      if (error.code === error.PERMISSION_DENIED) setPermissionDenied(true);
      setTracking(false);
    };

    const watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 30_000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [shouldTrack, activeLobbyId, user]);

  return { tracking, permissionDenied };
}
