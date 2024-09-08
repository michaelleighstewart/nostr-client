import { getPublicKey, SimplePool, Event } from "nostr-tools";
import { bech32Decoder } from "./helperFunctions";
import { RELAYS } from "./constants";
import { ExtendedEvent, Metadata, Reaction, ProfileData } from "./interfaces";

export const getFollowers = async (pool: SimplePool, isLoggedIn: boolean, nostrExists: boolean | null, keyValue: string | null, 
  setUserPublicKey: (pk: string) => void): Promise<string[]> => {
    if (!isLoggedIn) return [];
      
    let pk: string = "";
    let followers: string[] = [];
    if (nostrExists) { 
      try {
        pk = await (window as any).nostr.getPublicKey();
      }
      catch (error) {
        console.log("Error getting public key: ", error);
      }
    }
    else {
      const sk = keyValue;
      if (!sk) {
        return [];
      }
      let skDecoded = bech32Decoder('nsec', sk);
      pk = getPublicKey(skDecoded);
    }
    if (pk && !followers.includes(pk)) followers.push(pk);
    setUserPublicKey(pk);
    return new Promise((resolve) => {
      pool.subscribeManyEose(
        RELAYS,
        [{ authors: [pk], kinds: [3] }],
        {
          onevent(event: Event) {
            followers.push(...event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]));
            resolve(followers);
          },
          onclose() {
            resolve(followers);
          }
        }
      );
    });
}

export const fetchUserMetadata = async (pool: SimplePool, userPublicKey: string, 
  setShowOstrich: (show: boolean) => void, setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>) => {
  if (!pool || !userPublicKey) return;

  const events = await pool.querySync(RELAYS, {
    kinds: [0],
    authors: [userPublicKey],
  });

  if (events.length > 0) {
    const event = events[0];
    const metadata = JSON.parse(event.content) as Metadata;
    setMetadata((cur) => ({
      ...cur,
      [userPublicKey]: metadata,
    }));

    if (!metadata.name) {
      setShowOstrich(true);
    }
  } else {
    setShowOstrich(true);
  }
};


export const fetchPostsForProfile = async (pool: SimplePool | null, _userPublicKey: string, 
  targetNpub: string | null, nostrExists: boolean | null, keyValue: string | null,
  setLoadingPosts: React.Dispatch<React.SetStateAction<boolean>>, 
  setPosts: React.Dispatch<React.SetStateAction<ExtendedEvent[]>>,
  setProfileData: React.Dispatch<React.SetStateAction<ProfileData | null>>, 
  setReactions: React.Dispatch<React.SetStateAction<Record<string, Reaction[]>>>,
  setReplies: React.Dispatch<React.SetStateAction<Record<string, number>>>, 
  setReposts: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>) => {
  setLoadingPosts(true);
  setPosts([]);
  setProfileData(null);
  setReactions({});
  setReplies({});
  setReposts({});
  if (!pool) return;
  let fetchedPubkey: string;
  if (targetNpub) {
      //fetchedPubkey = bech32Decoder("npub", targetNpub).toString('hex');
      fetchedPubkey = targetNpub;
  } else if (nostrExists) {
      fetchedPubkey = await (window as any).nostr.getPublicKey();
  } else if (keyValue) {
      const skDecoded = bech32Decoder("nsec", keyValue);
      fetchedPubkey = getPublicKey(skDecoded);
  } else {
      throw new Error("Unable to fetch public key");
  }

  const posts = await pool.querySync(RELAYS, { kinds: [1, 6], authors: [fetchedPubkey], limit: 20 });
  if (posts.length === 0) {
    setLoadingPosts(false);
    return;
  }
  const filteredPostsOG = posts.filter(event => event.kind === 1 && !event.tags.some(tag => tag[0] === 'e'));
  const filteredPostsReposts = posts.filter(event => event.kind === 6);
  const filteredPostsReplies = posts.filter(event => event.kind === 1 && event.tags.some(tag => tag[0] === 'e'));

  // Fetch reposted events
  const repostedEventIds = filteredPostsReposts
    .map(post => {
      try {
        return post.content ? JSON.parse(post.content).id : null;
      } catch (error) {
        console.error("Error parsing repost content:", error);
        return null;
      }
    })
    .filter((id): id is string => id !== null);
  const repostedEvents = await pool.querySync(RELAYS, { ids: repostedEventIds });

  // Create a map of reposted events for quick lookup
  const repostedEventsMap = new Map(repostedEvents.map(event => [event.id, event]));

  // Fetch replied events
  const repliedEventIds = filteredPostsReplies
    .map(post => post.tags.find(tag => tag[0] === 'e')?.[1])
    .filter((id): id is string => id !== null);
  const repliedEvents = await pool.querySync(RELAYS, { ids: repliedEventIds });

  // Create a map of replied events for quick lookup
  const repliedEventsMap = new Map(repliedEvents.map(event => [event.id, event]));

  // Set posts
  setPosts([...filteredPostsOG, ...filteredPostsReposts, ...filteredPostsReplies]
      .map(post => {
          const extendedPost: ExtendedEvent = {
              ...post,
              deleted: false,
              repostedEvent: post.kind === 6 && post.content !== "" ? {
                  ...JSON.parse(post.content),
                  content: repostedEventsMap.get(JSON.parse(post.content).id)?.content || ""
              } : null,
              content: post.kind === 6 ? "" : post.content,
              repliedEvent: post.kind === 1 && post.tags.some(tag => tag[0] === 'e') ? 
                repliedEventsMap.get(post.tags.find(tag => tag[0] === 'e')?.[1] || '') || null : null
          } as ExtendedEvent;
          const extendedPostWithNullChecks: ExtendedEvent = {
              ...extendedPost,
              repostedEvent: extendedPost.repostedEvent ? {
                  ...extendedPost.repostedEvent,
                  content: extendedPost.repostedEvent.content || ""
              } : null,
              repliedEvent: extendedPost.repliedEvent || null
          };
          return extendedPostWithNullChecks;
      })
      .sort((a, b) => {
          const timeA = a.repostedEvent ? a.repostedEvent.created_at : a.created_at;
          const timeB = b.repostedEvent ? b.repostedEvent.created_at : b.created_at;
          return timeB - timeA;
      })
      .slice(0, 10)
  );

  setLoadingPosts(false);
  const postIdsOG = filteredPostsOG.map(post => post.id);
  const reactionsPostsOG = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [7],
              '#e': postIdsOG,
          }
      ],
      {
          onevent(event) {
              const reaction: Reaction = {
                  id: event.id,
                  liker_pubkey: event.pubkey,
                  type: event.content,
                  sig: event.sig
              };
              setReactions(prevReactions => {
                  const existingReactions = prevReactions[event.tags.find(tag => tag[0] === 'e')?.[1] || ''] || [];
                  const eventId = event.tags.find(tag => tag[0] === 'e')?.[1] || '';
                  if (eventId && !existingReactions.some(r => r.liker_pubkey === reaction.liker_pubkey)) {
                      return {
                          ...prevReactions,
                          [eventId]: [...existingReactions, reaction]
                      };
                  }
                  return prevReactions;
              });
          }
      },
  );
  const replySubscription = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [1],
              '#e': postIdsOG,  
          }
      ],
      {
          onevent(event) {
            setReplies(cur => {
              const updatedReplies = { ...cur };
              const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
              if (postId) {
                  updatedReplies[postId] = (updatedReplies[postId] || 0) + 1;
              }
              return updatedReplies;
          });
          }
      }
  );
  const filteredPostsRepostsToSearch: string[] = [];
  const filteredPostsRepostsPubkeys: string[] = [];
  filteredPostsReposts.forEach(post => {
    
      const repostedContent = post.content ? JSON.parse(post.content) : "";
      filteredPostsRepostsToSearch.push(repostedContent.id);
      filteredPostsRepostsPubkeys.push(repostedContent.pubkey);
  });

  const metadataPostsReposts = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [0],
              authors: filteredPostsRepostsPubkeys,
          }
      ],
      {
          onevent(event) {
              const metadata: Metadata = JSON.parse(event.content);
              setMetadata(prevMetadata => ({
                  ...prevMetadata,
                  [event.pubkey]: metadata
              }));
          }
      }
  );  

  const reactionsPostsReposts = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [7],
              '#e': filteredPostsRepostsToSearch,
          }
      ],
      {
          onevent(event) {
              const reaction: Reaction = {
                  id: event.id, 
                  liker_pubkey: event.pubkey,
                  type: event.content,
                  sig: event.sig
              };
              setReactions(prevReactions => {
                  const existingReactions = prevReactions[event.tags.find(tag => tag[0] === 'e')?.[1] || ''] || [];
                  const eventId = event.tags.find(tag => tag[0] === 'e')?.[1] || '';
                  if (eventId && !existingReactions.some(r => r.liker_pubkey === reaction.liker_pubkey)) {
                      return {
                          ...prevReactions,
                          [eventId]: [...existingReactions, reaction]
                      };
                  }
                  return prevReactions;
              });
          }
      }

      
  );

  const repliesPostsReposts = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [1],
              '#e': filteredPostsRepostsToSearch,
          }
      ],
      {
          onevent(event) {
            setReplies(cur => {
              const updatedReplies = { ...cur };
              const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
              if (postId) {
                  updatedReplies[postId] = (updatedReplies[postId] || 0) + 1;
              }
              return updatedReplies;
          });
          }
      }
  );

  const filteredPostsRepliesToSearch: string[] = [];
  const filteredPostsRepliesPubkeys: string[] = [];
  filteredPostsReplies.forEach(post => {
    const replyToTag = post.tags.find(tag => tag[0] === 'e');
    if (replyToTag && replyToTag[1]) {
      filteredPostsRepliesToSearch.push(replyToTag[1]);
    }
    if (post.pubkey) {
      filteredPostsRepliesPubkeys.push(post.pubkey);
    }
  });

  const metadataPostsReplies = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [0],
              authors: filteredPostsRepliesPubkeys,
          }
      ],  
      {
          onevent(event) {
              const metadata: Metadata = JSON.parse(event.content);
              setMetadata(prevMetadata => ({
                  ...prevMetadata,
                  [event.pubkey]: metadata
              }));
          }
      } 
  );  

  const reactionsPostsReplies = pool.subscribeManyEose(
      RELAYS,
      [
          {
              kinds: [7],
              '#e': filteredPostsRepliesToSearch,
          }
      ],  
      {
          onevent(event) {
              const reaction: Reaction = {
                  id: event.id, 
                  liker_pubkey: event.pubkey,
                  type: event.content,
                  sig: event.sig
              };    
              setReactions(prevReactions => {
                  const existingReactions = prevReactions[event.tags.find(tag => tag[0] === 'e')?.[1] || ''] || [];
                  const eventId = event.tags.find(tag => tag[0] === 'e')?.[1] || '';
                  if (eventId && !existingReactions.some(r => r.liker_pubkey === reaction.liker_pubkey)) {
                      return {
                          ...prevReactions,
                          [eventId]: [...existingReactions, reaction]
                      };
                  }
                  return prevReactions;
              });
          }
      }
  );  

  return () => {
      reactionsPostsOG?.close();
      reactionsPostsReposts?.close();
      reactionsPostsReplies?.close();
      replySubscription?.close();
      metadataPostsReposts?.close();
      repliesPostsReposts?.close();
      metadataPostsReplies?.close();
      setLoadingPosts(false);
  };
}