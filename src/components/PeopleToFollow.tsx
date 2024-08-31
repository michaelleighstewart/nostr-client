import { useEffect, useState } from "react";
import { SimplePool, finalizeEvent } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import { bech32Decoder } from "../utils/helperFunctions";

interface PeopleToFollowProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
}

interface Person {
    name: string;
    npub: string;
    loadingFollowing: boolean;
    picture?: string;
}

const PeopleToFollow : React.FC<PeopleToFollowProps> = (props: PeopleToFollowProps) => {
    const [peopleToFollow, setPeopleToFollow] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [followingList, setFollowingList] = useState<string[]>([]);

    useEffect(() => {
        if (!props.pool || !props.keyValue) return;

        // Fetch the current following list
        const fetchFollowingList = async () => {
            const pubkey = props.nostrExists 
                ? await (window as any).nostr.getPublicKey() 
                : bech32Decoder('npub', props.keyValue);

            props.pool?.subscribeMany(
                RELAYS,
                [{ kinds: [3], authors: [pubkey] }],
                {
                    onevent(event) {
                        console.log("event", event);
                        const following = event.tags
                            .filter(tag => tag[0] === 'p')
                            .map(tag => tag[1]);
                        setFollowingList(following);
                    }
                }
            );
        };

        fetchFollowingList();

        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        props.pool.subscribeMany(
            RELAYS, 
            [{ kinds: [1], since: oneDayAgo, limit: 10, '#t': ['bitcoin', 'btc'] }],
            {
                onevent(event) {
                    const name = event.tags.find(tag => tag[0] === 'name')?.[1] || 'Unknown';
                    const npub = event.pubkey;
                    // Fetch metadata for the poster
                    props.pool?.subscribeMany(
                        RELAYS,
                        [{ kinds: [0], authors: [npub] }],
                        {
                            onevent(metadataEvent) {
                                //console.log("metadataEvent", metadataEvent);
                                try {
                                    const metadata = JSON.parse(metadataEvent.content);
                                    const updatedName = metadata.name || name;
                                    const picture = metadata.picture;
                                    setPeopleToFollow(prev => prev.map(person => 
                                        person.npub === npub 
                                            ? { ...person, name: updatedName, picture } 
                                            : person
                                    ));
                                } catch (error) {
                                    console.error("Error parsing metadata:", error);
                                }
                            }
                        }
                    );
                    setPeopleToFollow(prev => {
                        if (!prev.some(person => person.npub === npub)) {
                            return [...prev, { name, npub, loadingFollowing: false }];
                        }
                        return prev;
                    });
                    setLoading(false);
                }
            }
        );  

    }, [props.pool, props.keyValue, props.nostrExists]);

    const handleFollow = async (person: Person) => {
       if (!props.pool || !props.keyValue) return;
        person.loadingFollowing = true;
        const event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string; sig?: string } = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...followingList.map(npub => ['p', npub]), ['p', person.npub]],
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
        setFollowingList(prev => [...prev, person.npub]);
        setPeopleToFollow(prev => prev.map(p => p.npub === person.npub ? { ...p, loadingFollowing: false } : p));
    };

    if (peopleToFollow.length === 0) {
        return <div className="py-64">
            <p>No people to follow</p>
        </div>
    }

    return (
        <div className="py-64">
            {loading ? (
                <p>Loading...</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {peopleToFollow.map((person, index) => (
                        <div key={index} className="flex flex-col items-center p-4 border rounded-lg shadow-sm">
                            {person.picture ? (
                                <img 
                                    src={person.picture} 
                                    alt={`${person.name}'s profile`} 
                                    className="w-24 h-24 rounded-full mb-2"
                                />
                            ) : (
                                <div className="w-40 h-40 rounded-full bg-gray-200 mb-2"></div>
                            )}
                            <span className="text-center font-semibold mb-2">{person.name}</span>
                            <button 
                                onClick={() => handleFollow(person)}
                                className={`w-full font-bold py-2 px-4 rounded ${
                                    followingList.includes(person.npub)
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-blue-500 hover:bg-blue-700 text-white'
                                }`}
                                disabled={followingList.includes(person.npub)}
                            >
                                {followingList.includes(person.npub) ? 'Following' : 'Follow'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PeopleToFollow;