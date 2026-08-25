import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { loadStripe } from '@stripe/stripe-js';
import { UserCircle, MapPin, Trophy, CreditCard, CheckCircle, Flag, Loader2, XCircle, ShieldCheck, Upload, FileCheck, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { PlaceAutocomplete } from '../components/PlaceAutocomplete';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) 
  : null;

export function Register({ user, participant }: { user: any, participant: any }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isPaying, setIsPaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [geocodingStatus, setGeocodingStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');

  const [membershipFile, setMembershipFile] = useState<File | null>(null);
  const [isUploadingMembership, setIsUploadingMembership] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const [formData, setFormData] = useState({
    name: user?.displayName || '',
    golfClub: '',
    course: '',
    handicap: 18,
    locationLabel: '',
  });
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    const loadDraftProfile = async () => {
      if (!user || participant) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setFormData({
            name: d.name || user.displayName || '',
            golfClub: d.golfClub || '',
            course: d.course || '',
            handicap: d.handicap ?? 18,
            locationLabel: d.location?.label || '',
          });
          if (d.location?.lat && d.location?.lng) {
            setCoords({ lat: d.location.lat, lng: d.location.lng });
            setGeocodingStatus('found');
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    };
    loadDraftProfile();
  }, [user]);

  useEffect(() => {
    const checkPayment = async () => {
      const sessionId = searchParams.get('session_id');
      if (searchParams.get('success') === 'true' && sessionId && !isVerifying) {
        setIsVerifying(true);
        try {
          const res = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          if (res.ok) {
            alert('Round purchased successfully!');
            navigate('/register', { replace: true });
          }
        } catch (e) {
          console.error('Verification failed', e);
        } finally {
          setIsVerifying(false);
        }
      }
    };
    checkPayment();
  }, [searchParams]);

  useEffect(() => {
    if (participant) {
      setFormData({
        name: participant.name,
        golfClub: participant.golfClub,
        course: participant.course || '',
        handicap: participant.handicap,
        locationLabel: participant.location?.label || '',
      });
      if (participant.location?.lat && participant.location?.lng) {
        setCoords({ lat: participant.location.lat, lng: participant.location.lng });
        setGeocodingStatus('found');
      }
    }
  }, [participant]);

  const geocodingLib = useMapsLibrary('geocoding');

  const handlePlaceSelect = (place: { lat: number; lng: number; label: string } | null) => {
    if (place) {
      setCoords({ lat: place.lat, lng: place.lng });
      setFormData(prev => ({ ...prev, locationLabel: place.label }));
      setGeocodingStatus('found');
    } else {
      setCoords(null);
    }
  };

  const geocodeFallback = async () => {
    if (!geocodingLib || !formData.locationLabel || coords) {
      console.log('Skipping geocode fallback:', { lib: !!geocodingLib, label: !!formData.locationLabel, hasCoords: !!coords });
      return;
    }
    
    setGeocodingStatus('searching');
    console.log('Starting geocode fallback for:', formData.locationLabel);

    const timeoutId = setTimeout(() => {
      setGeocodingStatus(prev => prev === 'searching' ? 'error' : prev);
      console.warn('Geocoding timed out');
    }, 8000);

    try {
      const geocoder = new geocodingLib.Geocoder();
      const response = await new Promise<google.maps.GeocoderResponse>((resolve, reject) => {
        geocoder.geocode({ address: formData.locationLabel }, (results, status) => {
          if (status === 'OK' && results) resolve({ results });
          else reject(new Error(status));
        });
      });
      clearTimeout(timeoutId);
      if (response.results && response.results[0]) {
        const result = response.results[0];
        setCoords({ lat: result.geometry.location.lat(), lng: result.geometry.location.lng() });
        setFormData(prev => ({ ...prev, locationLabel: result.formatted_address }));
        setGeocodingStatus('found');
      } else {
        setGeocodingStatus('error');
      }
    } catch (e) {
      clearTimeout(timeoutId);
      setGeocodingStatus('error');
    }
  };
  const handlePayment = async () => {
    if (!user) return;
    setIsPaying(true);
    
    try {
      const finalLocation = coords ? { ...coords, label: formData.locationLabel } : null;
      const userRef = doc(db, 'users', user.uid);
      const privateRef = doc(db, 'users', user.uid, 'private', 'info');

      const batch = writeBatch(db);
      batch.set(userRef, {
        name: formData.name,
        golfClub: formData.golfClub,
        course: formData.course,
        handicap: Number(formData.handicap) || 0,
        location: finalLocation || { label: formData.locationLabel },
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      batch.set(privateRef, {
        email: user.email,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await batch.commit();

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
        }),
      });

      const session = await response.json();
      const stripe = await stripePromise;
      
      if (stripe && session.id) {
        await (stripe as any).redirectToCheckout({ sessionId: session.id });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setIsPaying(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    
    try {
      const finalLocation = coords ? { ...coords, label: formData.locationLabel } : null;
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', user.uid);
      const privateRef = doc(db, 'users', user.uid, 'private', 'info');

      const profileFields = {
        name: formData.name,
        golfClub: formData.golfClub,
        course: formData.course,
        handicap: Number(formData.handicap) || 0,
        location: finalLocation || { label: formData.locationLabel },
        userId: user.uid,
        email: user.email,
        emailLower: user.email?.toLowerCase() || '',
        updatedAt: new Date().toISOString(),
      };

      console.log('Saving profile:', profileFields);

      batch.set(userRef, profileFields, { merge: true });

      batch.set(privateRef, {
        email: user.email,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // If this user has already paid (participant doc exists), keep their
      // participant record in sync too, so leaderboard/admin views reflect edits.
      if (participant) {
        const partRef = doc(db, 'participants', user.uid);
        batch.set(partRef, profileFields, { merge: true });
      }

      await batch.commit();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Save failed:', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadMembership = async () => {
    if (!user || !membershipFile) return;
    setIsUploadingMembership(true);
    setMembershipStatus('idle');
    try {
      const fileRef = ref(storage, `membership-proofs/${user.uid}/${membershipFile.name}`);
      await uploadBytes(fileRef, membershipFile);
      const url = await getDownloadURL(fileRef);

      const membershipFields = {
        userId: user.uid,
        membershipProofUrl: url,
        membershipProofFileName: membershipFile.name,
        membershipProofUploadedAt: new Date().toISOString(),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid), membershipFields, { merge: true });
      if (participant) {
        batch.set(doc(db, 'participants', user.uid), membershipFields, { merge: true });
      }
      await batch.commit();

      setMembershipStatus('success');
      setMembershipFile(null);
      setTimeout(() => setMembershipStatus('idle'), 3000);
    } catch (error) {
      console.error('Membership upload failed:', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setMembershipStatus('error');
    } finally {
      setIsUploadingMembership(false);
    }
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Profile Form */}
        <div className="flex-1 space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">PLAYER <span className="text-emerald-600">PROFILE</span></h1>
            <p className="text-slate-500 font-medium">Keep your details updated for the leaderboard.</p>
          </div>

          <form onSubmit={handleSaveProfile} className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Golf Club</label>
                <input 
                  type="text"
                  required
                  value={formData.golfClub}
                  onChange={(e) => setFormData({...formData, golfClub: e.target.value})}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold"
                  placeholder="e.g. Belfry Golf Club"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Home Course</label>
                <input 
                  type="text"
                  required
                  value={formData.course}
                  onChange={(e) => setFormData({...formData, course: e.target.value})}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold"
                  placeholder="e.g. Brabazon Course"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">Handicap</label>
                <input 
                  type="number"
                  step="0.1"
                  required
                  value={formData.handicap}
                  onChange={(e) => setFormData({...formData, handicap: parseFloat(e.target.value)})}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">City/Location (for Map)</label>
                <PlaceAutocomplete 
                  value={formData.locationLabel}
                  onChange={(val) => {
                    setFormData({...formData, locationLabel: val});
                    setGeocodingStatus('idle');
                    setCoords(null);
                  }}
                  onPlaceSelect={handlePlaceSelect}
                  onBlur={() => {
                    console.log('Place input blurred');
                    geocodeFallback();
                  }}
                  className="w-full p-4 pl-12 pr-24 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold"
                />
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {geocodingStatus === 'found' ? (
                    <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded-lg flex items-center gap-1">
                      <CheckCircle size={12} />
                      LOCATION VERIFIED
                    </div>
                  ) : geocodingStatus === 'searching' ? (
                    <div className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1.5 rounded-lg flex items-center gap-1 animate-pulse">
                      <Loader2 size={12} className="animate-spin" />
                      VERIFYING...
                    </div>
                  ) : formData.locationLabel ? (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        geocodeFallback();
                      }}
                      className="text-[10px] font-black text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer active:scale-95"
                    >
                      NOT VERIFIED - CLICK TO VERIFY
                    </button>
                  ) : null}
                  {geocodingStatus === 'error' && (
                    <div className="w-full mt-2 space-y-2">
                      <div className="text-[10px] font-black text-rose-600 bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-lg inline-block">
                        COULD NOT VERIFY THIS ADDRESS
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs font-semibold text-slate-600 leading-relaxed max-w-lg">
                        <div className="font-extrabold text-rose-700 uppercase tracking-wider text-[9px] mb-1 font-mono">ApiTargetBlockedMapError / Inactive APIs?</div>
                        <p className="mb-2 text-[11px]">If verification remains unresponsive, circles indefinitely, or errors out, please verify that these APIs are fully enabled on your API key in the Google Cloud Console:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-500 text-[11px]">
                          <li><span className="font-bold">Maps JavaScript API</span> (Required to render interactive maps)</li>
                          <li><span className="font-bold">Geocoding API</span> (Required to translate typed addresses into map coordinates)</li>
                          <li><span className="font-bold">Places API</span> or <span className="font-bold">Places API (New)</span> (Required for search suggestions)</li>
                        </ul>
                        <p className="mt-2 text-[10px] text-slate-400">
                          To activate them: Go to the <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-bold">Google Cloud APIs Library</a>, select your project, and search/enable each API.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-bold text-slate-400 pl-4 uppercase tracking-tighter">Enter City and Country to appear on the global map</p>
              </div>
            </div>
            
            <div className="space-y-4 pt-4">
              {saveStatus === 'success' && (
                <div className="bg-emerald-50 border-2 border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  <CheckCircle size={18} />
                  Profile updated successfully!
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                  <XCircle size={18} />
                  Failed to update profile. Please try again.
                </div>
              )}
              
              <button 
                type="submit"
                disabled={isSaving || geocodingStatus === 'searching'}
                className={`w-full p-5 rounded-2xl font-black text-lg transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                  saveStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-emerald-600'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    SAVING...
                  </>
                ) : geocodingStatus === 'searching' ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    VERIFYING LOCATION...
                  </>
                ) : saveStatus === 'success' ? (
                  'PROFILE UPDATED!'
                ) : (
                  'UPDATE PROFILE'
                )}
              </button>
            </div>
          </form>

          {/* Golf Club Membership */}
          <div className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">GOLF CLUB MEMBERSHIP</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Proof of membership at a recognised club</p>
              </div>
            </div>

            {participant?.membershipProofUrl ? (
              <div className="flex items-center justify-between gap-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck size={20} className="text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-emerald-800 truncate">
                      {participant.membershipProofFileName || 'Membership document'}
                    </p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Uploaded</p>
                  </div>
                </div>
                <a
                  href={participant.membershipProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-black text-emerald-700 hover:text-emerald-900 shrink-0"
                >
                  VIEW
                  <ExternalLink size={14} />
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-orange-50 border-2 border-orange-100 text-orange-700 px-4 py-3 rounded-xl font-bold text-sm">
                  No membership proof on file yet. Add one below to help us verify your entry.
                </div>

                {membershipStatus === 'success' && (
                  <div className="bg-emerald-50 border-2 border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2">
                    <CheckCircle size={18} />
                    Membership document uploaded!
                  </div>
                )}
                {membershipStatus === 'error' && (
                  <div className="bg-rose-50 border-2 border-rose-100 text-rose-700 px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2">
                    <XCircle size={18} />
                    Upload failed. Please try again.
                  </div>
                )}

                <label className="flex items-center gap-3 w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 font-bold text-slate-500 cursor-pointer hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                  {membershipFile ? <FileCheck size={18} className="text-emerald-600 shrink-0" /> : <Upload size={18} className="shrink-0" />}
                  <span className="truncate text-sm">
                    {membershipFile ? membershipFile.name : 'Upload a photo or PDF of your membership'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setMembershipFile(e.target.files?.[0] || null)}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleUploadMembership}
                  disabled={!membershipFile || isUploadingMembership}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-4 rounded-2xl font-black uppercase text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isUploadingMembership ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  {isUploadingMembership ? 'UPLOADING...' : 'UPLOAD MEMBERSHIP PROOF'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="w-full md:w-80 space-y-6">
          <div className="bg-emerald-600 rounded-[2rem] p-8 text-white space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="flex justify-between items-start relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <CreditCard size={24} />
              </div>
              <div className="bg-emerald-400 text-emerald-950 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                Round Packs
              </div>
            </div>
            
            <div className="space-y-1 relative z-10">
              <div className="text-sm font-bold uppercase tracking-widest opacity-80">Rounds Available</div>
              <div className="text-5xl font-black">
                {participant?.paidRounds || 0}
              </div>
              <p className="text-[10px] font-bold opacity-70">Used: {participant?.usedRounds || 0}</p>
            </div>

            <div className="space-y-4 relative z-10">
              {participant?.paidRounds > participant?.usedRounds ? (
                <button 
                  onClick={() => navigate('/upload')}
                  className="w-full bg-white text-emerald-900 p-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
                >
                  UPLOAD SCORE
                  <Trophy size={18} />
                </button>
              ) : (
                <div className="bg-emerald-700/30 p-4 rounded-xl text-center border border-emerald-400/20">
                   <p className="text-xs font-bold text-emerald-100">No rounds available</p>
                </div>
              )}
              
              <button 
                onClick={handlePayment}
                disabled={isPaying || isVerifying}
                className="w-full bg-orange-500 text-white p-5 rounded-xl font-black text-lg hover:bg-orange-400 transition-all shadow-xl disabled:opacity-50"
              >
                {isPaying ? 'PROCESSING...' : (participant?.paidRounds > 0 ? 'BUY ANOTHER ROUND' : 'PAY £20 FEE')}
              </button>

              <p className="text-[10px] text-emerald-200 font-bold text-center uppercase tracking-widest leading-tight">
                £20 per round entry.<br/>100% directly to charity.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 space-y-4">
            <h3 className="font-black text-slate-800 uppercase tracking-tighter">Event Access</h3>
            <ul className="space-y-3 text-sm font-medium text-slate-500">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Live World Scoreboard
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Participant Map Pin
              </li>
              <li className="flex items-center gap-2 text-emerald-600 font-bold">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Eligible for Prizes
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}