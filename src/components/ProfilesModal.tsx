import React, { useState, useEffect } from 'react';
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
    };
  }, [pool, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFetchedProfiles(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-gray-800">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-white">{title}</h3>
          <div className="mt-2 px-7 py-3">
            {loading ? (
              <Loading vCentered={false} />
            ) : profiles.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                {profiles.map((profile) => (
                  <Link
                    key={profile.npub}
                    to={`/profile/${profile.npub}`}
                    className="flex items-center p-2 hover:bg-gray-700 rounded text-white"
                    onClick={onClose}
                  >
                    <div className="w-32 h-32 mr-3 overflow-hidden rounded-full">
                      {profile.picture ? (
                        <img
                          src={profile.picture}
                          alt={profile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserCircleIcon className="w-full h-full text-gray-400" />
                      )}
                    </div>
                    <span className="font-semibold">{profile.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-white">None</p>
            )}
          </div>
          <div className="items-center px-4 py-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilesModal;