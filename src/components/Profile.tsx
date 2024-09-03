import { useState, useEffect } from "react";
import { SimplePool, Event } from "nostr-tools";
import { useLocation, Link } from "react-router-dom";
import { bech32Decoder } from "../utils/helperFunctions";
import { getPublicKey, finalizeEvent } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import NoteCard from "./NoteCard";

interface ProfileProps {
    npub?: string;
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
}

interface ProfileData {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
}

const Profile: React.FC<ProfileProps> = ({ npub, keyValue, pool, nostrExists }) => {
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [posts, setPosts] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [pubkey, setPubkey] = useState<string>('');
    const [isFollowing, setIsFollowing] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const npubFromUrl = queryParams.get("npub");
        const targetNpub = npubFromUrl || npub;

        const fetchProfileDataAndPosts = async () => {
            setLoading(true);
            setPosts([]); // Clear previous posts
            setProfileData(null); // Clear previous profile data
            if (!pool) return;

            let fetchedPubkey: string;
            let currentUserPubkey: string;
            if (targetNpub) {
                fetchedPubkey = bech32Decoder("npub", targetNpub).toString('hex');
            } else if (nostrExists) {
                fetchedPubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                fetchedPubkey = getPublicKey(skDecoded);
            }
            setPubkey(fetchedPubkey);

            // Get current user's pubkey
            if (nostrExists) {
                currentUserPubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                currentUserPubkey = getPublicKey(skDecoded);
            }

            // Check if current user is following the profile
            const followingSub = pool.subscribeMany(
                RELAYS,
                [{ kinds: [3], authors: [currentUserPubkey] }],
                {
                    onevent(event) {
                        const followedPubkeys = event.tags
                            .filter(tag => tag[0] === 'p')
                            .map(tag => tag[1]);
                        setIsFollowing(followedPubkeys.includes(fetchedPubkey));
                    },
                    oneose() {
                        followingSub.close();
                    }
                }
            );

            // Fetch profile metadata
            const metadataSub = pool.subscribeMany(
                RELAYS,
                [{ kinds: [0], authors: [fetchedPubkey] }],
                {
                    onevent(event) {
                        console.log("Metadata event", event);
                        const metadata = JSON.parse(event.content) as ProfileData;
                        setProfileData(metadata);
                    },
                    oneose() {
                        console.log("Metadata subscription closed");
                        metadataSub.close();
                    }
                }
            );

            // Fetch recent posts
            const postsSub = pool.subscribeMany(
                RELAYS,
                [{ kinds: [1], authors: [fetchedPubkey], limit: 20 }],
                {
                    onevent(event) {
                        console.log("Post event", event);
                        setPosts(prevPosts => [...prevPosts, event]);
                    },
                    oneose() {
                        console.log("Posts subscription closed");
                        setLoading(false);
                        postsSub.close();
                    }
                }
            );
        };

        fetchProfileDataAndPosts();
    }, [npub, keyValue, pool, nostrExists, location]);

    const handleFollow = async () => {
        if (!pool) return;

        let currentUserPubkey: string;
        if (nostrExists) {
            currentUserPubkey = await (window as any).nostr.getPublicKey();
        } else {
            const skDecoded = bech32Decoder("nsec", keyValue);
            currentUserPubkey = getPublicKey(skDecoded);
        }

        const event = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', pubkey]],
            content: '',
        };

        if (nostrExists) {
            const signedEvent = await (window as any).nostr.signEvent(event);
            await pool.publish(RELAYS, signedEvent);
        } else {
            const skDecoded = bech32Decoder("nsec", keyValue);
            const signedEvent = finalizeEvent(event, skDecoded);
            await pool.publish(RELAYS, signedEvent);
        }

        setIsFollowing(true);
    };

    if (loading) {
        return <Loading vCentered={false} />;
    }

    return (
        <div className="py-64">
            {profileData ? (
                <div>
                    <p>{profileData.picture && <img src={profileData.picture} alt="Profile" className="w-24 h-24 rounded-full" />} {profileData.name}</p>
                    <p>{profileData.about}</p>
                    <div className="mt-4">
                        <Link to={`/followers/${pubkey}`} className="mr-4">Followers</Link>
                        <Link to={`/following/${pubkey}`}>Following</Link>
                        {!isFollowing && (
                            <button
                                onClick={handleFollow}
                                className="ml-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                            >
                                Follow
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <p>No profile data available.</p>
            )}

            <h2 className="mt-8">Recent Posts</h2>
            {posts.length > 0 ? (
                <div className="space-y-4">
                    {posts.map(post => (
                        <NoteCard
                            key={post.id}
                            id={post.id}
                            content={post.content}
                            user={{
                                name: profileData?.name || 'Unknown',
                                image: profileData?.picture,
                                pubkey: post.pubkey,
                                nip05: profileData?.nip05
                            }}
                            created_at={post.created_at}
                            hashtags={post.tags.filter(tag => tag[0] === 't').map(tag => tag[1])}
                            pool={pool}
                            nostrExists={nostrExists}
                            reactions={[]}
                            keyValue={keyValue}
                            deleted={false}
                        />
                    ))}
                </div>
            ) : (
                <p>No recent posts found.</p>
            )}
        </div>
    );
};

export default Profile;