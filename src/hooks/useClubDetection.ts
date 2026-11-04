import { useCallback, useEffect, useRef, useState } from 'react';
import { ClubLookupError, DetectedCourse, detectNearbyCourses } from '../lib/clubLocator';

export type ClubDetection = ReturnType<typeof useClubDetection>;

// Finds the golf courses at/near the player's current location on demand.
// `courses` is best match first; empty after a search means nothing nearby.
export function useClubDetection() {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [courses, setCourses] = useState<DetectedCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const detect = useCallback(async () => {
    setStatus('working');
    setError(null);
    try {
      const found = await detectNearbyCourses();
      if (!mounted.current) return;
      setCourses(found);
      setStatus('done');
    } catch (err) {
      if (!mounted.current) return;
      setCourses([]);
      setError(err instanceof ClubLookupError ? err.message : "Couldn't find your club just now.");
      setStatus('error');
    }
  }, []);

  return { status, courses, error, detect };
}
