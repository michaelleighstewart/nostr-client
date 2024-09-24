import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [network, setNetwork] = useState<Network | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: any; edges: any } | null>(null);
  const [followingFollowingData, setFollowingFollowingData] = useState<{[key: string]: string[]}>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [metadata, setMetadata] = useState<{[key: string]: any}>({});
  const [progress, setProgress] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  const updateGraph = useCallback(() => {
    if (!graphData) return;
  
    // Remove all followingFollowing nodes and edges
    const nodesToRemove = graphData.nodes.get().filter((node: { id: string | string[]; }) => node.id.includes("_")).map((node: { id: any; }) => node.id);
    const edgesToRemove = graphData.edges.get().filter((edge: { id: string | string[]; }) => edge.id.includes("_")).map((edge: { id: any; }) => edge.id);
    graphData.nodes.remove(nodesToRemove);
    graphData.edges.remove(edgesToRemove);
  
    // Add nodes and edges for expanded nodes
    expandedNodes.forEach(nodeId => {
      if (followingFollowingData[nodeId]) {
        followingFollowingData[nodeId].forEach(pubkey => {
          const existingNode = graphData.nodes.get(pubkey);
          if (existingNode) {
            // If the node already exists, just add an edge
            graphData.edges.add({
              from: nodeId,
              to: pubkey,
              id: nodeId + "-" + pubkey
            });
          } else {
            // If the node doesn't exist, create a new node and edge
            graphData.nodes.add({
              id: pubkey,
              label: metadata[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
              shape: 'circularImage',
              image: metadata[pubkey]?.picture || 'default-profile-picture.jpg',
              size: 15,
              font: { color: 'white' }
            });
            graphData.edges.add({
              from: nodeId,
              to: pubkey,
              id: nodeId + "-" + pubkey
            });
          }
        });
      }
    });
  }, [graphData, expandedNodes, followingFollowingData, metadata]);
  
  useEffect(() => {
    updateGraph();
  }, [expandedNodes, updateGraph, metadata]);

  const handleClick = useCallback((params: any) => {
    const nodeId = params.nodes[0];
    if (nodeId && followingFollowingData[nodeId]) {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
    }
  }, [followingFollowingData]);
  
  useEffect(() => {
    if (network && graphData) {
      network.on("click", handleClick);
    }
    return () => {
      if (network) {
        network.off("click", handleClick);
      }
    };
  }, [network, graphData, handleClick]);

  useEffect(() => {
    const fetchData = async () => {
      if (!pool) {
        setError('Pool is not initialized');
        setLoading(false);
        return;
      }

      const followingFollowingMap: {[key: string]: string[]} = {};
    
      try {
        const userPubkey = await getCurrentUserPubkey();
        //console.log("getting following for", keyValue);
        const following = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, null);
    
        const uniqueFollowing = Array.from(new Set(following));
        console.log("got unique following", uniqueFollowing)

        await Promise.all(
          uniqueFollowing.map(async (pubkey) => {
            //console.log("getting following following for", pubkey)
            let followers = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, pubkey);
            console.log("got following following", followers);
            // Remove the current pubkey from followers
            followers = followers.filter(follower => follower !== pubkey);
            console.log("filtered", followers)
            followingFollowingMap[pubkey] = followers;
          })
        );
      
        setFollowingFollowingData(followingFollowingMap);

        const allPubkeys = new Set([userPubkey, ...uniqueFollowing]);
        Object.values(followingFollowingMap).forEach(followers => {
          followers.forEach(follower => allPubkeys.add(follower));
        });
    
        setTotalUsers(allPubkeys.size);
        const metadataRetrieved = await fetchMetadata(Array.from(allPubkeys));
        setMetadata(metadataRetrieved);

        const nodes = new DataSet();
        
        // Add the user node if it doesn't exist
        if (!nodes.get(userPubkey)) {
          nodes.add({
            id: userPubkey,
            label: `${metadataRetrieved[userPubkey]?.name || 'Unknown'} (You)`,
            shape: 'circularImage',
            image: metadataRetrieved[userPubkey]?.picture || 'default-profile-picture.jpg',
            size: 30,
            font: { color: 'white' }
          } as any);
        }
        
        // Add following nodes if they don't exist
        uniqueFollowing.forEach((pubkey: string) => {
          if (!nodes.get(pubkey)) {
            nodes.add({
              id: pubkey,
              label: metadataRetrieved[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
              shape: 'circularImage',
              image: metadataRetrieved[pubkey]?.picture || 'default-profile-picture.jpg',
              size: 20,
              font: { color: 'white' }
            } as any);
          }
        });
    
        let edgesSet = uniqueFollowing.map((pubkey: string) => ({ from: userPubkey, to: pubkey, id: `${userPubkey}-${pubkey}` }));
        console.log("edgesset", edgesSet);
        const edges = new DataSet(
          uniqueFollowing.map((pubkey: string) => ({ from: userPubkey, to: pubkey, id: `${userPubkey}-${pubkey}` }))
        );
    
        setGraphData({ nodes, edges });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Error fetching data');
        setLoading(false);
      }
    };

    fetchData();
  }, [pool, keyValue, metadata]);

  useEffect(() => {
    if (graphData && networkRef.current) {
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
        },
        interaction: {
          hover: true,
          hoverConnectedEdges: true,
          selectConnectedEdges: true,
        }
      };

      const container = networkRef.current;
      const newNetwork = new Network(container, graphData, options);
      setNetwork(newNetwork);
    }
  }, [graphData, metadata]);

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
    const chunkSize = 100; // Adjust this value based on your needs
  
    const chunks = [];
    for (let i = 0; i < pubkeys.length; i += chunkSize) {
      chunks.push(pubkeys.slice(i, i + chunkSize));
    }
  
    for (const chunk of chunks) {
      await new Promise<void>((resolve) => {
        pool?.subscribeManyEose(
          RELAYS,
          [{ kinds: [0], authors: chunk }],
          {
            onevent(event) {
              try {
                if (!metadata[event.pubkey]) {
                  const eventMetadata = JSON.parse(event.content);
                  metadata[event.pubkey] = {
                    name: eventMetadata.name || 'Unknown',
                    picture: eventMetadata.picture || ''
                  };
                  setProgress(prev => prev + 1);
                }
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
    }
    return metadata;
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <Loading vCentered={false} />
        <p className="mt-2 text-sm text-gray-500">
          {progress && totalUsers && ((progress / totalUsers) * 100) > 100
            ? "Please wait..."
            : `Loading social graph: ${progress && totalUsers && ((progress / totalUsers) * 100).toFixed(1)}%`}
        </p>
      </div>
    );
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