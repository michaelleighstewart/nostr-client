import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { SimplePool, nip19 } from 'nostr-tools';
import Loading from './Loading';
import { getFollowing, getUserPublicKey } from '../utils/profileUtils';
import { RELAYS } from '../utils/constants';
import { API_URLS } from '../utils/apiConstants';
import { ArrowPathIcon, UserIcon } from '@heroicons/react/24/outline';
import { showCustomToast } from "./CustomToast";
import { Link } from 'react-router-dom';
import { UserPlusIcon, UserMinusIcon } from '@heroicons/react/24/solid';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import NewMessageDialog from "./NewMessageDialog";

const NODES_PER_LOAD = 10;
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
  const [graphData, setGraphData] = useState<{ nodes: DataSet<any>; edges: DataSet<any> } | null>(null);
  const [followingFollowingData, setFollowingFollowingData] = useState<{[key: string]: string[]}>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [metadata, setMetadata] = useState<{[key: string]: any}>({});
  const [progress, setProgress] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [needsSynchronization, setNeedsSynchronization] = useState(false);
  const [visibleNodesLimit, _setVisibleNodesLimit] = useState<number>(10);
  const [_hasMoreNodes, setHasMoreNodes] = useState<boolean>(false);
  const [_nodeWithMoreData, setNodeWithMoreData] = useState<string | null>(null);
  const [nodeVisibleLimits, setNodeVisibleLimits] = useState<{[key: string]: number}>({});
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [nodeFollowCounts, setNodeFollowCounts] = useState<{[key: string]: number}>({});
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [isSecondDegreeFollow, setIsSecondDegreeFollow] = useState<boolean>(false);
  const [allFollows, setAllFollows] = useState<{[key: string]: string[]}>({});
  const [followingList, setFollowingList] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState<boolean>(false);

  const isNetworkInitialized = useRef(false);
  const poolRef = useRef(pool);
  const keyValueRef = useRef(keyValue);

  const removeSecondDegreeNodes = (nodeId: string) => {
    if (!graphData) return;
  
    const nodesToRemove: string[] = [];
    const edgesToRemove: string[] = [];

    graphData.edges.forEach((edge: any) => {
      if (edge.from === nodeId) {
        if (edge.to !== keyValueRef.current) {
          nodesToRemove.push(edge.to);
          edgesToRemove.push(edge.id);
        }
      }
    });
    graphData.nodes.remove(nodesToRemove);
    graphData.edges.remove(edgesToRemove);

    setGraphData({ ...graphData });
    if (network) {
      network.setData(graphData);
      network.redraw();
    }
  };

  const handleNodeClick = async (nodeId: string) => {
    const pk = await getUserPublicKey(nostrExists ?? false, keyValue);
 
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });

    const nodeData = graphData?.nodes.get(nodeId);
    setSelectedNode(nodeData);
    const isSecondDegree = nodeId !== pk && !graphData?.edges.get({
      filter: (edge: any) => edge.from === pk && edge.to === nodeId
    }).length;
    setIsSecondDegreeFollow(isSecondDegree);

    if (!expandedNodes.has(nodeId)) {
      const nodeNpub = nip19.npubEncode(nodeId);
      try {
        const apiGraphData = await fetchSocialGraphFromAPI(nodeNpub, 1);
        if (apiGraphData) {
          //michael - removed updating graph until user initiates
          //updateGraphWithNewData(apiGraphData, nodeId);
          setNodeFollowCounts(prev => ({
            ...prev,
            [nodeId]: apiGraphData.follows.length
          }));
          setAllFollows(prevAllFollows => ({
            ...prevAllFollows,
            [nodeId]: apiGraphData.follows.map((follow: any) => follow.pubkey)
          }));
        }
      } catch (error) {
        console.error('Error fetching data for clicked node:', error);
      }
    }
    setIsFollowing(followingList.includes(nodeId));
  };

  const updateGraphWithNewData = (apiGraphData: any, clickedNodeId: string, newLimit?: number) => {
    if (!graphData) return;
    const updatedNodes = new DataSet(graphData.nodes.get());
    const updatedEdges = new DataSet(graphData.edges.get());
    const currentLimit = newLimit || nodeVisibleLimits[clickedNodeId] || 0;
    const visibleFollows = apiGraphData.follows.slice(0, currentLimit);
    setHasMoreNodes(apiGraphData.follows.length > currentLimit);
    setNodeWithMoreData(apiGraphData.follows.length > currentLimit ? clickedNodeId : null);
    const isSecondDegreeFollow = !updatedNodes.get(clickedNodeId);
  
    if (!isSecondDegreeFollow && !updatedNodes.get(clickedNodeId)) {
      updatedNodes.add({
        id: clickedNodeId,
        label: apiGraphData.user.name || nip19.npubEncode(clickedNodeId).slice(0, 8),
        shape: 'circularImage',
        image: apiGraphData.user.picture || '/ostrich.png',
        size: 20,
        font: { color: 'white' },
      });
    }

    if (!isSecondDegreeFollow) {    
      for (const follow of visibleFollows) {
        if (!updatedNodes.get(follow.pubkey)) {
          updatedNodes.add({
            id: follow.pubkey,
            label: follow.name || nip19.npubEncode(follow.pubkey).slice(0, 8),
            image: follow.picture || '/ostrich.png',
            size: 15,
            font: { color: 'white' }
          });
        }
    
        const edgeId = `${clickedNodeId}-${follow.pubkey}`;
        if (!updatedEdges.get(edgeId)) {
          updatedEdges.add({
            id: edgeId,
            from: clickedNodeId,
            to: follow.pubkey
          });
        }
      }
    }

    updatedNodes.forEach((existingNode: any) => {
      if (existingNode.id !== clickedNodeId) {
        visibleFollows.forEach((follow: any) => {
          if (followingFollowingData[existingNode.id]?.includes(follow.pubkey)) {
            const edgeId = `${existingNode.id}-${follow.pubkey}`;
            if (!updatedEdges.get(edgeId)) {
              updatedEdges.add({
                id: edgeId,
                from: existingNode.id,
                to: follow.pubkey
              });
            }
          }
        });
      }
    });
    visibleFollows.forEach((existingNode: any) => {
      if (existingNode.pubkey !== clickedNodeId) {
        for (var key in allFollows) {
          if (allFollows.hasOwnProperty(key)) {
            const follows = allFollows[key];
            if (follows.includes(existingNode.pubkey)) {
              const edgeId = `${key}-${existingNode.pubkey}`;
              if (!updatedEdges.get(edgeId)) {
                updatedEdges.add({
                  id: edgeId,
                  from: key,
                  to: existingNode.pubkey
                });
              }
            }
          }
        }

      }
    })

    if (!isSecondDegreeFollow) {
      setMetadata(prevMetadata => ({
        ...prevMetadata,
        [clickedNodeId]: {
          name: apiGraphData.user.name,
          picture: apiGraphData.user.picture
        },
        ...apiGraphData.follows.reduce((acc: any, follow: any) => {
          acc[follow.pubkey] = {
            name: follow.name,
            picture: follow.picture
          };
          return acc;
        }, {})
      }));
      setGraphData({ nodes: updatedNodes, edges: updatedEdges });
      if (network) {
        network.setData({ nodes: updatedNodes, edges: updatedEdges });
        network.redraw();
      }
    }
  };

  const loadMoreNodes = async (nodeId: string) => {
    const newLimit = (nodeVisibleLimits[nodeId] || 0) + NODES_PER_LOAD;
    setNodeVisibleLimits(prev => ({
      ...prev,
      [nodeId]: newLimit
    }));
    const nodeNpub = nip19.npubEncode(nodeId);
    
    try {
      const apiGraphData = await fetchSocialGraphFromAPI(nodeNpub, 1);
      if (apiGraphData) {
        updateGraphWithNewData(apiGraphData, nodeId, newLimit);
        setAllFollows(prevAllFollows => ({
          ...prevAllFollows,
          [nodeId]: apiGraphData.follows.map((follow: any) => follow.pubkey)
        }));
      } else {
        console.error('Failed to fetch additional graph data');
      }
    } catch (error) {
      console.error('Error fetching additional graph data:', error);
    }
  };

  useEffect(() => {
    const fetchFollowingList = async () => {
      if (!pool) return;
      const pubkey = await getUserPublicKey(nostrExists ?? false, keyValue);
      
      const followingListSubscription = pool.subscribeManyEose(
        RELAYS,
        [{ kinds: [3], authors: [pubkey] }],
        {
          onevent(event) {
            const following = event.tags
              .filter(tag => tag[0] === 'p')
              .map(tag => tag[1]);
            setFollowingList(following);
          },
          onclose() {
            // Handle subscription close if needed
          }
        }
      );
  
      return () => {
        followingListSubscription?.close();
      };
    };
  
    fetchFollowingList();
  }, [pool, keyValue, nostrExists]);

  const handleFollow = async () => {
    if (!pool || !selectedNode) return;
  
    const event = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: [...followingList.map(pk => ['p', pk]), ['p', selectedNode.id]],
      content: '',
    };
  
    try {
      if (nostrExists) {
        const signedEvent = await (window as any).nostr.signEvent(event);
        await pool.publish(RELAYS, signedEvent);
      } else {
        const skDecoded = bech32Decoder("nsec", keyValue);
        const signedEvent = finalizeEvent(event, skDecoded);
        await pool.publish(RELAYS, signedEvent);
      }
  
      setFollowingList(prevList => [...prevList, selectedNode.id]);
      setIsFollowing(true);
      showCustomToast("Successfully followed user!");
  
      // Call the batch-processor API
      const currentUserPubkey = nostrExists 
        ? await (window as any).nostr.getPublicKey()
        : getPublicKey(bech32Decoder("nsec", keyValue));
  
      const response = await fetch(`${API_URLS.API_URL}batch-processor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'social_graph_processor',
          params: {
            npub: nip19.npubEncode(currentUserPubkey),
            to_create: nip19.npubEncode(selectedNode.id),
            fill_missing: false
          }
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to call batch-processor API');
      }
    } catch (error) {
      console.error('Error following user:', error);
      showCustomToast("Failed to follow user. Please try again.", "error");
    }
  };
  
  const handleUnfollow = async () => {
    if (!pool || !selectedNode) return;
  
    const event = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: followingList.filter(pk => pk !== selectedNode.id).map(pk => ['p', pk]),
      content: '',
    };
  
    try {
      if (nostrExists) {
        const signedEvent = await (window as any).nostr.signEvent(event);
        await pool.publish(RELAYS, signedEvent);
      } else {
        const skDecoded = bech32Decoder("nsec", keyValue);
        const signedEvent = finalizeEvent(event, skDecoded);
        await pool.publish(RELAYS, signedEvent);
      }
  
      setFollowingList(prevList => prevList.filter(pk => pk !== selectedNode.id));
      setIsFollowing(false);
      showCustomToast("Successfully unfollowed user!");
  
      // Call the batch-processor API
      const currentUserPubkey = nostrExists 
        ? await (window as any).nostr.getPublicKey()
        : getPublicKey(bech32Decoder("nsec", keyValue));
  
      const response = await fetch(`${API_URLS.API_URL}batch-processor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'social_graph_processor',
          params: {
            npub: nip19.npubEncode(currentUserPubkey),
            to_remove: nip19.npubEncode(selectedNode.id),
            fill_missing: false
          }
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to call batch-processor API');
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      showCustomToast("Failed to unfollow user. Please try again.", "error");
    }
  };

  const fetchSocialGraphFromAPI = async (npub: string, degrees: number = 2) => {
    const response = await fetch(`${API_URLS.API_URL}social-graph?npub=${npub}&degrees=${degrees}`);
    if (response.status === 404) {
      setNeedsSynchronization(true);
      return null;
    }
    if (!response.ok) {
      throw new Error('Failed to fetch social graph data');
    }
    return await response.json();
  };

  const updateGraph = useCallback(() => {
    if (!graphData) return;

    const nodesToRemove = graphData.nodes.get().filter((node: { id: string | string[]; }) => node.id.includes("-")).map((node: { id: any; }) => node.id);
    const edgesToRemove = graphData.edges.get().filter((edge: { id: string | string[]; }) => edge.id.includes("_")).map((edge: { id: any; }) => edge.id);
    graphData.nodes.remove(nodesToRemove);
    graphData.edges.remove(edgesToRemove);

    expandedNodes.forEach(nodeId => {
      if (followingFollowingData[nodeId]) {
        followingFollowingData[nodeId].forEach(pubkey => {
          const existingNode = graphData.nodes.get(pubkey);
          if (existingNode) {
            if (!graphData.edges.get(nodeId + "-" + pubkey)) {
              graphData.edges.add({
                from: nodeId,
                to: pubkey,
                id: nodeId + "-" + pubkey
              });
            }
          } else {
            graphData.nodes.add({
              id: pubkey,
              label: metadata[pubkey]?.name || nip19.npubEncode(pubkey).slice(0, 8),
              shape: 'circularImage',
              image: metadata[pubkey]?.picture || '/ostrich.png',
              size: 15,
              font: { color: 'white' },
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
    if (network) {
      network.setData(graphData);
      network.redraw();
    }
  }, [graphData, expandedNodes, followingFollowingData, metadata, network]);
  
  useEffect(() => {
    updateGraph();
  }, [expandedNodes, updateGraph, metadata]);
  
  useEffect(() => {
    if (network && graphData) {
      network.on("click", (params) => {
        if (params.nodes.length > 0) {
          handleNodeClick(params.nodes[0]);
        }
      });
    }
    return () => {
      if (network) {
        network.off("click");
      }
    };
  }, [network, graphData, handleNodeClick]);

  useEffect(() => {
    poolRef.current = pool;
    keyValueRef.current = keyValue;
    const fetchData = async () => {
      if (!pool) {
        setError('Pool is not initialized');
        setLoading(false);
        return;
      }

      const followingFollowingMap: {[key: string]: string[]} = {};
    
      try {
        const userPubkey = await getUserPublicKey(nostrExists ?? false, keyValue)
        const userNpub = nip19.npubEncode(userPubkey);

        const apiGraphData = await fetchSocialGraphFromAPI(userNpub, 1);

        if (apiGraphData) {
          const nodes = new DataSet();
          const edges = new DataSet();
          setNodeVisibleLimits({
            [apiGraphData.user.pubkey]: 0
          });
          setAllFollows(prevAllFollows => ({
            ...prevAllFollows,
            [userPubkey]: apiGraphData.follows.map((follow: any) => follow.pubkey)
          }));
          const followingFollowingMap: {[key: string]: string[]} = {};
          const metadataMap: {[key: string]: any} = {};
          if (!nodes.get(apiGraphData.user.pubkey)) {
            nodes.add({
              id: apiGraphData.user.pubkey,
              label: (apiGraphData.user?.name || nip19.npubEncode(apiGraphData.user.pubkey).slice(0, 8)) + ' (You)',
              shape: 'circularImage',
              image: apiGraphData.user?.picture || '/ostrich.png',
              size: 20,
              font: { color: 'white' },
            } as any);
          }
          metadataMap[apiGraphData.user.pubkey] = {
            name: apiGraphData.user?.name,
            picture: apiGraphData.user?.picture
          };
          const visibleFollows = apiGraphData.follows.slice(0, visibleNodesLimit);
          setHasMoreNodes(apiGraphData.follows.length > visibleNodesLimit);
          for (const follow of visibleFollows) {
            nodes.add({
              id: follow.pubkey,
              label: follow.name || nip19.npubEncode(follow.pubkey).slice(0, 8),
              shape: 'circularImage',
              image: follow.picture || '/ostrich.png',
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

            if (follow.follows) {
              followingFollowingMap[follow.pubkey] = follow.follows.map((ff: { pubkey: any; }) => ff.pubkey);
            }
          }

          setFollowingFollowingData(prevData => ({
            ...prevData,
            [apiGraphData.user.pubkey]: apiGraphData.follows.map((follow: any) => follow.pubkey)
          }));
          for (const follow of apiGraphData.follows) {
            if (follow.follows) {
              for (const followFollow of follow.follows) {
                if (!metadataMap[followFollow.pubkey]) {
                  metadataMap[followFollow.pubkey] = {
                    name: followFollow.name,
                    picture: followFollow.picture
                  };
                }
              }
            }
          }

          setFollowingFollowingData(followingFollowingMap);
          setMetadata(metadataMap);
          setGraphData({ nodes, edges });
          setLoading(false);

          // Set the root node as the selected node on first load
          const rootNode = nodes.get(apiGraphData.user.pubkey);
          setSelectedNode(rootNode);
          
          // Set the initial following count for the root node
          setNodeFollowCounts({
            [apiGraphData.user.pubkey]: apiGraphData.follows.length
          });
        } else {
          const following = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, null);
      
          const uniqueFollowing = Array.from(new Set(following));

          await Promise.all(
            uniqueFollowing.map(async (pubkey) => {
              let followers = await getFollowing(pool, true, nostrExists ?? false, keyValue ?? "", () => {}, pubkey);
              followers = followers.filter(follower => follower !== pubkey);
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
              image: metadataRetrieved[userPubkey]?.picture || '/ostrich.png',
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
                image: metadataRetrieved[pubkey]?.picture || '/ostrich.png',
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

          // Set the root node as the selected node on first load
          const rootNode = nodes.get(userPubkey);
          setSelectedNode(rootNode);
          
          // Set the initial following count for the root node
          setNodeFollowCounts({
            [userPubkey]: uniqueFollowing.length
          });
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
  
      newNetwork.on("click", function (params) {
        if (params.nodes.length > 0) {
          handleNodeClick(params.nodes[0]);
        }
      });
  
      isNetworkInitialized.current = true;
    }
  }, [graphData]);
  
  useEffect(() => {
    if (network && graphData && isNetworkInitialized.current) {
      network.setData(graphData);
    }
  }, [network, graphData]);

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

  const handleSynchronize = async () => {
    const userPubkey = await getUserPublicKey(nostrExists ?? false, keyValue);
    const userNpub = nip19.npubEncode(userPubkey);
  
    try {
      const response = await fetch(`${API_URLS.API_URL}batch-processor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'social_graph_processor',
          params: {
            npub: userNpub,
            fill_missing: true
          }
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to synchronize social graph');
      }
  
      showCustomToast('Social graph synchronization started. This may take a few minutes.', 'success');
      setNeedsSynchronization(false);
    } catch (error) {
      console.error('Error synchronizing social graph:', error);
      showCustomToast('Failed to synchronize social graph. Please try again.', 'error');
    }
  };

  const handleImageClick = (imageSrc: string) => {
    setModalImage(imageSrc);
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
      {needsSynchronization && (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-800 p-4 z-10">
          <p className="text-center mb-2">
            We have not yet synchronized an optimized social graph for your account. Once generated, we can further improve your Nostr experience on Ghostcopywrite.
          </p>
          <div className="flex justify-center py-8">
            <button
              onClick={handleSynchronize}
              className="flex items-center justify-center px-32 py-2 bg-[#535bf2] text-white rounded hover:bg-[#4349d6] transition duration-200"
            >
              <ArrowPathIcon className="h-5 w-5 mr-2 p-y" />
              Synchronize now
            </button>
          </div>
        </div>
      )}
      <div ref={networkRef} style={{ height: '600px', width: '100%', border: 'solid', color: 'light-gray' }}></div>
      {!needsSynchronization && selectedNode && (
        <div className="mt-4 p-16 px-32 bg-gray-800 rounded-lg shadow-lg justify-center">
          <div className="pt-4 pb-16 flex flex-col items-center">
            <h3 className="text-xl font-bold mb-2 text-center">{selectedNode.label}</h3>
            <img 
              src={selectedNode.image} 
              alt={selectedNode.label} 
              className="w-64 h-64 rounded-full object-cover mb-2 cursor-pointer" 
              onClick={() => handleImageClick(selectedNode.image)}
            />
            <Link 
              to={`/profile/${nip19.npubEncode(selectedNode.id)}`}
              className="mt-4 mb-16 flex items-center justify-center px-16 py-8 bg-[#535bf2] text-white rounded hover:bg-[#4349d6] transition duration-200"
            >
              <UserIcon className="h-5 w-5 mr-2" />
              View Profile
            </Link>
            <div className="flex space-x-4">
              {!isFollowing ? (
                <button
                  onClick={handleFollow}
                  className="flex items-center justify-center px-16 py-8 bg-[#535bf2] text-white rounded hover:bg-[#4349d6] transition duration-200"
                >
                  <UserPlusIcon className="h-5 w-5 mr-2" />
                  Follow
                </button>
              ) : (
                <button
                  onClick={handleUnfollow}
                  className="flex items-center justify-center px-16 py-8 bg-red-500 text-white rounded hover:bg-red-600 transition duration-200"
                >
                  <UserMinusIcon className="h-5 w-5 mr-2" />
                  Unfollow
                </button>
              )}
              <button
                onClick={() => setIsMessageDialogOpen(true)}
                className="flex items-center justify-center px-16 py-8 bg-[#535bf2] text-white rounded hover:bg-[#4349d6] transition duration-200"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
                Message
              </button>
            </div>
          </div>
          <div className="flex flex-col space-y-4 rounded-lg relative my-16">
            <div className="border border-gray-600 p-4 rounded-lg py-16">
                <p className="text-sm text-gray-400 whitespace-nowrap text-center">
                  {isSecondDegreeFollow 
                    ? "The social graph currently only supports two degrees of separation"
                    : `Following: ${nodeFollowCounts[selectedNode.id] || 0} (Showing ${graphData?.edges.get({filter: edge => edge.from === selectedNode.id}).length || 0})`
                  }
                </p>
              {!isSecondDegreeFollow && (
                <div className="flex justify-center space-x-4 mt-4">
                  <button
                    onClick={() => loadMoreNodes(selectedNode.id)}
                    disabled={nodeFollowCounts[selectedNode.id] === graphData?.edges.get({filter: edge => edge.from === selectedNode.id}).length}
                    className={`px-6 py-2 rounded transition duration-200 flex items-center justify-center ${
                      nodeFollowCounts[selectedNode.id] === graphData?.edges.get({filter: edge => edge.from === selectedNode.id}).length
                        ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                        : 'bg-[#535bf2] text-white hover:bg-[#4349d6]'
                    }`}
                  >
                    {nodeFollowCounts[selectedNode.id] === graphData?.edges.get({filter: edge => edge.from === selectedNode.id}).length
                      ? 'No more to show'
                      : graphData?.edges.get({filter: edge => edge.from === selectedNode.id}).length === 0
                        ? 'Show 10'
                        : `Show ${NODES_PER_LOAD} More`}
                  </button>
                  <button
                    onClick={() => removeSecondDegreeNodes(selectedNode.id)}
                    className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition duration-200"
                  >
                    Hide
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {modalImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setModalImage(null)}>
          <img src={modalImage} alt="Enlarged profile" className="max-w-full max-h-full object-contain" />
        </div>
      )}
      {selectedNode && (
      <NewMessageDialog
        isOpen={isMessageDialogOpen}
        onClose={() => setIsMessageDialogOpen(false)}
        initialRecipientNpub={selectedNode.id}
        pool={pool}
        keyValue={keyValue}
        nostrExists={nostrExists}
      />
    )}
    </div>
  );
};
export default SocialGraph;
