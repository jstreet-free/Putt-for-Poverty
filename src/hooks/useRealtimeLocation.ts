import { useEffect, useRef, useState } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

const MIN_UPDATE_INTERVAL_MS = 60_000;
const MIN_MOVEMENT_METERS = 100;

interface GeoPoint {
  lat: number;
  lng: number;
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

export function useRealtimeLocation(user: User | null) {
  const [tracking, setTracking] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastWriteRef = useRef(0);
  const lastPositionRef = useRef<GeoPoint | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation API not available in this browser.');
      return;
    }

    const participantRef = doc(db, 'participants', user.uid);

    const writePosition = async (position: GeolocationPosition) => {
      try {
        await setDoc(
          participantRef,
          {
            currentLocation: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              label: 'Live GPS',
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `participants/${user.uid}`);
      }
    };

    const shouldWrite = (position: GeolocationPosition): boolean => {
      const now = Date.now();
      const intervalOk = now - lastWriteRef.current >= MIN_UPDATE_INTERVAL_MS;

      if (!lastPositionRef.current) return true;

      const moved = haversineDistance(lastPositionRef.current, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });

      return intervalOk && moved >= MIN_MOVEMENT_METERS;
    };

    const handlePosition = (position: GeolocationPosition) => {
      setTracking(true);
      setPermissionDenied(false);

      if (shouldWrite(position)) {
        lastWriteRef.current = Date.now();
        lastPositionRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        writePosition(position);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('Geolocation error:', error.message);
      if (error.code === error.PERMISSION_DENIED) {
        setPermissionDenied(true);
      }
      setTracking(false);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 30_000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [user]);

  return { tracking, permissionDenied };
}
