import { SimplePool } from "nostr-tools";
import { RELAYS } from "./constants";

interface BYOAlgo {
    byoDegrees: number;
    byoPosts: boolean;
    byoReposts: boolean;
    byoReplies: boolean;
    byoReactions: boolean;
  }
  
  export async function constructFilterFromBYOAlgo(byoAlgo: BYOAlgo | null, followers: string[], since: number,
    pool: SimplePool
  ): Promise<any> {
    if (!byoAlgo) {
      return { kinds: [1, 5, 6], authors: followers, limit: 10, since };
    }
  
    const kinds = [];
    if (byoAlgo.byoPosts) kinds.push(1);
    if (byoAlgo.byoReposts) kinds.push(6);
    if (byoAlgo.byoReplies) kinds.push(1); // Replies are also kind 1
    if (byoAlgo.byoReactions) kinds.push(7);
  
    // If no kinds are selected, default to posts
    if (kinds.length === 0) kinds.push(1);
  
    const filter: any = {
      kinds,
      authors: followers,
      limit: 10,
      since,
    };
  
    if (byoAlgo.byoDegrees > 1) {
      console.log(`Fetching followers up to ${byoAlgo.byoDegrees} degrees of separation`);
      const getFollowersOfFollowers = async (pool: SimplePool, initialFollowers: string[], degrees: number): Promise<string[]> => {
        let allFollowers = new Set(initialFollowers);
        let currentDegree = 1;
        let currentFollowers = initialFollowers;

        while (currentDegree < degrees) {
          const followersPromises = currentFollowers.map(pubkey => 
            new Promise<string[]>((resolve) => {
              let followersToAdd: any[] = [];
              pool.subscribeManyEose(
                RELAYS,
                [
                    {
                        kinds: [0],
                        authors: [pubkey],
                    }
                ],
                {
                    onevent(event) {
                        followersToAdd.push(event);
                    },
                    onclose() {
                        resolve(followersToAdd);
                    }
                }
              );
            })
          );

          const newFollowers = await Promise.all(followersPromises);
          newFollowers.flat().forEach(follower => allFollowers.add(follower));
          
          currentFollowers = Array.from(allFollowers);
          currentDegree++;
        }

        return Array.from(allFollowers);
      };

      // Use the function to get all followers up to the specified degree
      const allFollowers = await getFollowersOfFollowers(pool, followers, byoAlgo.byoDegrees);
      filter.authors = allFollowers;
    }
  
    return filter;
  }