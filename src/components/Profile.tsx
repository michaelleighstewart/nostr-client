import { useState, useEffect, useCallback, useRef } from "react";
import { SimplePool } from "nostr-tools";
import { Link, useParams } from "react-router-dom";
import { bech32Decoder } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction } from "../utils/interfaces";
import { getPublicKey, finalizeEvent, nip19 } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import NoteCard from "./NoteCard";
import { UsersIcon, UserPlusIcon, ChatBubbleLeftRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import { showCustomToast } from "./CustomToast";
import { fetchMetadataReactionsAndReplies, fetchData } from "../utils/noteUtils";
import NewMessageDialog from "./NewMessageDialog";
import { Helmet } from 'react-helmet';
import { getMetadataFromCache, setMetadataToCache } from "../utils/cachingUtils";
import { API_URLS } from "../utils/apiConstants";
import { useLayoutEffect } from "react";

interface ProfileProps {
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

const Profile: React.FC<ProfileProps> = ({ keyValue, pool, nostrExists }) => {
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [streamedEvents, setStreamedEvents] = useState<ExtendedEvent[]>([]);
    const [pubkey, setPubkey] = useState<string>('');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followingList, setFollowingList] = useState<string[]>([]);
    const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
    const [replies, setReplies] = useState<Record<string, ExtendedEvent[]>>({});
    const [reposts, setReposts] = useState<Record<string, ExtendedEvent[]>>({});
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
    const [_userPublicKey, setUserPublicKey] = useState<string | null>(null);
    const [_initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [_loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [_error, setError] = useState<string | null>(null);
    const [_lastFetchedTimestamp, setLastFetchedTimestamp] = useState<number>(Math.floor(Date.now() / 1000));
    const [repostEvents, _setRepostEvents] = useState<ExtendedEvent[]>([]);
    const [replyEvents, _setReplyEvents] = useState<ExtendedEvent[]>([]);
    const [isLoggedIn, _setIsLoggedIn] = useState<boolean | null>(nostrExists || !!keyValue);
    const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [npubFromUrl, setNpubFromUrl] = useState<string | undefined>(undefined);
    const poolRef = useRef(pool);
    const keyValueRef = useRef(keyValue);

    const { npub } = useParams<{ npub: string }>();

    const defaultAlgorithm = {
        byoDegrees: 1,
        byoPosts: true,
        byoReposts: true,
        byoReplies: true
    };

    const handleEventReceived = useCallback((event: ExtendedEvent) => {
        setStreamedEvents(prev => {
            if (prev.some(e => e.id === event.id)) {
                return prev;
            }
            const newEvents = [...prev, event].sort((a, b) => b.created_at - a.created_at);
            return newEvents;
        });
        if (pool) {
            fetchMetadataReactionsAndReplies(pool, [event], event.repostedEvent ? [event.repostedEvent] : [], event.repliedEvent ? [event.repliedEvent] : [], setMetadata, setReactions, setReplies, setReposts);
        }
    }, []);

    useLayoutEffect(() => {
        window.scrollTo(0, 0);
      }, []);

    useEffect(() => {
        poolRef.current = pool;
        keyValueRef.current = keyValue;
        const fetchProfileData = async () => {
            setLoadingProfile(true);
            setProfileData(null);
            if (!pool) return;
        
            const npubFromUrl = npub;
            setNpubFromUrl(npubFromUrl);
            const isFromUrl = npubFromUrl !== null;
            const targetNpub = npubFromUrl || npub;
        
            let fetchedPubkey: string;
            let currentUserPubkey: string;
        
            if (targetNpub) {
                if (isFromUrl) {
                    fetchedPubkey = targetNpub.startsWith("npub")
                        ? bech32Decoder("npub", targetNpub).toString('hex')
                        : targetNpub;
                } else {
                    fetchedPubkey = targetNpub;
                }
            } else if (nostrExists) {
                fetchedPubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                fetchedPubkey = getPublicKey(skDecoded);
            }
            setPubkey(fetchedPubkey);
            if (nostrExists) {
                currentUserPubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                currentUserPubkey = getPublicKey(skDecoded);
            }
            const followEvents = await pool.querySync(
                RELAYS,
                { kinds: [3], authors: [currentUserPubkey] }
            );
        
            if (followEvents.length > 0) {
                const followedPubkeys = followEvents[0].tags
                    .filter(tag => tag[0] === 'p')
                    .map(tag => tag[1]);
                setFollowingList(followedPubkeys);
                setIsFollowing(followedPubkeys.includes(fetchedPubkey));
            }
        
            // Try to get profile metadata from cache
            const cachedMetadata = getMetadataFromCache(fetchedPubkey);
            if (cachedMetadata) {
                setProfileData(cachedMetadata);
                setLoadingProfile(false);
            } else {
                // If not in cache, fetch profile metadata
                const profileEvents = await pool.querySync(
                    RELAYS,
                    { kinds: [0], authors: [fetchedPubkey] }
                );
        
                if (profileEvents.length > 0) {
                    const metadata = JSON.parse(profileEvents[0].content) as ProfileData;
                    setProfileData(metadata);
                    setMetadataToCache(fetchedPubkey, metadata);
                }
                setLoadingProfile(false);
            }
            const filter = { kinds: [1, 5, 6], authors: [fetchedPubkey], limit: 10 };
            await fetchData(pool, 0, false, 0, isLoggedIn ?? false, nostrExists ?? false, keyValue ?? "",
                setLoading, setLoadingMore, setError, () => {}, [], repostEvents, replyEvents, setLastFetchedTimestamp, 
                setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete, filter, handleEventReceived, defaultAlgorithm);
            setLoadingPosts(false);
        };

        fetchProfileData();
    }, [nostrExists]);

    useEffect(() => {
        if (!pool || streamedEvents.length === 0) return;
        fetchMetadataReactionsAndReplies(pool, streamedEvents, repostEvents, replyEvents, setMetadata, setReactions, 
            setReplies, setReposts);
    }, [pool, streamedEvents]);


    const handleFollow = async () => {
        if (!pool) return;
    
        const event = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...followingList.map(pk => ['p', pk]), ['p', pubkey]],
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
    
            setFollowingList(prevList => [...prevList, pubkey]);
            setIsFollowing(true);
            showCustomToast("Successfully followed user!");
    
            // Call the batch-processor API
            const currentUserPubkey = nostrExists 
            ? await (window as any).nostr.getPublicKey()
            : getPublicKey(bech32Decoder("nsec", keyValue));
        
            const response = await fetch(API_URLS.API_URL + 'batch-processor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'social_graph_processor',
                    params: {
                        npub: nip19.npubEncode(currentUserPubkey),
                        to_create: nip19.npubEncode(pubkey),
                        fill_missing: false
                    }
                }),
            });
    
            if (!response.ok) {
                throw new Error('Failed to call batch-processor API');
            }
        } catch (error) {
            console.error("Error following user or calling batch-processor API:", error);
            showCustomToast("Failed to follow user. Please try again.");
        }
    };

    const handleLoadMore = async () => {
        if (!pool) return;
        setLoadingMore(true);
        const oldestTimestamp = Math.min(...streamedEvents.map(e => e.created_at));
        const filter = { kinds: [1, 5, 6], authors: [pubkey], limit: 10, until: oldestTimestamp - 1 };
        
        const fetchedEvents = await fetchData(pool, 0, true, oldestTimestamp - 1, isLoggedIn ?? false, nostrExists ?? false, keyValue ?? "",
            setLoading, setLoadingMore, setError, setStreamedEvents, streamedEvents, repostEvents, replyEvents, setLastFetchedTimestamp, 
            setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete, filter, handleEventReceived, defaultAlgorithm);
        
        if (fetchedEvents && Array.isArray(fetchedEvents) && fetchedEvents.length > 0) {
            setStreamedEvents(prevEvents => {
                const newEvents = [...prevEvents, ...fetchedEvents];
                return newEvents.sort((a, b) => b.created_at - a.created_at);
            });
            const newLastFetchedTimestamp = Math.min(...fetchedEvents.map(event => event.created_at));
            setLastFetchedTimestamp(newLastFetchedTimestamp);
        }
        
        setLoadingMore(false);
    };
    const sortedPosts = [...streamedEvents].sort((a, b) => {
        const dateA = a.repostedEvent ? a.repostedEvent.created_at : a.created_at;
        const dateB = b.repostedEvent ? b.repostedEvent.created_at : b.created_at;
        return dateB - dateA;
    });

    if (loadingProfile) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    let title = '';
    let description = '';
    let image = '';
    let url = '';
    if (npubFromUrl) {
        title = profileData?.name ? `${profileData.name} on Ghostcopywrite` : "Ghostcopywrite | Profile";
        description = profileData?.about ? profileData.about : "Let Freedom Ring";
        image = profileData?.picture ? profileData.picture : "https://ghostcopywrite.com/ostrich.png";
        url = `https://ghostcopywrite.com/profile?npub=${npubFromUrl}`;
    }
    else {
        title = "Ghostcopywrite | Profile";
        description = "Let Freedom Ring";
        image = "https://ghostcopywrite.com/ostrich.png";
        url = "https://ghostcopywrite.com";
    }

    return (
        <div className="py-16">
            <Helmet>
                <title>{title}</title>
                <meta property="og:title" content={title} />
                <meta property="og:description" content={description} />
                <meta property="og:image" content={image} />
                <meta property="og:url" content={url} />
                <meta property="og:type" content="profile" />
                <meta name="twitter:card" content="summary_large_image" />
            </Helmet>
            {profileData ? (
                <div className="flex flex-col items-center">
                    <div className="flex flex-col sm:flex-row items-center mb-4">
                        {profileData?.picture && (
                            <img 
                                src={profileData.picture} 
                                alt="Profile" 
                                className="w-64 h-64 rounded-full mb-4 sm:mb-0 sm:mr-4 cursor-pointer" 
                                onClick={() => setSelectedImage(profileData.picture ?? null)}
                            />
                        )}
                        <div className="flex flex-col items-center sm:items-start">
                            <h1 className="text-3xl font-bold mb-4 sm:mb-2">{profileData?.name}</h1>
                            <div className="flex flex-col sm:flex-row items-center">
                                {!isFollowing && (
                                    <button
                                        onClick={handleFollow}
                                        className="text-white font-bold py-2 px-6 rounded flex items-center mb-2 sm:mb-0 sm:mr-2"
                                    >
                                        <UserPlusIcon className="h-5 w-5 mr-2" />
                                        Follow
                                    </button>
                                )}
                                {isFollowing && (
                                    <button
                                        className="text-white font-bold py-2 px-6 rounded flex items-center mb-2 sm:mb-0 sm:mr-2 bg-green-500 cursor-not-allowed"
                                        disabled
                                    >
                                        <CheckIcon className="h-5 w-5 mr-2" />
                                        Following
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsMessageDialogOpen(true)}
                                    className="text-white font-bold py-2 px-6 rounded flex items-center"
                                >
                                    <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
                                    Message
                                </button>
                            </div>
                        </div>
                    </div>
                    <p className="text-gray-600 mb-4 text-center sm:text-left">{profileData?.about}</p>
                    <div className="flex items-center space-x-8 mb-4">
                        <Link to={`/profile/${npubFromUrl ? npubFromUrl : nip19.npubEncode(pubkey)}/following/`} className="flex items-center">
                            <UsersIcon className="h-6 w-6 mr-2" />
                            <span>Following</span>
                        </Link>
                        <Link to={`/profile/${npubFromUrl || nip19.npubEncode(pubkey)}/followers`} className="flex items-center">
                            <UsersIcon className="h-6 w-6 mr-2" />
                            <span>Followers</span>
                        </Link>
                    </div>
                </div>
            ) : (
                <p>No profile data available.</p>
            )}

            {loadingPosts ? (
                <div className="h-screen"><Loading vCentered={false} /></div>
            ) : (
                <div>
                    <h2 className="text-2xl font-bold mt-8 mb-4 pb-16">Recent Notes</h2>
                    {sortedPosts.length === 0 ? (
                        <p>No notes found.</p>
                    ) : (
                        <div className="space-y-8">
                            {streamedEvents
                                .filter(post => !deletedNoteIds.has(post.id))
                                .sort((a, b) => b.created_at - a.created_at)
                                .map((post, _index) => (
                                    <div key={post.id} className="mb-8 pb-32">
                                        <NoteCard
                                            isPreview={false}
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
                                            replies={replies?.[post.id]?.length || 0}
                                            repostedEvent={post.repostedEvent || null}
                                            metadata={metadata}
                                            allReactions={reactions}
                                            allReplies={replies}
                                            repliedEvent={post.repliedEvent || null}
                                            reposts={reposts?.[post.id]?.length || 0}
                                            allReposts={reposts}
                                            setMetadata={setMetadata}
                                        />
                                    </div>
                                ))}
                            {!loadingMore && (
                                <div className="mt-8 mb-8 text-center">
                                    <button
                                        onClick={handleLoadMore}
                                        className="text-white font-bold py-3 px-6 rounded"
                                    >
                                        Load More
                                    </button>
                                </div>
                            )}
                            {loadingMore && <Loading vCentered={false} />}
                        </div>
                    )}
                </div>
            )}
            <NewMessageDialog
                isOpen={isMessageDialogOpen}
                onClose={() => setIsMessageDialogOpen(false)}
                pool={pool}
                nostrExists={nostrExists}
                keyValue={keyValue}
                initialRecipientNpub={nip19.npubEncode(pubkey)}
            />
            {selectedImage && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    onClick={() => setSelectedImage(null)}
                >
                    <img 
                        src={selectedImage} 
                        alt="Full size profile" 
                        className="max-w-full max-h-full object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default Profile;