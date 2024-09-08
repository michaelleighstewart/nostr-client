import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import { useLocation, Link } from "react-router-dom";
import { bech32Decoder } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction } from "../utils/interfaces";
import { getPublicKey, finalizeEvent } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import NoteCard from "./NoteCard";
import { UserGroupIcon, UsersIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { showCustomToast } from "./CustomToast";
import { fetchPostsForProfile } from "../utils/profileUtils";

interface ProfileProps {
    npub?: string;
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean | null;
}

interface ProfileData {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
}

const Profile: React.FC<ProfileProps> = ({ npub, keyValue, pool, nostrExists }) => {
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [posts, setPosts] = useState<ExtendedEvent[]>([]);
    const [pubkey, setPubkey] = useState<string>('');
    const [isFollowing, setIsFollowing] = useState(false);
    const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
    const [replies, setReplies] = useState<Record<string, number>>({});
    const location = useLocation();
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingPosts, setLoadingPosts] = useState(true);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const npubFromUrl = queryParams.get("npub");
        const targetNpub = npubFromUrl || npub;

        const fetchProfileData = async () => {
            setLoadingProfile(true);
            setProfileData(null);
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
            const followEvents = await pool.querySync(
                RELAYS,
                { kinds: [3], authors: [currentUserPubkey] }
            );

            if (followEvents.length > 0) {
                const followedPubkeys = followEvents[0].tags
                    .filter(tag => tag[0] === 'p')
                    .map(tag => tag[1]);
                setIsFollowing(followedPubkeys.includes(fetchedPubkey));
            }

            // Fetch profile metadata
            const profileEvents = await pool.querySync(
                RELAYS,
                { kinds: [0], authors: [fetchedPubkey] }
            );

            if (profileEvents.length > 0) {
                const metadata = JSON.parse(profileEvents[0].content) as ProfileData;
                setProfileData(metadata);
            }
            setLoadingProfile(false);
        };
        fetchProfileData();
        fetchPostsForProfile(pool, pubkey, targetNpub ?? null, nostrExists, keyValue,
            setLoadingPosts, setPosts, setProfileData, setReactions, setReplies, setMetadata);
    }, []);

    const handleFollow = async () => {
        if (!pool) return;

        const event = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', pubkey]],
            content: '',
        };

        try {
            if (nostrExists) {
                const signedEvent = await (window as any).nostr.signEvent(event);
                await pool.publish(RELAYS, signedEvent);
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                const signedEvent = finalizeEvent(event, skDecoded);
                await pool.publish(RELAYS, signedEvent);
            }

            setIsFollowing(true);
            showCustomToast("Successfully followed user!");
        } catch (error) {
            console.error("Error following user:", error);
            showCustomToast("Failed to follow user. Please try again.");
        }
    };

    // Sort posts and reposts by date
    const sortedPosts = [...posts].sort((a, b) => {
        const dateA = a.repostedEvent ? a.repostedEvent.created_at : a.created_at;
        const dateB = b.repostedEvent ? b.repostedEvent.created_at : b.created_at;
        return dateB - dateA;
    });

    if (loadingProfile || loadingPosts) {
        return <Loading vCentered={false} />;
    }

    return (
        <div className="py-64">
            {!loadingProfile && profileData ? (
                <div className="flex flex-col items-center">
                    <div className="flex items-center mb-4">
                        {profileData?.picture && <img src={profileData.picture} alt="Profile" className="w-32 h-32 rounded-full mr-4" />}
                        <div className="flex items-center">
                            <h1 className="text-3xl font-bold mr-4 pr-12">{profileData?.name}</h1>
                            {!isFollowing && (
                                <button
                                    onClick={handleFollow}
                                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-4 px-12 rounded flex items-center"
                                >
                                    <UserPlusIcon className="h-5 w-5 mr-2" />
                                    Follow
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-gray-600 mb-4">{profileData?.about}</p>
                    <div className="flex items-center space-x-8 mb-4">
                        <Link to={`/followers/${pubkey}`} className="flex items-center">
                            <UserGroupIcon className="h-6 w-6 mr-2" />
                            <span>Followers</span>
                        </Link>
                        <Link to={`/following/${pubkey}`} className="flex items-center">
                            <UsersIcon className="h-6 w-6 mr-2" />
                            <span>Following</span>
                        </Link>
                    </div>
                </div>
            ) : (
                <></>
            )}

            {loadingPosts ? <Loading vCentered={false} /> : <></>}
            {!loadingPosts && !loadingProfile ? (
                <div>
                    
                    {sortedPosts.length === 0 ? (
                        <Loading vCentered={false} />
                    ) : (
                        <div>
                            <h2 className="text-2xl font-bold mt-8 mb-4 pb-16">Recent Posts</h2>
                        <div className="space-y-8">
                            {sortedPosts.map(post => (
                                <div key={post.id} className="mb-8 pb-32">
                                    <NoteCard
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
                                        reactions={reactions[post.id] || []}
                                        keyValue={keyValue}
                                        deleted={post.deleted === true}
                                        replies={replies[post.id] ? replies[post.id] : 0}
                                        repostedEvent={post.repostedEvent || null}
                                        metadata={metadata}
                                        allReactions={reactions}
                                        allReplies={Object.fromEntries(Object.entries(replies).map(([key, value]) => [key, Array.isArray(value) ? value : []]))}
                                        repliedEvent={null}
                                        reposts={0}
                                        allReposts={null}
                                    />
                                </div>
                            ))}
                        </div>
                        </div>
                    )}
                </div>
            ) : (
                <></>
            )}
        </div>
    );
};

export default Profile;