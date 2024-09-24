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
    
        const data = { nodes, edges };
    
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
          },
          physics: {
            stabilization: false,
          },
        };
    
        // Create a new div element to hold the network
        const container = document.createElement('div');
        container.style.height = '600px';
        container.style.width = '100%';
    
        // Append the container to the networkRef element
        if (networkRef.current) {
          networkRef.current.appendChild(container);
        }
    
        const newNetwork = new Network(container, {
          nodes: data.nodes.get(),
          edges: data.edges.get()
        }, options);
        setNetwork(newNetwork);
    
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Error fetching data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
      <div ref={networkRef}></div>
    </div>
  );
};

export default SocialGraph;