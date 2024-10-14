import { useEffect, useState, useRef } from "react";
import { SimplePool, finalizeEvent, getPublicKey, nip19 } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import { bech32Decoder } from "../utils/helperFunctions";
import Loading from "./Loading";
import { Link, useLocation } from "react-router-dom";
import { UserCircleIcon, UserPlusIcon, UserMinusIcon } from '@heroicons/react/24/solid';
import Ostrich from "./Ostrich";
import { API_URLS } from "../utils/apiConstants";
import { getUserPublicKey } from "../utils/profileUtils";
import { handleFollow } from "../utils/followUtils";

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

interface Metadata {
    name: string;
    picture?: string;
}

const PeopleToFollow : React.FC<PeopleToFollowProps> = (props: PeopleToFollowProps) => {
    const [peopleToFollow, setPeopleToFollow] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [followingList, setFollowingList] = useState<string[]>([]);
    const [selectedHashtag, setSelectedHashtag] = useState<string>("");
    const [customHashtag, setCustomHashtag] = useState<string>("");
    const [searchingPeople, setSearchingPeople] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hashtags, setHashtags] = useState<string[]>(["bitcoin", "btc", "nostr", "crypto", "food", "travel"]);
    const carouselRef = useRef<HTMLDivElement>(null);
    const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [showOstrich, setShowOstrich] = useState(false);
    const location = useLocation();
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const poolRef = useRef(props.pool);
    const keyValueRef = useRef(props.keyValue);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const hashtagParam = params.get('hashtag');
        if (hashtagParam) {
            setHashtags(prevHashtags => {
                if (!prevHashtags.includes(hashtagParam)) {
                    return [...prevHashtags, hashtagParam];
                }
                return prevHashtags;
            });
            setSelectedHashtag(hashtagParam);
        } else if (selectedHashtag === "") {
            setSelectedHashtag("bitcoin");
        }
    }, [location]);

    async function fetchFollowingList() {
        if (!poolRef.current) return;
        const pubkey = await getUserPublicKey(props.nostrExists ?? false, keyValueRef.current);
        
        const followingListSubscription = poolRef.current.subscribeManyEose(
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

    useEffect(() => { 
        if (!props.pool || peopleToFollow.length === 0) return;
        
        const fetchMetadata = async () => {
            const authors = peopleToFollow.map(person => nip19.decode(person.npub).data as string);
            const newAuthors = authors.filter(author => !metadata[author]);
            
            if (newAuthors.length === 0) return;
    
            await props.pool!.subscribeManyEose(RELAYS,     
                [{ kinds: [0], authors: newAuthors }],
                {
                    onevent(event) {
                        const pubkey = event.pubkey;
                        const eventMetadata = JSON.parse(event.content);
                        setMetadata(prev => ({
                            ...prev,
                            [pubkey]: {
                                name: eventMetadata.name || 'Unknown',
                                picture: eventMetadata.picture
                            }
                        }));
                    },
                    onclose() {
                        setLoading(false);
                    }
                }
            );
        };
    
        fetchMetadata();
    }, [peopleToFollow, props.pool]);
    
    useEffect(() => {
        setPeopleToFollow(prev => prev.map(person => {
            const pubkey = nip19.decode(person.npub).data as string;
            const personMetadata = metadata[pubkey];
            return personMetadata ? {
                ...person,
                name: personMetadata.name || person.name,
                picture: personMetadata.picture || person.picture
            } : person;
        }));
    }, [metadata]);

    async function setupFollowingList() {
        if (!poolRef.current) return;
    
        setPeopleToFollow([]);
        setSearchingPeople(true);
        
        const peopleSubscription = poolRef.current.subscribeManyEose(RELAYS, 
            [{ kinds: [1], limit: 5, '#t': [selectedHashtag] }],
            {
                onevent(event) {
                    const npub = nip19.npubEncode(event.pubkey);
                    const pubkey = event.pubkey;
                    setPeopleToFollow(prev => {
                        if (!prev.some(p => p.npub === npub)) {
                            const existingMetadata = metadata[pubkey];
                            return [...prev, {
                                name: existingMetadata?.name || 'Unknown',
                                npub: npub,
                                loadingFollowing: false,
                                content: event.content,
                                picture: existingMetadata?.picture
                            }];
                        }
                        return prev;
                    });
                },
                onclose() {
                    setSearchingPeople(false);
                }
            }
        );
    
        return () => {
            peopleSubscription?.close();
        };
    }

    useEffect(() => {
        poolRef.current = props.pool;
        keyValueRef.current = props.keyValue;
        setupFollowingList();
        fetchFollowingList();
    }, [selectedHashtag, props.nostrExists]);

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

    const handleFollowClick = async (person: Person) => {
        if (!props.pool || !props.keyValue) return;
        person.loadingFollowing = true;
        /*const event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string; sig?: string } = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...followingList.map(npub => ['p', npub]), ['p', nip19.decode(person.npub).data as string]],
            content: '',
        };
    
        try {
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
    
            // Call the batch-processor API
            const currentUserPubkey = props.nostrExists 
            ? await (window as any).nostr.getPublicKey()
            : getPublicKey(bech32Decoder("nsec", props.keyValue));
        
            const response = await fetch(API_URLS.API_URL + 'batch-processor', {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                   type: 'social_graph_processor',
                   params: {
                       npub: nip19.npubEncode(currentUserPubkey),
                       to_create: person.npub,
                       fill_missing: false
                   }
               }),
           });
    
           if (!response.ok) {
               throw new Error('Failed to call batch-processor API');
           }
    
        } catch (error) {
            console.error('Error following user or calling batch-processor API:', error);
        }*/
        const success = await handleFollow(props.pool, props.nostrExists ?? false, props.keyValue, person.npub, false, followingList);
        if (success) {
            setFollowingList(prev => {
            const newFollowingList = [...prev, nip19.decode(person.npub).data as string];
            if (prev.length === 0 && newFollowingList.length === 1) {
                setShowOstrich(true);
            }
            return newFollowingList;
            });
        }
        setPeopleToFollow(prev => prev.map(p => p.npub === person.npub ? { ...p, loadingFollowing: false } : p));
    };
    
    const handleUnfollow = async (person: Person) => {
        if (!props.pool || !props.keyValue) return;
        person.loadingFollowing = true;
        const event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string; sig?: string } = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: followingList.filter(npub => npub !== nip19.decode(person.npub).data as string).map(npub => ['p', npub]),
            content: '',
        };
    
        try {
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
            setFollowingList(prev => prev.filter(npub => npub !== nip19.decode(person.npub).data as string));
            setPeopleToFollow(prev => prev.map(p => p.npub === person.npub ? { ...p, loadingFollowing: false } : p));
    
            // Call the batch-processor API
            const currentUserPubkey = props.nostrExists 
            ? await (window as any).nostr.getPublicKey()
            : getPublicKey(bech32Decoder("nsec", props.keyValue));
        
            const response = await fetch(API_URLS.API_URL + 'batch-processor', {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                   type: 'social_graph_processor',
                   params: {
                       npub: nip19.npubEncode(currentUserPubkey),
                       to_remove: person.npub,
                       fill_missing: false
                   }
               }),
           });
    
           if (!response.ok) {
               throw new Error('Failed to call batch-processor API');
           }
    
        } catch (error) {
            console.error('Error unfollowing user or calling batch-processor API:', error);
        }
    }

    const handleCustomHashtagSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (customHashtag.trim()) {
            const newHashtag = customHashtag.trim();
            if (!hashtags.includes(newHashtag)) {
                setHashtags(prevHashtags => [...prevHashtags, newHashtag]);
            }
            setSelectedHashtag(newHashtag);
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
        return (<div className="h-screen"><Loading vCentered={false} /></div>);
    }

    return (
        <div className="py-64 overflow-x-hidden">
            <div className="flex flex-col items-center mb-8">
                <div className="flex flex-wrap justify-center gap-2 mb-6 px-4">
                    {hashtags.map((hashtag) => (
                        <button
                            key={hashtag}
                            onClick={() => setSelectedHashtag(hashtag)}
                            className={`px-4 py-2 rounded text-sm ${
                                selectedHashtag === hashtag
                                    ? 'text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            #{hashtag}
                        </button>
                    ))}
                </div>
                <form onSubmit={handleCustomHashtagSubmit} className="flex pb-32 w-full max-w-md px-4">
                    <input
                        type="text"
                        value={customHashtag}
                        onChange={(e) => setCustomHashtag(e.target.value)}
                        placeholder="Enter custom hashtag"
                        className="px-4 py-2 flex-grow border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 text-white rounded-r whitespace-nowrap"
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
                <div className="relative w-full max-w-3xl mx-auto">
                    <div className="flex justify-center mb-4">
                        {peopleToFollow.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentIndex(index)}
                                className={`h-3 w-3 rounded-full mx-1 ${
                                    currentIndex === index ? 'bg-blue-500' : 'bg-gray-300'
                                }`}
                                aria-label={`Go to slide ${index + 1}`}
                            />
                        ))}
                    </div>
                    <div ref={carouselRef} className="overflow-hidden">
                        <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
                            {peopleToFollow.map((person, index) => (
                                <div key={index} className="w-full flex-shrink-0 p-4">
                                    <div className="flex items-center mb-4 pb-16">
                                        <Link to={`/profile/${person.npub}`}>
                                            {person.picture ? (
                                                <img 
                                                    src={person.picture} 
                                                    alt={`${person.name}'s profile`} 
                                                    className="w-64 h-64 rounded-full mr-4"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.onerror = null;
                                                        target.src = '/ostrich.png';
                                                    }}
                                                />
                                            ) : (
                                                <UserCircleIcon className="w-64 h-64 text-gray-300 mr-4" />
                                            )}
                                        </Link>
                                        <div className="flex-grow flex items-center justify-between">
                                            <span className="font-semibold">{person.name}</span>
                                            <button 
                                                onClick={() => followingList.includes(nip19.decode(person.npub).data as string) ? handleUnfollow(person) : handleFollowClick(person)}
                                                className={`px-6 py-3 rounded ${
                                                    followingList.includes(nip19.decode(person.npub).data as string)
                                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                                        : 'text-white'
                                                }`}
                                            >
                                                {followingList.includes(nip19.decode(person.npub).data as string) ? (
                                                    <>
                                                        <UserMinusIcon className="h-5 w-5 inline-block mr-2" />
                                                        Unfollow
                                                    </>
                                                ) : (
                                                    <>
                                                        <UserPlusIcon className="h-5 w-5 inline-block mr-2" />
                                                        Follow
                                                    </>
                                                )}
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
                </div>
            )}
            <Ostrich show={showOstrich} onClose={() => setShowOstrich(false)} 
                text="Congratulations on following your first user! Now, go " linkText="publish your first note!" 
                linkUrl="/" />
        </div>
    );
}

export default PeopleToFollow;