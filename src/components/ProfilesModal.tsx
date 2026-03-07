import React, { useState, useEffect, useRef } from 'react';
import { SimplePool, Event, nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import { RELAYS } from '../utils/constants';
import Loading from './Loading';

interface ProfilesModalProps {
  npubs: string[];
  pool: SimplePool | null;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

interface ProfileData {
  npub: string;
  name?: string;
  picture?: string;
}

const ProfilesModal: React.FC<ProfilesModalProps> = ({ npubs, pool, isOpen, onClose, title }) => {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedProfiles, setFetchedProfiles] = useState(false);
  const subRef = useRef<ReturnType<SimplePool['subscribeMany']> | null>(null);

  useEffect(() => {
    let isMounted = true;
  
    const fetchProfiles = async () => {
      if (!isOpen || !pool || fetchedProfiles) return;
      setLoading(true);
      const pubkeys = npubs.map(npub => {
        try {
          return nip19.decode(npub).data as string;
        } catch (error) {
          console.error("Error decoding npub:", error);
          return null;
        }
      }).filter((pubkey): pubkey is string => pubkey !== null);
  
      const profileEvents: Event[] = [];
      await new Promise<void>((resolve) => {
        const sub = pool.subscribeMany(
          RELAYS,
          [{ kinds: [0], authors: pubkeys }],
          {
            onevent(event) {
              if (!profileEvents.some(e => e.id === event.id)) {
                profileEvents.push(event);
              }
            },
            oneose() {
              resolve();
              sub.close();
            }
          }
        );
        subRef.current = sub;
      });
  
      if (!isMounted) return;

      const profileData: ProfileData[] = pubkeys.map(pubkey => {
        const event = profileEvents.find(e => e.pubkey === pubkey);
        let profile = {};
        if (event) {
          try {
            profile = JSON.parse(event.content);
          } catch (error) {
            console.error("Error parsing profile data:", error);
          }
        }
        return {
          npub: nip19.npubEncode(pubkey),
          name: (profile as any).name || (profile as any).display_name || 'Unknown',
          picture: (profile as any).picture,
        };
      });

      setProfiles(profileData);
      setLoading(false);
      setFetchedProfiles(true);
    };
  
    fetchProfiles();
  
    return () => {
      isMounted = false;
      subRef.current?.close();
    };
  }, [pool, isOpen, npubs]);

  useEffect(() => {
    if (!isOpen) {
      setFetchedProfiles(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
        <div className="mb-4">
          {loading ? (
            <Loading vCentered={false} />
          ) : profiles.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {profiles.map((profile) => (
                <Link
                  key={profile.npub}
                  to={`/profile/${profile.npub}`}
                  className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg text-white transition-colors"
                  onClick={onClose}
                >
                  <div className="w-8 h-8 overflow-hidden rounded-full flex-shrink-0">
                    {profile.picture ? (
                      <img src={profile.picture} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserCircleIcon className="w-full h-full text-gray-500" />
                    )}
                  </div>
                  <span className="text-sm font-medium truncate">{profile.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">None</p>
          )}
        </div>
        <button onClick={onClose} className="btn-secondary w-full text-sm">
          Close
        </button>
      </div>
    </div>
  );
};

export default ProfilesModal;