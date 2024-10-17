import React, { useState, useEffect, useRef } from "react";
import { SimplePool, Event, nip19 } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { getFollowers } from "../utils/profileUtils";
import { UserCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { bech32Decoder } from "../utils/helperFunctions";

interface FollowersProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean | null;
}

interface FollowerData {
    npub: string;
    name?: string;
    picture?: string;
}

interface UserMetadata {
    name?: string;
    picture?: string;
}

const FOLLOWERS_PER_PAGE = 20;

const Followers: React.FC<FollowersProps> = ({ keyValue: _keyValue, pool, nostrExists: _nostrExists }) => {
    const [followers, setFollowers] = useState<FollowerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [userMetadata, setUserMetadata] = useState<UserMetadata>({});
    const { npub } = useParams<{ npub: string }>();
    const [currentPage, setCurrentPage] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);

    useEffect(() => {
        const fetchUserMetadata = async () => {
            if (!pool || !npub) return;
            let pk: string;
            try {
                pk = bech32Decoder('npub', npub).toString('hex');
            } catch (error) {
                console.error("Error decoding npub:", error);
                return;
            }

            const userEvent: Event | null = await pool.get(RELAYS, {
                kinds: [0],
                authors: [pk],
            });

            if (userEvent) {
                try {
                    const metadata = JSON.parse(userEvent.content);
                    setUserMetadata({
                        name: metadata.name || metadata.display_name,
                        picture: metadata.picture,
                    });
                } catch (error) {
                    console.error("Error parsing user metadata:", error);
                }
            }
        };

        const fetchFollowers = async () => {
            setLoading(true);
            if (!pool || !npub) return;
      
            let pk: string;
            try {
                pk = bech32Decoder('npub', npub).toString('hex');
            } catch (error) {
                console.error("Error decoding npub:", error);
                return;
            }
      
            const followerPubkeys = await getFollowers(pool, pk);
            const uniqueFollowers = Array.from(new Set(followerPubkeys));
      
            const followerProfiles: Event[] = [];
            await new Promise<void>((resolve) => {
                pool.subscribeManyEose(
                    RELAYS,
                    [
                        {
                            kinds: [0],
                            authors: uniqueFollowers,
                        }
                    ],
                    {
                        onevent(event) {
                            followerProfiles.push(event);
                        },
                        onclose() {
                            resolve();
                        }
                    }
                );
            });

            const followerData: FollowerData[] = uniqueFollowers.map(followerPubkey => {
                const profile = followerProfiles.find(event => event.pubkey === followerPubkey);
                let profileData = {};
                if (profile) {
                    try {
                        profileData = JSON.parse(profile.content);
                    } catch (e) {
                        console.error("Error parsing profile data", e);
                    }
                }
                return {
                    npub: nip19.npubEncode(followerPubkey),
                    name: (profileData as any).name || (profileData as any).display_name,
                    picture: (profileData as any).picture,
                };
            });

            setFollowers(followerData);
            setLoading(false);
        };

        fetchUserMetadata();
        fetchFollowers();
    }, []);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (touchStartX.current && touchEndX.current) {
            const diff = touchStartX.current - touchEndX.current;
            const pageCount = Math.ceil(followers.length / FOLLOWERS_PER_PAGE);

            if (diff > 50 && currentPage < pageCount - 1) {
                setCurrentPage(prev => prev + 1);
            } else if (diff < -50 && currentPage > 0) {
                setCurrentPage(prev => prev - 1);
            }
        }

        touchStartX.current = null;
        touchEndX.current = null;
    };

    if (loading) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    const pageCount = Math.ceil(followers.length / FOLLOWERS_PER_PAGE);

    return (
        <div className="py-64">
          <Link
            to={`/profile/${npub}`}
            className="inline-flex items-center mb-4 p-2 text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeftIcon className="w-64 h-64 mr-2" />
            {userMetadata.picture ? (
              <img
                src={userMetadata.picture}
                alt={userMetadata.name || 'Profile'}
                className="w-64 h-64 rounded-full object-cover"
              />
            ) : (
              <UserCircleIcon className="w-64 h-64" />
            )}
          </Link>
          <h1 className="text-2xl font-bold mb-4">Followers</h1>
          <div 
            className="relative w-full max-w-3xl mx-auto"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex justify-center mb-4">
              {Array.from({ length: pageCount }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`h-3 w-3 rounded-full mx-1 ${
                    currentPage === index ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                  aria-label={`Go to page ${index + 1}`}
                />
              ))}
            </div>
            {Array.from({ length: pageCount }).map((_, pageIndex) => (
              <div 
                key={pageIndex} 
                className={`w-full ${currentPage === pageIndex ? 'block' : 'hidden'}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                  {followers.slice(pageIndex * FOLLOWERS_PER_PAGE, (pageIndex + 1) * FOLLOWERS_PER_PAGE).map((follower) => (
                    <div key={follower.npub} className="flex flex-col items-center justify-between p-32 border rounded hover:shadow-md transition-shadow h-full">
                      <Link
                        to={`/profile/${follower.npub}`}
                        className="flex flex-col items-center"
                      >
                        <div className="w-80 h-80 mb-4 overflow-hidden rounded-full">
                          {follower.picture ? (
                            <img
                              src={follower.picture}
                              alt={follower.name || 'Profile'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserCircleIcon className="w-full h-full text-gray-400" />
                          )}
                        </div>
                        <p className="text-center font-semibold">
                            {follower.name && follower.name.split(' ').length === 1 && follower.name.length > 16
                                ? `${follower.name.substring(0, 16)}...`
                                : follower.name || 'Unknown'}
                        </p>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
    );
};

export default Followers;