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
        const newNodes = followingFollowingData[nodeId].map(pubkey => ({
          id: nodeId + "_" + pubkey,
          label: metadata[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
          //label: nip19.npubEncode(pubkey).slice(0, 8),
          shape: 'circularImage',
          image: metadata[pubkey]?.picture || 'default-profile-picture.jpg',
          //image: 'default-profile-picture.jpg',
          size: 15,
          font: { color: 'white' }
        }));
  
        const newEdges = followingFollowingData[nodeId].map(pubkey => ({
          from: nodeId,
          to: nodeId + "_" + pubkey,
          id: nodeId + "-" + pubkey
        }));
        // Filter out nodes that already exist in graphData.nodes
        const existingNodeIds = new Set(graphData.nodes.getIds());
        const filteredNewNodes = newNodes.filter(node => !existingNodeIds.has(node.id));
        graphData.nodes.add(filteredNewNodes);
        // Filter out edges that already exist in graphData.edges
        const existingEdgeIds = new Set(graphData.edges.getIds());
        const filteredNewEdges = newEdges.filter(edge => !existingEdgeIds.has(edge.id));
        graphData.edges.add(filteredNewEdges);
      }
    });
  }, [graphData, expandedNodes, followingFollowingData]);
  
  useEffect(() => {
    updateGraph();
  }, [expandedNodes, updateGraph]);

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

  //a bit clunky
  /*useEffect(() => {
    if (network && graphData) {
      network.on("zoom", (params) => {
        const scale = params.scale;
        const nodeIds = network.getNodeAt({x: params.pointer.x, y: params.pointer.y}) as string;
  
        if (scale > 1.5 && nodeIds && followingFollowingData[nodeIds]) {
          // Show followingFollowing nodes and edges
          const newNodes = followingFollowingData[nodeIds].map(pubkey => ({
            id: nodeIds + "_" + pubkey,
            //label: metadata[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
            label: nip19.npubEncode(pubkey).slice(0, 8),
            shape: 'circularImage',
            //image: metadata[pubkey]?.picture || 'default-profile-picture.jpg',
            image: 'default-profile-picture.jpg',
            size: 15,
            font: { color: 'white' }
          }));
  
          const newEdges = followingFollowingData[nodeIds].map(pubkey => ({
            from: nodeIds,
            to: nodeIds + "_" + pubkey,
            id: nodeIds + "-" + pubkey
          }));
  
          graphData.nodes.add(newNodes);
          graphData.edges.add(newEdges);
        } else {
          // Hide followingFollowing nodes and edges
          const nodesToRemove = graphData.nodes.get().filter((node: { id: string | string[]; }) => node.id.includes("_")).map((node: { id: any; }) => node.id);
          const edgesToRemove = graphData.edges.get().filter((edge: { id: string | string[]; }) => edge.id.includes("_")).map((edge: { id: any; }) => edge.id);
  
          graphData.nodes.remove(nodesToRemove);
          graphData.edges.remove(edgesToRemove);
        }
      });
    }
  }, [network, graphData, followingFollowingData]);*/

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
        const following = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, null);
    
        const uniqueFollowing = Array.from(new Set(following));

        await Promise.all(
          uniqueFollowing.map(async (pubkey) => {
            let followers = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, pubkey);
            // Remove the current pubkey from followers
            followers = followers.filter(follower => follower !== pubkey);
            followingFollowingMap[pubkey] = followers;
          })
        );
      
        setFollowingFollowingData(followingFollowingMap);

        const allPubkeys = new Set([userPubkey, ...uniqueFollowing]);
        Object.values(followingFollowingMap).forEach(followers => {
          followers.forEach(follower => allPubkeys.add(follower));
        });
    
        const metadata = await fetchMetadata(Array.from(allPubkeys));
        setMetadata(metadata);

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


        /*uniqueFollowing.forEach(async (pubkey: string) => {
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
        })*/

    
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