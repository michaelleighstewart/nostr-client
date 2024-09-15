import React, { useState, useEffect } from "react";
import { SimplePool, Event, nip19 } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { bech32Decoder } from "../utils/helperFunctions";
import { UserCircleIcon } from '@heroicons/react/24/solid';

interface FollowingProps {
    pool: SimplePool | null;
}

interface FollowingData {
    npub: string;
    name?: string;
    picture?: string;
}

const Following: React.FC<FollowingProps> = ({ pool }) => {
    const [following, setFollowing] = useState<FollowingData[]>([]);
    const [loading, setLoading] = useState(true);
    const { pubkey } = useParams<{ pubkey: string }>();

    useEffect(() => {
        const fetchFollowing = async () => {
            setLoading(true);
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

            const followingEvent: Event | null = await pool.get(RELAYS, {
                kinds: [3],
                authors: [pk],
            });

            if (!followingEvent) {
                setLoading(false);
                return;
            }

            const followingPubkeys = followingEvent.tags
                .filter(tag => tag[0] === 'p')
                .map(tag => tag[1]);

            const followingProfiles: Event[] = [];
            await new Promise<void>((resolve) => {
                pool.subscribeMany(
                    RELAYS,
                    [{ kinds: [0], authors: followingPubkeys }],
                    {
                        onevent(event) {
                            followingProfiles.push(event);
                        },
                        oneose() {
                            resolve();
                        }
                    }
                );
            });

            const followingData: FollowingData[] = followingPubkeys.map(followingPubkey => {
                const profile = followingProfiles.find(event => event.pubkey === followingPubkey);
                let profileData = {};
                if (profile) {
                    try {
                        profileData = JSON.parse(profile.content);
                    } catch (e) {
                        console.error("Error parsing profile data", e);
                    }
                }
                return {
                    npub: nip19.npubEncode(followingPubkey),
                    name: (profileData as any).name || (profileData as any).display_name,
                    picture: (profileData as any).picture,
                };
            });

            setFollowing(followingData);
            setLoading(false);
        };

        fetchFollowing();
    }, [pool, pubkey]);

    if (loading) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    return (
        <div className="py-64">
            <h1 className="text-2xl font-bold mb-4">Following</h1>
            {following.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                    {following.map((follow) => (
                        <div key={follow.npub} className="flex flex-col items-center justify-between p-32 border rounded hover:shadow-md transition-shadow h-full">
                            <Link
                                to={`/profile?npub=${follow.npub}`}
                                className="flex flex-col items-center"
                            >
                                <div className="w-80 h-80 mb-4 overflow-hidden rounded-full">
                                    {follow.picture ? (
                                        <img
                                            src={follow.picture}
                                            alt={follow.name || 'Profile'}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <UserCircleIcon className="w-full h-full text-gray-400" />
                                    )}
                                </div>
                                <p className="text-center font-semibold">{follow.name || 'Unknown'}</p>
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <p>Not following anyone.</p>
            )}
        </div>
    );
};

export default Following;
