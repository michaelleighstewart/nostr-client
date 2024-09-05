import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import { useLocation, Link } from "react-router-dom";
import { bech32Decoder, ExtendedEvent } from "../utils/helperFunctions";
import { getPublicKey, finalizeEvent } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import NoteCard from "./NoteCard";
import { UserGroupIcon, UsersIcon, UserPlusIcon } from '@heroicons/react/24/outline';

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

interface Reaction {
    liker_pubkey: string;
    type: string;
    sig: string;
}

export interface Metadata {
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
    const [replies, setReplies] = useState<Record<string, Set<string>>>({});
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

        const fetchPosts = async () => {
            setLoadingPosts(true);
            setPosts([]);
            setProfileData(null);
            setReactions({});
            setReplies({});
            if (!pool) return;
            let fetchedPubkey: string;
            if (targetNpub) {
                fetchedPubkey = bech32Decoder("npub", targetNpub).toString('hex');
            } else if (nostrExists) {
                fetchedPubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                fetchedPubkey = getPublicKey(skDecoded);
            }
            setPubkey(fetchedPubkey);

            //await new Promise<void>((resolve) => {
                const subscription = pool.subscribeManyEose(RELAYS, [
                {
                    kinds: [1, 6],
                    authors: [fetchedPubkey],
                    limit: 5
                }
                ], {
                async onevent(event) {
                    if (event.kind === 1) {
                        // Regular post
                        if (!event.tags.some(tag => tag[0] === 'e')) {
                            const reactionEvents = await pool.querySync(
                                RELAYS,
                                {
                                    kinds: [7],
                                    '#e': [event.id],
                                }
                            );
                            const reactions: Reaction[] = reactionEvents.map(event => ({
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            }));
                            setReactions(prevReactions => ({
                                ...prevReactions,
                                [event.id]: reactions
                            }));

                            // Fetch replies
                            const replyEvents = await pool.querySync(
                                RELAYS,
                                {
                                    kinds: [1],
                                    '#e': [event.id],
                                }
                            );
                            setReplies(prevReplies => ({
                                ...prevReplies,
                                [event.id]: new Set(replyEvents.map(e => e.id))
                            }));
                            setPosts(prevPosts => {
                                const postExists = prevPosts.some(post => post.id === event.id);
                                if (!postExists) {
                                    return [...prevPosts, { ...event, deleted: false, repostedEvent: null }];
                                }
                                return prevPosts;
                            });
                        }
                    } else if (event.kind === 6) {
                        // Repost
                        const repostedId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (repostedId) {
                        try {
                            const repostedContent = JSON.parse(event.content);
                            const repostedEvent: ExtendedEvent = {
                            ...event,
                            id: repostedContent.id,
                            pubkey: repostedContent.pubkey,
                            created_at: repostedContent.created_at,
                            content: repostedContent.content,
                            tags: repostedContent.tags,
                            deleted: false,
                            repostedEvent: null
                            };
                            const extendedEvent: ExtendedEvent = {
                            id: event.id,
                            pubkey: event.pubkey,
                            created_at: event.created_at,
                            content: "",
                            tags: event.tags,
                            deleted: false,
                            repostedEvent: repostedEvent
                            };
                            // Fetch metadata for the reposted event's author
                            const profileEvents = await pool?.querySync(
                            RELAYS,
                            {
                                kinds: [0],
                                authors: [repostedEvent.pubkey],
                            }
                            );

                            if (profileEvents && profileEvents.length > 0) {
                            const event = profileEvents[0];
                            try {
                                const profileContent = JSON.parse(event.content);
                                setMetadata((prevMetadata) => ({
                                ...prevMetadata,
                                [event.pubkey]: {
                                    name: profileContent.name,
                                    about: profileContent.about,
                                    picture: profileContent.picture,
                                    nip05: profileContent.nip05,
                                },
                                }));
                            } catch (error) {
                                console.error("Error parsing profile metadata:", error);
                            }
                            }
                            // Fetch reactions and replies for the reposted event
                            const eventsReactionsReplies = await pool?.querySync(
                            RELAYS,
                            {
                                kinds: [1, 7],
                                "#e": [repostedEvent.id],
                            }
                            );

                            if (eventsReactionsReplies) {
                                eventsReactionsReplies.forEach((eventReactionReply) => {
                                if (eventReactionReply.kind === 7) {
                                // This is a reaction
                                setReactions((prevReactions) => ({
                                    ...prevReactions,
                                    [repostedEvent.id]: [
                                    ...(prevReactions[repostedEvent.id] || []),
                                    {
                                        id: eventReactionReply.id,
                                        liker_pubkey: event.pubkey,
                                        type: eventReactionReply.tags.find((t) => t[0] === "p")?.[1] || "+",
                                        sig: eventReactionReply.sig,
                                    },
                                    ],
                                }));
                                } else if (eventReactionReply.kind === 1) {
                                // This is a reply
                                setReplies(cur => {
                                    const updatedReplies = { ...cur };
                                    const postId = eventReactionReply.tags.find(tag => tag[0] === 'e')?.[1];
                                    if (postId) {
                                        updatedReplies[postId] = (updatedReplies[postId] || new Set()).add(eventReactionReply.id);
                                    }
                                    return updatedReplies;
                                });
                                }
                            });
                            }
                        setPosts(prevPosts => {
                            const postExists = prevPosts.some(post => post.id === extendedEvent.id);
                            if (!postExists) {
                                return [...prevPosts, extendedEvent];
                            }
                            return prevPosts;
                        });
                        } catch (error) {
                            console.error("Error parsing reposted content:", error);
                        }
                        }
                    }
                },
                onclose() {
                    setLoadingPosts(false);
                }
                });           
        };
        fetchProfileData();
        fetchPosts();
    }, []);

    const handleFollow = async () => {
        if (!pool) return;

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

    // Sort posts and reposts by date
    const sortedPosts = [...posts].sort((a, b) => {
        const dateA = a.repostedEvent ? a.repostedEvent.created_at : a.created_at;
        const dateB = b.repostedEvent ? b.repostedEvent.created_at : b.created_at;
        return dateB - dateA;
    });

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
            {!loadingPosts ? (
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
                                        replies={replies[post.id] ? replies[post.id].size : 0}
                                        repostedEvent={post.repostedEvent || null}
                                        metadata={metadata}
                                        allReactions={reactions}
                                        allReplies={Object.fromEntries(Object.entries(replies).map(([key, value]) => [key, value.size]))}
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