import { useEffect, useState, useRef } from "react";
import { SimplePool, finalizeEvent, getPublicKey, nip19 } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import { bech32Decoder } from "../utils/helperFunctions";
import Loading from "./Loading";
import { Link } from "react-router-dom";
import { UserCircleIcon } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from "framer-motion";

interface PeopleToFollowProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean | null;
}

interface Person {
    name: string;
    npub: string;
    loadingFollowing: boolean;
    picture?: string;
    content?: string;
}

const PeopleToFollow : React.FC<PeopleToFollowProps> = (props: PeopleToFollowProps) => {
    const [peopleToFollow, setPeopleToFollow] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [followingList, setFollowingList] = useState<string[]>([]);
    const [selectedHashtag, setSelectedHashtag] = useState<string>("bitcoin");
    const [customHashtag, setCustomHashtag] = useState<string>("");
    const [searchingPeople, setSearchingPeople] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const hashtags = ["bitcoin", "btc", "nostr", "crypto", "food", "travel"];
    const carouselRef = useRef<HTMLDivElement>(null);
    const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [showOstrich, setShowOstrich] = useState(false);

    async function getCurrentUserPubkey() {
        if (props.nostrExists) {
            return await (window as any).nostr.getPublicKey();
        } else {
            const sk = props.keyValue;
            const skDecoded = bech32Decoder('nsec', sk);
            return getPublicKey(skDecoded);
        }
    }

    async function fetchFollowingList() {
        if (!props.pool) return;

        const pubkey = await getCurrentUserPubkey();
        
        const followingListSubscription = props.pool.subscribeManyEose(
            RELAYS,
            [{ kinds: [3], authors: [pubkey] }],
            {
                onevent(event) {
                    const following = event.tags
                        .filter(tag => tag[0] === 'p')
                        .map(tag => tag[1]);
                    setFollowingList(following);
                },
                onclose() {
                    setLoading(false);
                }
            }
        );

        return () => {
            followingListSubscription?.close();
        };
    }

    async function setupFollowingList() {
        if (!props.pool || !props.keyValue) return;

        setPeopleToFollow([]);
        setSearchingPeople(true);
        const people = await props.pool.querySync(RELAYS, { kinds: [1], limit: 5, '#t': [selectedHashtag] });
        const peopleToFollow: { name: any; npub: `npub1${string}`; picture: any; content: string; }[] = [];
        const pubkeys = Array.from(new Set(people.map(person => person.pubkey)));
        const meta = await props.pool?.querySync(RELAYS, { kinds: [0], authors: pubkeys });
        try {
            if (meta && meta.length > 0) {
                for (const metaEvent of meta) {
                    const metadata = JSON.parse(metaEvent.content);
                    const pubkey = metaEvent.pubkey;
                    const npub = nip19.npubEncode(pubkey);
                    const name = metadata.name || 'Unknown';
                    const picture = metadata.picture;
                    const content = people.find(p => p.pubkey === pubkey)?.content || '';
                    if (!peopleToFollow.some(person => person.npub === npub)) {
                        peopleToFollow.push({ name, npub, picture, content });
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching metadata:", error);
        }
        setPeopleToFollow(peopleToFollow.map(person => ({
            ...person,
            loadingFollowing: false
        })));
        setSearchingPeople(false);
        return () => {
            //peopleSubscription?.close();
            //metadataSubscription?.close();
        };
    }

    useEffect(() => {
        setupFollowingList();
        fetchFollowingList();
    }, [selectedHashtag]);

    useEffect(() => {
        setupFollowingList();
        fetchFollowingList();
    }, [props.pool, props.keyValue, props.nostrExists]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (peopleToFollow.length > 0) {
                setCurrentIndex((prevIndex) => (prevIndex + 1) % peopleToFollow.length);
            }
        }, 5000);

        return () => clearInterval(timer);
    }, [peopleToFollow]);

    useEffect(() => {
        if (carouselRef.current) {
            const currentContentRef = contentRefs.current[currentIndex];
            if (currentContentRef) {
                currentContentRef.style.height = 'auto';
                const height = currentContentRef.scrollHeight;
                currentContentRef.style.height = `${height}px`;
            }
        }
    }, [currentIndex]);

    const handleFollow = async (person: Person) => {
       if (!props.pool || !props.keyValue) return;
        person.loadingFollowing = true;
        const event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string; sig?: string } = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...followingList.map(npub => ['p', npub]), ['p', nip19.decode(person.npub).data as string]],
            content: '',
        };

        if (props.nostrExists) {
            await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
              await props.pool?.publish(RELAYS, eventToSend);
            });
        }
        else {
            let sk = props.keyValue;
            let skDecoded = bech32Decoder('nsec', sk);
            let eventFinal = finalizeEvent(event, skDecoded);
            await props.pool?.publish(RELAYS, eventFinal);
        }
        setFollowingList(prev => {
            const newFollowingList = [...prev, nip19.decode(person.npub).data as string];
            if (prev.length === 0 && newFollowingList.length === 1) {
                setShowOstrich(true);
            }
            return newFollowingList;
        });
        setPeopleToFollow(prev => prev.map(p => p.npub === person.npub ? { ...p, loadingFollowing: false } : p));
    };

    const handleCustomHashtagSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (customHashtag.trim()) {
            setSelectedHashtag(customHashtag.trim());
            setCustomHashtag("");
        }
    };

    const renderContent = (content: string) => {
        const imgRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
        const linkRegex = /(https?:\/\/[^\s]+)/g;

        const imgMatch = content.match(imgRegex);
        if (imgMatch) {
            return <img src={imgMatch[0]} alt="Content" className="max-w-full h-auto" />;
        }

        return content.split(linkRegex).map((part, i) => {
            if (i % 2 === 1) {
                return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
            }
            return part;
        });
    };

    if (loading) {
        return <Loading vCentered={false} />
    }

    return (
        <div className="py-64">
            <div className="flex flex-col items-center mb-8">
                <div className="flex justify-center space-x-4 mb-4">
                    {hashtags.map((hashtag) => (
                        <button
                            key={hashtag}
                            onClick={() => setSelectedHashtag(hashtag)}
                            className={`px-4 py-2 rounded ${
                                selectedHashtag === hashtag
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            #{hashtag}
                        </button>
                    ))}
                </div>
                <form onSubmit={handleCustomHashtagSubmit} className="flex">
                    <input
                        type="text"
                        value={customHashtag}
                        onChange={(e) => setCustomHashtag(e.target.value)}
                        placeholder="Enter custom hashtag"
                        className="px-4 py-2 border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600"
                    >
                        Search
                    </button>
                </form>
            </div>
            {searchingPeople ? (
                <Loading vCentered={false} />
            ) : peopleToFollow.length === 0 ? (
                <p className="text-center">No people to follow for #{selectedHashtag}</p>
            ) : (
                <div ref={carouselRef} className="relative w-full max-w-3xl mx-auto overflow-hidden">
                    <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
                        {peopleToFollow.map((person, index) => (
                            <div key={index} className="w-full flex-shrink-0 p-4">
                                <div className="flex items-center mb-4 pb-16">
                                    <Link to={`/profile?npub=${person.npub}`}>
                                        {person.picture ? (
                                            <img 
                                                src={person.picture} 
                                                alt={`${person.name}'s profile`} 
                                                className="w-16 h-16 rounded-full mr-4"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.onerror = null;
                                                }}
                                            />
                                        ) : (
                                            <UserCircleIcon className="w-16 h-16 text-gray-300 mr-4" />
                                        )}
                                    </Link>
                                    <div>
                                        <span className="font-semibold pr-16">{person.name}</span>
                                        <button 
                                            onClick={() => handleFollow(person)}
                                            className={`ml-4 px-16 py-4 rounded ${
                                                followingList.includes(nip19.decode(person.npub).data as string)
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-blue-500 hover:bg-blue-700 text-white'
                                            }`}
                                            disabled={followingList.includes(nip19.decode(person.npub).data as string)}
                                        >
                                            {followingList.includes(nip19.decode(person.npub).data as string) ? 'Following' : 'Follow'}
                                        </button>
                                    </div>
                                </div>
                                <div 
                                    ref={el => contentRefs.current[index] = el} 
                                    className="overflow-y-auto transition-height duration-300 ease-in-out"
                                >
                                    <p className="text-gray-500">{renderContent(person.content || '')}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <AnimatePresence>
                {showOstrich && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
                        onClick={() => setShowOstrich(false)}
                    >
                        <div className="relative">
                            <img src="/ostrich.png" alt="Ostrich" className="ostrichmax-w-full max-h-full" />
                            <div className="absolute top-0 left-full ml-4 p-32 bg-white rounded-lg shadow-lg speech-bubble">
                                <p className="text-black">
                                    Congratulations on following your first user! Now, go{' '}
                                    <Link to="/" className="text-blue-500 hover:underline">
                                        publish your first note!
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <style>{`
                .speech-bubble::before {
                    content: '';
                    position: absolute;
                    left: -20px;
                    top: 50%;
                    transform: translateY(-50%);
                    border-width: 10px;
                    border-style: solid;
                    border-color: transparent white transparent transparent;
                }
                .ostrich {
                    max-width: 100%;
                    max-height: 100%;
                }
                @media (max-width: 768px) {
                    .ostrich {
                        display: none;
                    }
                    .speech-bubble {
                        position: static;
                        width: 90% !important;
                        margin: 0 auto;
                    }
                    .speech-bubble::before {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
}

export default PeopleToFollow;