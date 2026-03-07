import { useState, useEffect, useCallback, useRef } from "react";
import { SimplePool } from "nostr-tools";
import { Link, useParams, useNavigate } from "react-router-dom";
import { bech32Decoder } from "../utils/helperFunctions";
import { ExtendedEvent } from "../utils/interfaces";
import { getPublicKey, nip19 } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import NoteCard from "./NoteCard";
import { UserPlusIcon, ChatBubbleLeftRightIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import { fetchData } from "../utils/noteUtils";
import NewMessageDialog from "./NewMessageDialog";
import { Helmet } from 'react-helmet-async';
import { getMetadataFromCache, setMetadataToCache } from "../utils/cachingUtils";
import { useLayoutEffect } from "react";
import { handleFollowUnfollow } from "../utils/followUtils";

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
    const [followingCount, setFollowingCount] = useState<number>(0);
    const [followersCount, setFollowersCount] = useState<number>(0);
    const poolRef = useRef(pool);
    const keyValueRef = useRef(keyValue);
    const [isPoolReady, setIsPoolReady] = useState(false);

    const { npub } = useParams<{ npub: string }>();
    const navigate = useNavigate();

    const defaultAlgorithm = {
        byoDegrees: 1,
        byoPosts: true,
        byoReposts: true,
        byoReplies: true
    };

    const handleEventReceived = useCallback(async (event: ExtendedEvent) => {
        setStreamedEvents(prev => {
            if (prev.some(e => e.id === event.id)) {
                return prev;
            }
            const newEvents = [...prev, event].sort((a, b) => b.created_at - a.created_at);
            return newEvents;
        });
        if (pool) {
            const repliesToFetch = [];
            if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
            if (event.rootEvent) repliesToFetch.push(event.rootEvent);
        }
    }, []);

    useEffect(() => {
        setStreamedEvents([]);
        setLoadingPosts(true);
      }, [npub]);

    useLayoutEffect(() => {
        window.scrollTo(0, 0);
      }, []);

    useEffect(() => {
        if (pool) {
          Promise.all(RELAYS.map(relay => pool.ensureRelay(relay)))
            .then(() => setIsPoolReady(true))
            .catch(err => console.error("Error connecting to relays:", err));
        }
    }, [pool]);

    useEffect(() => {
        if (!isPoolReady) return;
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
                try {
                    fetchedPubkey = await (window as any).nostr.getPublicKey();
                } catch (error) {
                    console.warn("Nostr extension error:", (error as Error).message);
                    const skDecoded = bech32Decoder("nsec", keyValue);
                    fetchedPubkey = getPublicKey(skDecoded);
                }
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                fetchedPubkey = getPublicKey(skDecoded);
            }
            setPubkey(fetchedPubkey);
            if (nostrExists) {
                try {
                    currentUserPubkey = await (window as any).nostr.getPublicKey();
                } catch (error) {
                    console.warn("Nostr extension error:", (error as Error).message);
                    const skDecoded = bech32Decoder("nsec", keyValue);
                    currentUserPubkey = getPublicKey(skDecoded);
                }
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
            

            const profileFollowEvents = await pool.querySync(
                RELAYS,
                { kinds: [3], authors: [fetchedPubkey] }
            );
            let followingCount = 0;
            if (profileFollowEvents.length > 0) {
                followingCount = profileFollowEvents[0].tags.filter(tag => tag[0] === 'p').length;
            }

            setFollowingCount(followingCount);

            // Fetch followers count
            const followerEvents = await pool.querySync(
                RELAYS,
                { kinds: [3], '#p': [fetchedPubkey] }
            );
            // Remove duplicate pubkeys from followerEvents
            const uniqueFollowerEvents = followerEvents.filter((event, index, self) =>
                index === self.findIndex((e) => e.pubkey === event.pubkey)
            );
            setFollowersCount(uniqueFollowerEvents.length);
        
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
            const filter = { kinds: [1, 5, 6], authors: [fetchedPubkey], limit: 5 };
            let newEvents = await fetchData(pool, 0, false, 0, isLoggedIn ?? false, nostrExists ?? false, keyValue ?? "",
                setLoading, setLoadingMore, setError, setStreamedEvents, [], repostEvents, replyEvents, setLastFetchedTimestamp, 
                setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete, filter, handleEventReceived, defaultAlgorithm, false);
            setLoadingPosts(false);
            setStreamedEvents(prevEvents => {
                const combinedEvents = prevEvents.concat(newEvents || []);
                return combinedEvents
                  .filter((event, index, self) => 
                    index === self.findIndex((e) => e.id === event.id)
                  )
                  .sort((a, b) => b.created_at - a.created_at);
              });
              if (pool) {
                for (const event of newEvents || []) {
                    const repliesToFetch = [];
                    if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
                    if (event.rootEvent) repliesToFetch.push(event.rootEvent);
                }
            }
        };

        fetchProfileData();
    }, [nostrExists, npub, pool, isPoolReady]);

    const handleUnfollow = async () => {
        if (!pool) return;
        const success = await handleFollowUnfollow(pool, nostrExists ?? false, keyValue, nip19.npubEncode(pubkey),
            true,  followingList);
        if (success) {
            setFollowingList(prevList => prevList.filter(pk => pk !== pubkey));
            setIsFollowing(false);
        }
    };

    const handleFollow = async () => {
        if (!pool) return;
        const success = await handleFollowUnfollow(pool, nostrExists ?? false, keyValue, nip19.npubEncode(pubkey), false, followingList);
        if (success) {
            setFollowingList(prevList => [...prevList, pubkey]);
            setIsFollowing(true);
        }
    }

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
        return (
            <div className="pt-4 pb-20 md:pb-8">
                <div className="card p-8 animate-pulse">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-24 h-24 rounded-full bg-gray-700" />
                        <div className="h-5 bg-gray-700 rounded w-32" />
                        <div className="h-3 bg-gray-700 rounded w-48" />
                    </div>
                </div>
            </div>
        );
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

    const handleUserClick = (userPubkey: string) => {
        const userNpub = nip19.npubEncode(userPubkey);
        navigate(`/profile/${userNpub}`);
    };

    return (
        <div className="pt-4 pb-20 md:pb-8">
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
                <div className="card p-6 mb-6">
                    <div className="flex flex-col items-center text-center">
                        {profileData?.picture && (
                            <img 
                                src={profileData.picture} 
                                alt="Profile" 
                                className="w-24 h-24 rounded-full object-cover ring-2 ring-violet-500/30 mb-4 cursor-pointer hover:ring-violet-500 transition-all" 
                                onClick={() => setSelectedImage(profileData.picture ?? null)}
                            />
                        )}
                        <h1 className="text-2xl font-bold text-white mb-1">{profileData?.name}</h1>
                        {profileData?.about && (
                            <p className="text-sm text-gray-400 mb-4 max-w-md leading-relaxed">{profileData.about}</p>
                        )}

                        <div className="flex items-center gap-6 mb-4">
                            <Link to={`/profile/${npubFromUrl ? npubFromUrl : nip19.npubEncode(pubkey)}/following/`} className="flex flex-col items-center group">
                                <span className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">{followingCount}</span>
                                <span className="text-xs text-gray-500">Following</span>
                            </Link>
                            <div className="w-px h-8 bg-gray-700" />
                            <Link to={`/profile/${npubFromUrl || nip19.npubEncode(pubkey)}/followers`} className="flex flex-col items-center group">
                                <span className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">{followersCount}</span>
                                <span className="text-xs text-gray-500">Followers</span>
                            </Link>
                        </div>

                        <div className="flex gap-2">
                            {!isFollowing ? (
                                <button onClick={handleFollow} className="btn-primary flex items-center gap-2 text-sm">
                                    <UserPlusIcon className="h-4 w-4" />
                                    Follow
                                </button>
                            ) : (
                                <button onClick={handleUnfollow} className="btn-danger flex items-center gap-2 text-sm">
                                    <UserMinusIcon className="h-4 w-4" />
                                    Unfollow
                                </button>
                            )}
                            <button onClick={() => setIsMessageDialogOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
                                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                                Message
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card p-8 text-center">
                    <p className="text-sm text-gray-500">No profile data available.</p>
                </div>
            )}

            {loadingPosts ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card p-4 animate-pulse">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-gray-700" />
                                <div className="space-y-2 flex-1">
                                    <div className="h-3 bg-gray-700 rounded w-24" />
                                    <div className="h-2 bg-gray-700 rounded w-16" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-3 bg-gray-700 rounded w-full" />
                                <div className="h-3 bg-gray-700 rounded w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Recent Notes</h2>
                    {sortedPosts.length === 0 ? (
                        <div className="card p-8 text-center">
                            <p className="text-sm text-gray-500">No notes found.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {streamedEvents
                                .filter(post => !deletedNoteIds.has(post.id))
                                .sort((a, b) => b.created_at - a.created_at)
                                .map((post) => (
                                    <NoteCard
                                        key={post.id}
                                        referencedNoteInput={null}
                                        isPreview={false}
                                        id={post.id}
                                        event={post}
                                        rootEvent={post.rootEvent}
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
                                        keyValue={keyValue}
                                        deleted={post.deleted === true}
                                        repostedEvent={post.repostedEvent || null}
                                        repliedEvent={post.repliedEvent || null}
                                        connectionInfo={null}
                                        onUserClick={handleUserClick}
                                    />
                                ))}
                            {!loadingMore && (
                                <div className="mt-6 text-center">
                                    <button onClick={handleLoadMore} className="btn-secondary">
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
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
                    onClick={() => setSelectedImage(null)}
                >
                    <img 
                        src={selectedImage} 
                        alt="Full size profile" 
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default Profile;