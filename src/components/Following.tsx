import React, { useState, useEffect, useRef } from "react";
import { SimplePool, Event, nip19 } from "nostr-tools";
import { useParams, Link } from "react-router-dom";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { bech32Decoder } from "../utils/helperFunctions";
import { UserCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';

interface FollowingProps {
    pool: SimplePool | null;
}

interface FollowingData {
    npub: string;
    name?: string;
    picture?: string;
}

interface UserMetadata {
    name?: string;
    picture?: string;
}

const FOLLOWING_PER_PAGE = 20;

const Following: React.FC<FollowingProps> = ({ pool }) => {
    const [following, setFollowing] = useState<FollowingData[]>([]);
    const [loading, setLoading] = useState(true);
    const [userMetadata, setUserMetadata] = useState<UserMetadata>({});
    const { npub } = useParams<{ npub: string }>();
    const poolRef = useRef(pool);
    const [currentPage, setCurrentPage] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const [isPoolReady, setIsPoolReady] = useState(false);

    useEffect(() => {
        if (pool) {
          const isReady = RELAYS.every(relay => pool?.ensureRelay(relay));
          setIsPoolReady(isReady);
        }
    }, [pool]);

    useEffect(() => {
        if (!isPoolReady) return;
        const fetchUserMetadata = async () => {
            if (!pool || !npub) return;
            let pk = npub;
            if (npub.startsWith('npub')) {
                try {
                    pk = bech32Decoder('npub', npub).toString('hex');
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

        poolRef.current = pool;
        const fetchFollowing = async () => {
            setLoading(true);
            if (!pool || !npub) return;
            let pk = npub;
            if (npub.startsWith('npub')) {
                try {
                    pk = bech32Decoder('npub', npub).toString('hex');
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

        fetchUserMetadata();
        fetchFollowing();
    }, [isPoolReady]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (touchStartX.current && touchEndX.current) {
            const diff = touchStartX.current - touchEndX.current;
            const pageCount = Math.ceil(following.length / FOLLOWING_PER_PAGE);

            if (diff > 50 && currentPage < pageCount - 1) {
                setCurrentPage(prev => prev + 1);
            } else if (diff < -50 && currentPage > 0) {
                setCurrentPage(prev => prev - 1);
            }
        }

        touchStartX.current = null;
        touchEndX.current = null;
    };

    if (loading) {
        return <div className="h-screen"><Loading vCentered={false} /></div>;
    }

    const pageCount = Math.ceil(following.length / FOLLOWING_PER_PAGE);

    return (
        <div className="py-64">
            <Link
                to={`/profile/${npub}`}
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
            <h1 className="text-2xl font-bold mb-4">Following</h1>
            <div 
                className="relative w-full max-w-3xl mx-auto"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="flex justify-center mb-4">
                    {Array.from({ length: pageCount }).map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentPage(index)}
                            className={`h-3 w-3 rounded-full mx-1 ${
                                currentPage === index ? 'bg-blue-500' : 'bg-gray-300'
                            }`}
                            aria-label={`Go to page ${index + 1}`}
                        />
                    ))}
                </div>
                {Array.from({ length: pageCount }).map((_, pageIndex) => (
                    <div 
                        key={pageIndex} 
                        className={`w-full ${currentPage === pageIndex ? 'block' : 'hidden'}`}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                            {following.slice(pageIndex * FOLLOWING_PER_PAGE, (pageIndex + 1) * FOLLOWING_PER_PAGE).map((follow) => (
                                <div key={follow.npub} className="flex flex-col items-center justify-between p-32 border rounded hover:shadow-md transition-shadow h-full">
                                    <Link
                                        to={`/profile/${follow.npub}`}
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
                                        <p className="text-center font-semibold">
                                            {follow.name && follow.name.split(' ').length === 1 && follow.name.length > 16
                                            ? `${follow.name.substring(0, 16)}...`
                                            : follow.name || 'Unknown'}
                                        </p>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Following;
