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
    until: number, pool: SimplePool
): Promise<FilterAndFollowing> {
    const filter: any = {
        kinds: [],
        authors: followers,
        limit: 5,
        since,
        until
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
        const allFollowers = new Set(followers);
        const chunkSize = 50;

        for (let i = 0; i < followers.length; i += chunkSize) {
            const chunk = followers.slice(i, i + chunkSize);
            await new Promise<void>((resolve) => {
                const chunkFollowing: Record<string, string[]> = {};
                chunk.forEach(f => { chunkFollowing[f] = []; });
                const sub = pool.subscribeManyEose(
                    RELAYS,
                    [{ kinds: [3], authors: chunk }],
                    {
                        onevent(event) {
                            const newFollowing = event.tags
                                .filter(tag => tag[0] === 'p')
                                .map(tag => tag[1]);
                            if (chunkFollowing[event.pubkey]) {
                                chunkFollowing[event.pubkey].push(...newFollowing);
                            }
                        },
                        onclose() {
                            sub?.close();
                            for (const [pubkey, following] of Object.entries(chunkFollowing)) {
                                followingStructure.push({ id: pubkey, following });
                                following.forEach(f => allFollowers.add(f));
                            }
                            resolve();
                        }
                    }
                );
            });
        }

        filter.authors = Array.from(allFollowers);
    }

    return { filter, followingStructure };
}