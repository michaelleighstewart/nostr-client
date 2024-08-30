
import { useEffect } from "react";
import { SimplePool } from "nostr-tools";
import { RELAYS } from "../utils/constants";

interface PeopleToFollowProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
}

/*interface Person {
    name: string;
    npub: string;
}*/

const PeopleToFollow : React.FC<PeopleToFollowProps> = (props: PeopleToFollowProps) => {
    //const [peopleToFollow, setPeopleToFollow] = useState<Person[]>([]);
    //const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!props.pool) return;

        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        props.pool.subscribeMany(
            RELAYS, 
            [{ kinds: [1], since: oneDayAgo, '#t': ['bitcoin', 'btc'] }],
            {
                onevent(event) {
                    // Handle events with bitcoin-related tags
                    // Process the bitcoin-related event
                    console.log('Bitcoin-related event:', event);
                }
            }
        );  

    }, [props.pool, props.keyValue]);


    return (
        <div className="py-64">

        </div>
    );
}

export default PeopleToFollow;