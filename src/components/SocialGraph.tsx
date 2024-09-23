import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import Loading from './Loading';
import { getFollowing } from '../utils/profileUtils';
import { bech32Decoder } from '../utils/helperFunctions';

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

        const nodes = new DataSet([
          { id: userPubkey, label: 'You', color: '#535bf2' },
          ...following.map((pubkey: string) => ({ id: pubkey, label: nip19.npubEncode(pubkey).slice(0, 8) })),
        ]);

        const edges = new DataSet([
          ...following.map((pubkey: string) => ({ from: userPubkey, to: pubkey, id: `${userPubkey}-${pubkey}` }))
        ]);

        const data = { nodes, edges };

        const options = {
          nodes: {
            shape: 'dot',
            size: 10,
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

        // Append the container to the document body or another existing element
        document.body.appendChild(container);

        const newNetwork = new Network(container, data, options);
        setNetwork(newNetwork);

        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Error fetching data');
        setLoading(false);
      }
    };

    fetchData();
  }, [pool, keyValue, nostrExists]);

  const getCurrentUserPubkey = async () => {
    if (nostrExists) {
      return await (window as any).nostr.getPublicKey();
    } else {
      const skDecoded = bech32Decoder('nsec', keyValue);
      return getPublicKey(skDecoded);
    }
  };

  if (loading) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="py-16">
      <h1 className="text-3xl font-bold mb-4">Social Graph</h1>
      <div ref={networkRef}></div>
    </div>
  );
};

export default SocialGraph;