import { SimplePool } from "nostr-tools";
import { RELAYS } from "./constants";

interface BYOAlgo {
    byoDegrees: number;
    byoPosts: boolean;
    byoReposts: boolean;
    byoReplies: boolean;
}

interface FollowingStructure {
    id: string;
    following: string[];
}

interface FilterAndFollowing {
    filter: any;
    followingStructure: FollowingStructure[];
}

export async function constructFilterFromBYOAlgo(byoAlgo: BYOAlgo | null, followers: string[], since: number,
    pool: SimplePool
): Promise<FilterAndFollowing> {
    const filter: any = {
        kinds: [],
        authors: followers,
        limit: 10,
        since,
    };

    if (!byoAlgo) {
        filter.kinds = [1, 5, 6];
        return { filter, followingStructure: [] };
    }

    if (byoAlgo.byoPosts) filter.kinds.push(1);
    if (byoAlgo.byoReposts) filter.kinds.push(6);
    if (byoAlgo.byoReplies) filter.kinds.push(1);
    filter.kinds.push(5);

    if (filter.kinds.length === 0) filter.kinds.push(1);

    let followingStructure: FollowingStructure[] = [];

    if (byoAlgo.byoDegrees > 1) {
        console.log(`Fetching followers up to ${byoAlgo.byoDegrees} degrees of separation`);
        
        const getFollowing = async (pubkey: string): Promise<string[]> => {
            return new Promise((resolve) => {
                const following: string[] = [];
                pool.subscribeManyEose(
                    RELAYS,
                    [{ kinds: [3], authors: [pubkey] }],
                    {
                        onevent(event) {
                            const newFollowing = event.tags
                                .filter(tag => tag[0] === 'p')
                                .map(tag => tag[1]);
                            following.push(...newFollowing);
                        },
                        onclose() {
                            resolve(following);
                        }
                    }
                );
            });
        };

        const allFollowers = new Set(followers);

        for (const follower of followers) {
            const secondDegreeFollowing = await getFollowing(follower);
            followingStructure.push({
                id: follower,
                following: secondDegreeFollowing
            });
            secondDegreeFollowing.forEach(f => allFollowers.add(f));
        }

        filter.authors = Array.from(allFollowers);
    }

    return { filter, followingStructure };
}