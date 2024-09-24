import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import Loading from './Loading';
import { getFollowing } from '../utils/profileUtils';
import { bech32Decoder } from '../utils/helperFunctions';
import { RELAYS } from '../utils/constants';

interface SocialGraphProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

const SocialGraph: React.FC<SocialGraphProps> = ({ keyValue, pool, nostrExists }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const networkRef = useRef<HTMLDivElement>(null);
  const [_network, setNetwork] = useState<Network | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: any; edges: any } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!pool) {
        setError('Pool is not initialized');
        setLoading(false);
        return;
      }
    
      try {
        const userPubkey = await getCurrentUserPubkey();
        const following = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, null);
    
        const uniqueFollowing = Array.from(new Set(following));
        const allPubkeys = [userPubkey, ...uniqueFollowing];
    
        const metadata = await fetchMetadata(allPubkeys);
    
        const nodes = new DataSet();
        
        // Add the user node if it doesn't exist
        if (!nodes.get(userPubkey)) {
          nodes.add({
            id: userPubkey,
            label: `${metadata[userPubkey]?.name || 'Unknown'} (You)`,
            shape: 'circularImage',
            image: metadata[userPubkey]?.picture || 'default-profile-picture.jpg',
            size: 30,
            font: { color: 'white' }
          } as any);
        }
        
        // Add following nodes if they don't exist
        uniqueFollowing.forEach((pubkey: string) => {
          if (!nodes.get(pubkey)) {
            nodes.add({
              id: pubkey,
              label: metadata[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
              shape: 'circularImage',
              image: metadata[pubkey]?.picture || 'default-profile-picture.jpg',
              size: 20,
              font: { color: 'white' }
            } as any);
          }
        });
    
        const edges = new DataSet(
          uniqueFollowing.map((pubkey: string) => ({ from: userPubkey, to: pubkey, id: `${userPubkey}-${pubkey}` }))
        );


        uniqueFollowing.forEach(async (pubkey: string) => {
          /*getFollowing(pool, true, nostrExists ?? false, pubkey, () => {}, null).then(followingOfFollowing => {
            followingOfFollowing.forEach(followedPubkey => {
              if (!nodes.get(followedPubkey)) {
                nodes.add({
                  id: followedPubkey,
                  label: metadata[followedPubkey]?.name || nip19.npubEncode(followedPubkey).slice(0, 8),
                  shape: 'circularImage',
                  image: metadata[followedPubkey]?.picture || 'default-profile-picture.jpg',
                  size: 15,
                  font: { color: 'white' }
                } as any);
              }
              if (!edges.get(`${pubkey}-${followedPubkey}`)) {
                edges.add({ from: pubkey, to: followedPubkey, id: `${pubkey}-${followedPubkey}` });
              }
            });
          });*/
          const followingFollowing = await getFollowing(pool, true, nostrExists ?? false, pubkey, () => {}, pubkey);
          // Limit to the first 5 following
          const limitedFollowingFollowing = followingFollowing;//.slice(0, 6);
          limitedFollowingFollowing.forEach(followingFollowingPubkey => {
            if (!nodes.get(followingFollowingPubkey) && pubkey !== followingFollowingPubkey) {
              nodes.add({
                id: pubkey + "_" + followingFollowingPubkey,
                label: metadata[followingFollowingPubkey]?.name || nip19.npubEncode(followingFollowingPubkey).slice(0, 8),
                shape: 'circularImage',
                image: metadata[followingFollowingPubkey]?.picture || 'default-profile-picture.jpg',
                size: 15,
                font: { color: 'white' }
              } as any)
            }
            if (!edges.get(pubkey + "_" + followingFollowingPubkey) && pubkey !== followingFollowingPubkey) {
              edges.add({ from: pubkey, to: pubkey + "_" + followingFollowingPubkey, id: pubkey + "-" + followingFollowingPubkey });
            }
          })
        })

    
        setGraphData({ nodes, edges });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Error fetching data');
        setLoading(false);
      }
    };

    fetchData();
  }, [pool, keyValue]);

  useEffect(() => {
    if (graphData && networkRef.current) {
      /*const options = {
        nodes: {
          shape: 'circularImage',
          borderWidth: 2,
          borderWidthSelected: 4,
          size: 30,
          font: { color: 'white' }
        },
        edges: {
          width: 1,
        },
        physics: {
          stabilization: false,
        },
      };*/
      const options = {
        nodes: {
          shape: 'circularImage',
          borderWidth: 2,
          borderWidthSelected: 4,
          size: 30,
          font: { color: 'white' }
        },
        edges: {
          width: 1,
          color: { color: 'rgba(255,255,255,0.5)' }
        },
        physics: {
          stabilization: false,
          barnesHut: {
            gravitationalConstant: -80000,
            springConstant: 0.001,
            springLength: 200
          }
        }
      };

      const container = networkRef.current;
      const newNetwork = new Network(container, graphData, options);
      setNetwork(newNetwork);
    }
  }, [graphData]);

  const getCurrentUserPubkey = async () => {
    if (nostrExists) {
      return await (window as any).nostr.getPublicKey();
    } else {
      const skDecoded = bech32Decoder('nsec', keyValue);
      return getPublicKey(skDecoded);
    }
  };

  const fetchMetadata = async (pubkeys: string[]) => {
    const metadata: { [key: string]: any } = {};
    await new Promise<void>((resolve) => {
      pool?.subscribeManyEose(
        RELAYS,
        [{ kinds: [0], authors: pubkeys }],
        {
          onevent(event) {
            try {
              const eventMetadata = JSON.parse(event.content);
              metadata[event.pubkey] = {
                name: eventMetadata.name || 'Unknown',
                picture: eventMetadata.picture || ''
              };
            } catch (error) {
              console.error("Error parsing metadata:", error);
            }
          },
          onclose() {
            resolve();
          }
        }
      );
    });
    return metadata;
  };

  if (loading) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="py-16">
      <div ref={networkRef} style={{ height: '600px', width: '100%' }}></div>
    </div>
  );
};

export default SocialGraph;