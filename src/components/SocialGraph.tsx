import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { SimplePool, getPublicKey, nip19 } from 'nostr-tools';
import Loading from './Loading';
import { getFollowing } from '../utils/profileUtils';
import { bech32Decoder } from '../utils/helperFunctions';
import { RELAYS } from '../utils/constants';
import { API_URLS } from '../utils/apiConstants';

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
  const [graphData, setGraphData] = useState<{ nodes: DataSet; edges: DataSet } | null>(null);
  const [followingFollowingData, setFollowingFollowingData] = useState<{[key: string]: string[]}>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [metadata, setMetadata] = useState<{[key: string]: any}>({});
  const [progress, setProgress] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  const isNetworkInitialized = useRef(false);

  const fetchSocialGraphFromAPI = async (npub: string) => {
    try {
      const response = await fetch(`${API_URLS.API_URL}social-graph?npub=${npub}&degrees=2`);
      if (!response.ok) {
        if (response.status === 404) {
          return null; // Graph not found, we'll generate it on the fly
        }
        throw new Error('Failed to fetch social graph');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching social graph:', error);
      return null;
    }
  };

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
            if (!graphData.edges.get(nodeId + "-" + pubkey)) {
              graphData.edges.add({
                from: nodeId,
                to: pubkey,
                id: nodeId + "-" + pubkey
              });
            }
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
        const userNpub = nip19.npubEncode(userPubkey);

        const apiGraphData = await fetchSocialGraphFromAPI(userNpub);

        if (apiGraphData) {
          const nodes = new DataSet();
          const edges = new DataSet();
          const followingFollowingMap: {[key: string]: string[]} = {};
          const metadataMap: {[key: string]: any} = {};
          if (!nodes.get(apiGraphData.user.pubkey)) {
            nodes.add({
              id: apiGraphData.user.pubkey,
              label: apiGraphData.user?.name || nip19.npubEncode(apiGraphData.user.pubkey).slice(0, 8),
              shape: 'circularImage',
              image: apiGraphData.user?.picture || 'default-profile-picture.jpg',
              size: 20,
              font: { color: 'white' }
            } as any);
          }
          metadataMap[apiGraphData.user.pubkey] = {
            name: apiGraphData.user?.name,
            picture: apiGraphData.user?.picture
          };

          // Add first-order follows
          for (const follow of apiGraphData.follows) {
            nodes.add({
              id: follow.pubkey,
              label: follow.name || nip19.npubEncode(follow.pubkey).slice(0, 8),
              shape: 'circularImage',
              image: follow.picture || 'default-profile-picture.jpg',
              size: 20,
              font: { color: 'white' }
            } as any);

            edges.add({
              id: `${apiGraphData.user.pubkey}-${follow.pubkey}`,
              from: apiGraphData.user.pubkey,
              to: follow.pubkey
            } as any);

            metadataMap[follow.pubkey] = {
              name: follow.name,
              picture: follow.picture
            };

            followingFollowingMap[follow.pubkey] = follow.follows.map((ff: { pubkey: any; }) => ff.pubkey);
          }

          // Add second-order follows to metadata but not to graph
          for (const follow of apiGraphData.follows) {
            for (const followFollow of follow.follows) {
              if (!metadataMap[followFollow.pubkey]) {
                metadataMap[followFollow.pubkey] = {
                  name: followFollow.name,
                  picture: followFollow.picture
                };
              }
            }
          }

          setFollowingFollowingData(followingFollowingMap);
          setMetadata(metadataMap);
          setGraphData({ nodes, edges });
          setLoading(false);
        } else {
          const following = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, null);
      
          const uniqueFollowing = Array.from(new Set(following));
          console.log("got unique following", uniqueFollowing)

          await Promise.all(
            uniqueFollowing.map(async (pubkey) => {
              let followers = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, pubkey);
              console.log("got following following", followers);
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
      
          const edges = new DataSet(
            uniqueFollowing.map((pubkey: string) => ({ from: userPubkey, to: pubkey, id: `${userPubkey}-${pubkey}` }))
          );
      
          setGraphData({ nodes, edges });
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Error fetching data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (graphData && networkRef.current && !isNetworkInitialized.current) {
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
          enabled: true,
          stabilization: {
            enabled: true,
            iterations: 200,
            updateInterval: 50,
            onlyDynamicEdges: false,
            fit: true
          },
          barnesHut: {
            gravitationalConstant: -2000,
            centralGravity: 0.3,
            springLength: 95,
            springConstant: 0.04,
            damping: 0.09
          },
          minVelocity: 0.75
        },
        interaction: {
          hover: true,
          hoverConnectedEdges: true,
          selectConnectedEdges: true,
          dragNodes: true,
          dragView: true
        }
      };
  
      const container = networkRef.current;
      const newNetwork = new Network(container, graphData, options);
      setNetwork(newNetwork);
  
      newNetwork.once("stabilizationIterationsDone", function () {
        newNetwork.setOptions({ physics: { enabled: false } });
        newNetwork.fit();
      });
  
      isNetworkInitialized.current = true;
    }
  }, [graphData]);
  
  useEffect(() => {
    if (network && graphData && isNetworkInitialized.current) {
      network.setData(graphData);
    }
  }, [network, graphData]);

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
    const chunkSize = 100;
  
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