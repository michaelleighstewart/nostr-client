import { useEffect, useState } from "react";
import { SimplePool, getPublicKey, finalizeEvent } from "nostr-tools";
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
}

const PeopleToFollow : React.FC<PeopleToFollowProps> = (props: PeopleToFollowProps) => {
    const [peopleToFollow, setPeopleToFollow] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!props.pool) return;

        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        props.pool.subscribeMany(
            RELAYS, 
            [{ kinds: [1], since: oneDayAgo, limit: 10, '#t': ['bitcoin', 'btc'] }],
            {
                onevent(event) {
                    const name = event.tags.find(tag => tag[0] === 'name')?.[1] || 'Unknown';
                    //const npub = nip19.npubEncode(event.pubkey);
                    const npub = event.pubkey;
                    setPeopleToFollow(prev => {
                        if (!prev.some(person => person.npub === npub)) {
                            return [...prev, { name, npub }];
                        }
                        return prev;
                    });
                },
                oneose() {
                    setLoading(false);
                }
            }
        );  

    }, [props.pool, props.keyValue]);

    const handleFollow = async (npub: string) => {
        if (!props.pool || !props.keyValue) return;
        const event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey?: string; sig?: string } = {
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', npub]],
            content: '',
        };

        if (props.nostrExists) {
            await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
              await props.pool?.publish(RELAYS, eventToSend);
              //setPosting(false);
            });
        }
        else {
            let sk = props.keyValue;
            let skDecoded = bech32Decoder('nsec', sk);
            let eventFinal = finalizeEvent(event, skDecoded);
            await props.pool?.publish(RELAYS, eventFinal);
            //setPosting(false);
        }
    };

    return (
        <div className="py-64">
            {loading ? (
                <p>Loading...</p>
            ) : (
                <ul>
                    {peopleToFollow.map((person, index) => (
                        <li key={index} className="mb-4">
                            <span>{person.name} ({person.npub})</span>
                            <button 
                                onClick={() => handleFollow(person.npub)}
                                className="ml-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                            >
                                Follow
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default PeopleToFollow;