import { ClubDetection } from '../../hooks/useClubDetection';
import { buildParTable, DetectedCourse, formatDistance, SEARCH_RADIUS_M } from '../../lib/clubLocator';
import { sumPars } from '../../lib/lobbyScoring';
import { CheckCircle, Loader2, LocateFixed, MapPin } from 'lucide-react';

const MAX_SHOWN = 5;

// "Find my club": looks up the courses where the player is standing and lets
// them pick one, whose par then fills the editor next to it. The parent owns
// the detection (so it can also auto-run it) and decides what a pick does.
export function ClubPicker({ detection, holes, selectedId, onPick }: {
  detection: ClubDetection;
  holes: 9 | 18;
  selectedId: string | null;
  onPick: (course: DetectedCourse) => void;
}) {
  const { status, courses, error, detect } = detection;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={detect}
        disabled={status === 'working'}
        className="w-full flex items-center justify-center gap-2 bg-white border-2 border-emerald-200 text-emerald-700 p-2.5 rounded-xl font-black text-xs uppercase hover:bg-emerald-50 transition-colors disabled:opacity-60"
      >
        {status === 'working' ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
        {status === 'working' ? 'Finding your club...' : status === 'idle' ? 'Find my club from my location' : 'Search again'}
      </button>

      {status === 'error' && error && <p className="text-xs font-bold text-rose-600">{error} You can still set the par by hand.</p>}

      {status === 'done' && courses.length === 0 && (
        <p className="text-xs font-bold text-slate-500">
          No golf course found within {formatDistance(SEARCH_RADIUS_M)} of you. Set the par by hand below.
        </p>
      )}

      {status === 'done' && courses.length > 0 && (
        <div className="space-y-1.5">
          {courses.slice(0, MAX_SHOWN).map((course) => {
            const { pars, fromMap } = buildParTable(course.holePars, holes, []);
            const selected = course.id === selectedId;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => onPick(course)}
                className={`w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-xl border-2 transition-colors ${
                  selected ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-100 hover:border-emerald-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-black text-slate-800 text-sm truncate flex items-center gap-1.5">
                    <MapPin size={12} className="text-emerald-500 shrink-0" />
                    {course.name}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    {course.inside ? "You're here" : `${formatDistance(course.distanceM)} away`}
                    {' · '}
                    {fromMap === 0
                      ? 'no par on the map yet'
                      : fromMap === holes ? `par ${sumPars(pars)}` : `par for ${fromMap} of ${holes} holes`}
                  </div>
                </div>
                {selected && <CheckCircle size={16} className="text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// What the editor should say after a course was picked, so a partly mapped
// course doesn't look complete.
export function mapCoverageNote(fromMap: number, holes: number): string {
  if (fromMap === holes) return `All ${holes} holes filled from the course map.`;
  if (fromMap === 0) return "The map doesn't have this course's par yet. Set each hole below.";
  return `${fromMap} of ${holes} holes filled from the course map. Check the rest.`;
}
