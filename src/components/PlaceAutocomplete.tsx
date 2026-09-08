import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface PlaceAutocompleteProps {
  onPlaceSelect: (place: { lat: number; lng: number; label: string } | null) => void;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  lat: number;
  lng: number;
  label: string;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const displayValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (defaultValue && value === undefined) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, value]);

  // Close the dropdown when the user clicks anywhere outside this component
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    // Debounce so we send at most ~1 request per 400ms of typing pause,
    // staying well under Nominatim's public usage policy limits.
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        setSuggestions(
          (data || []).map((d: any) => ({
            lat: parseFloat(d.lat),
            lng: parseFloat(d.lon),
            label: d.display_name,
          }))
        );
        setShowDropdown(true);
      } catch (error) {
        console.warn('Place search failed:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  const handleSelect = (s: Suggestion) => {
    if (value === undefined) setInternalValue(s.label);
    onPlaceSelect(s);
    if (onChange) onChange(s.label);
    setShowDropdown(false);
    setSuggestions([]);
  };

  return (
    <div className="relative group w-full" ref={containerRef}>
      <MapPin className="absolute left-4 top-4 text-emerald-500 z-10" size={20} />
      <input
        ref={inputRef}
        value={displayValue}
        onChange={(e) => {
          const val = e.target.value;
          if (value === undefined) setInternalValue(val);
          if (onChange) onChange(val);
          if (!val) {
            onPlaceSelect(null);
            setSuggestions([]);
            setShowDropdown(false);
            return;
          }
          fetchSuggestions(val);
        }}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {isSearching && (
        <div className="absolute right-4 top-4">
          <Loader2 className="animate-spin text-slate-300" size={16} />
        </div>
      )}
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focus so the click registers before onBlur fires
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-slate-50 last:border-0"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};