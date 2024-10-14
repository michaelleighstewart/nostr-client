import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { SimplePool, nip19 } from 'nostr-tools';
import Loading from './Loading';
import { getFollowing, getUserPublicKey } from '../utils/profileUtils';
import { RELAYS } from '../utils/constants';
import { API_URLS } from '../utils/apiConstants';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { showCustomToast } from "./CustomToast";

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
  const [visibleNodesLimit, _setVisibleNodesLimit] = useState<number>(NODES_PER_LOAD);
  const [_hasMoreNodes, setHasMoreNodes] = useState<boolean>(false);
  const [nodeWithMoreData, setNodeWithMoreData] = useState<string | null>(null);
  const [nodeVisibleLimits, setNodeVisibleLimits] = useState<{[key: string]: number}>({});
  

  const isNetworkInitialized = useRef(false);
  const poolRef = useRef(pool);
  const keyValueRef = useRef(keyValue);


  const removeSecondDegreeNodes = (nodeId: string) => {
    if (!graphData) return;
  
    const nodesToRemove: string[] = [];
    const edgesToRemove: string[] = [];
  
    graphData.edges.forEach((edge: any) => {
      if (edge.from === nodeId) {
        nodesToRemove.push(edge.to);
        edgesToRemove.push(edge.id);
      }
    });
  
    graphData.nodes.remove(nodesToRemove);
    graphData.edges.remove(edgesToRemove);
  
    setGraphData({ ...graphData });
  };

  const handleNodeClick = async (nodeId: string) => {
    const pk = await getUserPublicKey(nostrExists ?? false, keyValue);
    if (nodeId === (await pk).toString()) return; // Don't fetch for the user's own node
  
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });

    if (!expandedNodes.has(nodeId)) {
      const nodeNpub = nip19.npubEncode(nodeId);
      try {
        const apiGraphData = await fetchSocialGraphFromAPI(nodeNpub, 1);
        if (apiGraphData) {
          updateGraphWithNewData(apiGraphData, nodeId);
        }
      } catch (error) {
        console.error('Error fetching data for clicked node:', error);
      }
    } else {
      removeSecondDegreeNodes(nodeId);
    }
  };

  const updateGraphWithNewData = (apiGraphData: any, clickedNodeId: string, newLimit?: number) => {
    if (!graphData) return;
  
    const updatedNodes = new DataSet(graphData.nodes.get());
    const updatedEdges = new DataSet(graphData.edges.get());

    const currentLimit = newLimit || nodeVisibleLimits[clickedNodeId] || NODES_PER_LOAD;

    const visibleFollows = apiGraphData.follows.slice(0, currentLimit);
    const isLoadMore = apiGraphData.follows.length > currentLimit;
    console.log('Visible follows:', visibleFollows.length);
  
    setHasMoreNodes(apiGraphData.follows.length > currentLimit);
    setNodeWithMoreData(apiGraphData.follows.length > currentLimit ? clickedNodeId : null);
  
    // Check if the clicked node is a second-degree follow
    const isSecondDegreeFollow = !updatedNodes.get(clickedNodeId);
  
    // Update clicked node if it doesn't exist
    if (!isSecondDegreeFollow && !updatedNodes.get(clickedNodeId)) {
      updatedNodes.add({
        id: clickedNodeId,
        label: apiGraphData.user.name || nip19.npubEncode(clickedNodeId).slice(0, 8),
        //shape: 'circularImage',
        image: apiGraphData.user.picture || 'default-profile-picture.jpg',
        size: 20,
        font: { color: 'white' },
        shape: 'custom',
        ctxRenderer: ({ ctx, id, x, y, label }: any) => {
          console.log("here 2")
          console.log("label", label)
          // Draw the circular image
          const color = 'white';
          const size = 20;
          const image = apiGraphData.user?.picture || 'default-profile-picture.jpg';
          ctx.beginPath();
          ctx.arc(x, y, size, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();

          // Draw the image
          if (image) {
            const img = new Image();
            img.src = image;
            ctx.save();
            ctx.clip();
            ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
            ctx.restore();
          }

          // Draw the label
          ctx.font = '12px Arial';
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, y + size + 15);

          // Draw "Load More" button if this node has more data
          if (isLoadMore) {
            ctx.fillStyle = '#535bf2';
            ctx.beginPath();
            ctx.moveTo(x + size + 5, y);
            ctx.lineTo(x + size + 15, y + 5);
            ctx.lineTo(x + size + 5, y + 10);
            ctx.closePath();
            ctx.fill();
          }

          return { drawNode: () => {}, nodeDimensions: { width: size * 2, height: size * 2 } };
        },
      });
    }

    // Update the clicked node to show the load more button if not a second-degree follow
    if (!isSecondDegreeFollow) {
      updatedNodes.update({
        id: clickedNodeId,
        shape: 'custom',
        ctxRenderer: ({ ctx, id, x, y, label }: any) => {
          // Draw the circular image
          const color = 'white';
          const size = 20;
          const image = apiGraphData.user?.picture || 'default-profile-picture.jpg';
          ctx.beginPath();
          ctx.arc(x, y, size, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();

          // Draw the image
          if (image) {
            const img = new Image();
            img.src = image;
            ctx.save();
            ctx.clip();
            ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
            ctx.restore();
          }

          // Draw the label
          ctx.font = '12px Arial';
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, y + size + 15);

          // Draw "Load More" button
          ctx.fillStyle = '#535bf2';
          ctx.beginPath();
          ctx.moveTo(x + size + 5, y);
          ctx.lineTo(x + size + 15, y + 5);
          ctx.lineTo(x + size + 5, y + 10);
          ctx.closePath();
          ctx.fill();

          return { drawNode: () => {}, nodeDimensions: { width: size * 2, height: size * 2 } };
        },
      });
    }
  
    // Add or update first-order follows only if the clicked node is not a second-degree follow
    if (!isSecondDegreeFollow) {
      //const visibleFollows = apiGraphData.follows.slice(0, visibleNodesLimit);
      //setHasMoreNodes(apiGraphData.follows.length > visibleNodesLimit);
      //setNodeWithMoreData(apiGraphData.follows.length > visibleNodesLimit ? clickedNodeId : null);
      
  
      for (const follow of visibleFollows) {
        if (!updatedNodes.get(follow.pubkey)) {
          updatedNodes.add({
            id: follow.pubkey,
            label: follow.name || nip19.npubEncode(follow.pubkey).slice(0, 8),
            //shape: 'circularImage',
            image: follow.picture || 'default-profile-picture.jpg',
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
  
    // Update metadata
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
      // Update the graph data
      setGraphData({ nodes: updatedNodes, edges: updatedEdges });
  
      // Refresh the network to display new nodes and edges
      if (network) {
        network.setData({ nodes: updatedNodes, edges: updatedEdges });
        network.redraw();
      }
    }
  };

  const loadMoreNodes = async (nodeId: string) => {
    console.log('loadMoreNodes called for node:', nodeId);
    const newLimit = (nodeVisibleLimits[nodeId] || NODES_PER_LOAD) + NODES_PER_LOAD;
    setNodeVisibleLimits(prev => ({
      ...prev,
      [nodeId]: newLimit
    }));
    const nodeNpub = nip19.npubEncode(nodeId);
    
    try {
      const apiGraphData = await fetchSocialGraphFromAPI(nodeNpub, 1);
      if (apiGraphData) {
        console.log('Fetched additional data:', apiGraphData);
        updateGraphWithNewData(apiGraphData, nodeId, newLimit);
      } else {
        console.error('Failed to fetch additional graph data');
      }
    } catch (error) {
      console.error('Error fetching additional graph data:', error);
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
  
    // Remove all followingFollowing nodes and edges
    const nodesToRemove = graphData.nodes.get().filter((node: { id: string | string[]; }) => node.id.includes("-")).map((node: { id: any; }) => node.id);
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
              //shape: 'circularImage',
              image: metadata[pubkey]?.picture || 'default-profile-picture.jpg',
              size: 15,
              font: { color: 'white' },
              shape: 'custom',
              ctxRenderer: ({ ctx, _id, x, y, label }: any) => {
                // Draw the circular image
                console.log("here 1")
                const color = 'white';
                const size = 20;
                const image = metadata[pubkey]?.picture || 'default-profile-picture.jpg';
                ctx.beginPath();
                ctx.arc(x, y, size, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
                ctx.fill();
                // Draw the image
                if (image) {
                  const img = new Image();
                  img.src = image;
                  ctx.save();
                  ctx.clip();
                  ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
                  ctx.restore();
                }
      
                // Draw the label
                ctx.font = '12px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.fillText(label, x, y + size + 15);
      
                // Draw "Load More" button if this node has more data
                //if (apiGraphData.follows.length > 20) {
                //  ctx.fillStyle = '#535bf2';
                //  ctx.fillRect(x + size + 5, y - 10, 70, 20);
                //  ctx.fillStyle = 'white';
                //  ctx.font = '10px Arial';
                //  ctx.fillText('Load More', x + size + 40, y + 2);
                //}
      
                return { drawNode: () => {}, nodeDimensions: { width: size * 2, height: size * 2 } };
              },
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

    // Refresh the network to display changes
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
        //const userPubkey = await getCurrentUserPubkey();
        const userPubkey = await getUserPublicKey(nostrExists ?? false, keyValue)
        const userNpub = nip19.npubEncode(userPubkey);

        const apiGraphData = await fetchSocialGraphFromAPI(userNpub, 1);

        if (apiGraphData) {
          const nodes = new DataSet();
          const edges = new DataSet();
          setNodeVisibleLimits({
            [apiGraphData.user.pubkey]: NODES_PER_LOAD
          });
          const followingFollowingMap: {[key: string]: string[]} = {};
          const metadataMap: {[key: string]: any} = {};
          if (!nodes.get(apiGraphData.user.pubkey)) {
            console.log("adding node with label", (apiGraphData.user?.name || nip19.npubEncode(apiGraphData.user.pubkey).slice(0, 8)) + ' (You)')
            nodes.add({
              id: apiGraphData.user.pubkey,
              label: (apiGraphData.user?.name || nip19.npubEncode(apiGraphData.user.pubkey).slice(0, 8)) + ' (You)',
              //shape: 'circularImage',
              image: apiGraphData.user?.picture || 'default-profile-picture.jpg',
              size: 20,
              font: { color: 'white' },
              shape: 'custom',
              ctxRenderer: ({ ctx, id, x, y, label }: any) => {
                console.log("here 2")
                console.log("label", label)
                // Draw the circular image
                const color = 'white';
                const size = 20;
                const image = apiGraphData.user?.picture || 'default-profile-picture.jpg';
                ctx.beginPath();
                ctx.arc(x, y, size, 0, 2 * Math.PI, false);
                ctx.fillStyle = color;
                ctx.fill();

                // Draw the image
                if (image) {
                  const img = new Image();
                  img.src = image;
                  ctx.save();
                  ctx.clip();
                  ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
                  ctx.restore();
                }
      
                // Draw the label
                ctx.font = '12px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.fillText(label, x, y + size + 15);
      
                // Draw "Load More" button if this node has more data
                if (apiGraphData.follows.length > 2) {
                  ctx.fillStyle = '#535bf2';
                  ctx.beginPath();
                  ctx.moveTo(x + size + 5, y);
                  ctx.lineTo(x + size + 15, y + 5);
                  ctx.lineTo(x + size + 5, y + 10);
                  ctx.closePath();
                  ctx.fill();
                }
      
                return { drawNode: () => {}, nodeDimensions: { width: size * 2, height: size * 2 } };
              },
            } as any);
          }
          metadataMap[apiGraphData.user.pubkey] = {
            name: apiGraphData.user?.name,
            picture: apiGraphData.user?.picture
          };

          // Add first-order follows
          // Add first-order follows (limited)
          const visibleFollows = apiGraphData.follows.slice(0, visibleNodesLimit);
          setHasMoreNodes(apiGraphData.follows.length > visibleNodesLimit);
          for (const follow of visibleFollows) {
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

            if (follow.follows) {
              followingFollowingMap[follow.pubkey] = follow.follows.map((ff: { pubkey: any; }) => ff.pubkey);
            }
          }

          // Add second-order follows to metadata but not to graph
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
          font: { color: 'white' },
          //shape: 'custom'
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

  useEffect(() => {
    if (network && graphData && isNetworkInitialized.current) {
      network.on("click", function (params) {
        const clickPosition = network.DOMtoCanvas({
          x: params.pointer.DOM.x,
          y: params.pointer.DOM.y
        });
  
        // Check if the click is on any "Load More" button
        const allNodes = graphData.nodes.get();
        for (const node of allNodes) {
          //if (node.id === nodeWithMoreData) {
            const nodePosition = network.getPositions([node.id])[node.id];
            const buttonX = nodePosition.x + node.size + 5;
            const buttonY = nodePosition.y - 5;
            const buttonWidth = 10;
            const buttonHeight = 10;
  
            if (
              clickPosition.x >= buttonX &&
              clickPosition.x <= buttonX + buttonWidth &&
              clickPosition.y >= buttonY &&
              clickPosition.y <= buttonY + buttonHeight
            ) {
              // Click is on the "Load More" button
              loadMoreNodes(node.id);
              return; // Prevent further processing of the click
            }
          }
        //}
  
        // If not on any button, handle regular node click if a node was clicked
        if (params.nodes.length > 0) {
          handleNodeClick(params.nodes[0]);
        }
      });
    }
  }, [network, graphData, nodeWithMoreData, nodeVisibleLimits]);

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
    </div>
  );
};

export default SocialGraph;
