import React, { useState, useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface PlaceAutocompleteProps {
  onPlaceSelect: (place: { lat: number; lng: number; label: string } | null) => void;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export const PlaceAutocomplete = ({ 
  onPlaceSelect, 
  onChange,
  onBlur,
  value,
  defaultValue = '', 
  placeholder = 'Search for a city...', 
  className = '' 
}: PlaceAutocompleteProps) => {
  const [placeAutocomplete, setPlaceAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  const [internalValue, setInternalValue] = useState(defaultValue);

  // Sync internal value with external value if provided
  const displayValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (defaultValue && value === undefined) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, value]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const options = {
      fields: ['geometry', 'name', 'formatted_address'],
    };

    const autocomplete = new places.Autocomplete(inputRef.current, options);
    setPlaceAutocomplete(autocomplete);
  }, [places]);

  useEffect(() => {
    if (!placeAutocomplete) return;

    const listener = placeAutocomplete.addListener('place_changed', () => {
      const place = placeAutocomplete.getPlace();
      if (place.geometry?.location) {
        const result = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          label: place.formatted_address || place.name || ''
        };
        if (value === undefined) setInternalValue(result.label);
        onPlaceSelect(result);
        if (onChange) onChange(result.label);
      } else {
        onPlaceSelect(null);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [onPlaceSelect, placeAutocomplete, value, onChange]);

  return (
    <div className="relative group w-full">
      <MapPin className="absolute left-4 top-4 text-emerald-500 z-10" size={20} />
      <input 
        ref={inputRef}
        value={displayValue}
        onChange={(e) => {
          const val = e.target.value;
          if (value === undefined) setInternalValue(val);
          if (onChange) onChange(val);
          if (!val) onPlaceSelect(null);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
      />
      {!places && (
        <div className="absolute right-4 top-4">
          <Loader2 className="animate-spin text-slate-300" size={16} />
        </div>
      )}
    </div>
  );
};
