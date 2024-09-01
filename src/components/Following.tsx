import { useState, useEffect } from "react";
import { SimplePool, Event } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";

interface FollowingProps {
    pool: SimplePool | null;
}

interface FollowingData {
    pubkey: string;
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

            const followingEvent: Event | null = await pool.get(RELAYS, {
                kinds: [3],
                authors: [pubkey],
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
                    pubkey: followingPubkey,
                    name: (profileData as any).name,
                    picture: (profileData as any).picture,
                };
            });

            setFollowing(followingData);
            setLoading(false);
        };

        fetchFollowing();
    }, [pool, pubkey]);

    if (loading) {
        return <Loading vCentered={false} />;
    }

    return (
        <div className="py-64">
            <h1 className="text-2xl font-bold mb-4">Following</h1>
            {following.length > 0 ? (
                <div className="space-y-4">
                    {following.map(follow => (
                        <div key={follow.pubkey} className="flex items-center space-x-4">
                            {follow.picture && (
                                <img src={follow.picture} alt={follow.name || 'Following'} className="w-12 h-12 rounded-full" />
                            )}
                            <Link to={`/profile?npub=${follow.pubkey}`} className="text-blue-500 hover:underline">
                                {follow.name || follow.pubkey.slice(0, 8)}
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
