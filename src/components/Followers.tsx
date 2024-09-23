import React, { useState, useEffect } from "react";
import { SimplePool, Event, nip19 } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { getFollowing } from "../utils/profileUtils";
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

const Followers: React.FC<FollowersProps> = ({ keyValue: _keyValue, pool, nostrExists: _nostrExists }) => {
    const [followers, setFollowers] = useState<FollowerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [userMetadata, setUserMetadata] = useState<UserMetadata>({});
    const { pubkey } = useParams<{ pubkey: string }>();

    useEffect(() => {
        const fetchUserMetadata = async () => {
            if (!pool || !pubkey) return;
            let pk = pubkey;
            if (pubkey.startsWith('npub')) {
                try {
                    pk = bech32Decoder('npub', pubkey).toString('hex');
                } catch (error) {
                    console.error("Error decoding npub:", error);
                    return;
                }
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
            if (!pool || !pubkey) return;

            const allFollowing = await getFollowing(pool, true, _nostrExists, _keyValue, () => {}, pubkey);
            const uniqueFollowers = Array.from(new Set(allFollowing));

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

        fetchUserMetadata();
        fetchFollowers();
    }, [pool, pubkey]);

    if (loading) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    return (
        <div className="py-64">
            <Link
                to={`/profile/${pubkey}`}
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
            {followers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                    {followers.map((follower) => (
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