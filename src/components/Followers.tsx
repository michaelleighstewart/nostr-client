import { useState, useEffect } from "react";
import { SimplePool, Event } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";

interface FollowersProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
}

interface FollowerData {
    pubkey: string;
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

            const followerEvents: Event[] = [];
            await new Promise<void>((resolve) => {
                pool.subscribeMany(
                    RELAYS,
                    [{ kinds: [3], '#p': [pubkey] }],
                    {
                        onevent(event) {
                            followerEvents.push(event);
                        },
                        oneose() {
                            resolve();
                        }
                    }
                );
            });

            const uniqueFollowers = new Set<string>();
            followerEvents.forEach(event => uniqueFollowers.add(event.pubkey));

            const followerProfiles: Event[] = [];
            await new Promise<void>((resolve) => {
                pool.subscribeMany(
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
                        oneose() {
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
                    pubkey: followerPubkey,
                    name: (profileData as any).name,
                    picture: (profileData as any).picture,
                };
            });

            setFollowers(followerData);
            setLoading(false);
        };

        fetchFollowers();
    }, [pool, pubkey]);

    if (loading) {
        return <Loading vCentered={false} />;
    }

    return (
        <div className="py-64">
            <h1 className="text-2xl font-bold mb-4">Followers</h1>
            {followers.length > 0 ? (
                <div className="space-y-4">
                    {followers.map(follower => (
                        <div key={follower.pubkey} className="flex items-center space-x-4">
                            {follower.picture && (
                                <img src={follower.picture} alt={follower.name || 'Follower'} className="w-12 h-12 rounded-full" />
                            )}
                            <Link to={`/profile?npub=${follower.pubkey}`} className="text-blue-500 hover:underline">
                                {follower.name || follower.pubkey.slice(0, 8)}
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