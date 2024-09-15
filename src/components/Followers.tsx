import React, { useState, useEffect } from "react";
import { SimplePool, Event, nip19 } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { getFollowers } from "../utils/profileUtils";
import { UserCircleIcon } from '@heroicons/react/24/solid';

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

const Followers: React.FC<FollowersProps> = ({ keyValue: _keyValue, pool, nostrExists: _nostrExists }) => {
    const [followers, setFollowers] = useState<FollowerData[]>([]);
    const [loading, setLoading] = useState(true);
    const { pubkey } = useParams<{ pubkey: string }>();

    useEffect(() => {
        const fetchFollowers = async () => {
            setLoading(true);
            if (!pool || !pubkey) return;

            const allFollowers = await getFollowers(pool, true, _nostrExists, _keyValue, () => {}, pubkey);
            const uniqueFollowers = Array.from(new Set(allFollowers));

            const followerProfiles: Event[] = [];
            await new Promise<void>((resolve) => {
                pool.subscribeManyEose(
                    RELAYS,
                    [
                        {
                            kinds: [0],
                            authors: Array.from(uniqueFollowers),
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

            const followerData: FollowerData[] = Array.from(uniqueFollowers).map(followerPubkey => {
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

        fetchFollowers();
    }, [pool, pubkey]);

    if (loading) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    return (
        <div className="py-64">
            <h1 className="text-2xl font-bold mb-4">Followers</h1>
            {followers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                    {followers.map((follower) => (
                        <div key={follower.npub} className="flex flex-col items-center justify-between p-32 border rounded hover:shadow-md transition-shadow h-full">
                            <Link
                                to={`/profile?npub=${follower.npub}`}
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
                                <p className="text-center font-semibold">{follower.name || 'Unknown'}</p>
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <p>No followers found.</p>
            )}
        </div>
    );
};

export default Followers;