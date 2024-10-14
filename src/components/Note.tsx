import React, { useState, useEffect, useRef } from 'react';
import { SimplePool, Event, finalizeEvent, nip19 } from 'nostr-tools';
import { useNavigate, useParams } from 'react-router-dom';
import NoteCard from './NoteCard';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import { ExtendedEvent, Metadata, Reaction } from '../utils/interfaces';
import Loading from './Loading';
import { showCustomToast } from './CustomToast';
import { Helmet } from 'react-helmet';
import { fetchMetadataReactionsAndReplies } from '../utils/noteUtils';
import ThreadedReply from "./ThreadedReply";
import FaviconIcon from './FaviconIcon';
import { API_URLS } from '../utils/apiConstants';

interface PostProps {
  pool: SimplePool | null;
  nostrExists: boolean | null;
  keyValue: string;
}

interface Reply {
  id: string;
  content: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
  hashtags: string[],
  reactions: Reaction[];
  replies: Reply[];
}

const Note: React.FC<PostProps> = ({ pool, nostrExists, keyValue }) => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Reply | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
  const [_reactions, _setReactions] = useState<Reaction[]>([]);
  const [_reposts, _setReposts] = useState<Reply[]>([]);
  const [allReactions, setAllReactions] = useState<Record<string, Reaction[]>>({});
  const [allReplies, setAllReplies] = useState<Record<string, ExtendedEvent[]>>({});
  const [allReposts, setAllReposts] = useState<Record<string, ExtendedEvent[]>>({});
  const [allRepliesNew, setAllRepliesNew] = useState<Record<string, Reply>>({});
  const [threadedReplies, setThreadedReplies] = useState<Record<string, Reply>>({});
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (!pool || !id) return;
  
    const allReplies: Record<string, Reply> = {};
    const allRepliesToSend: Record<string, ExtendedEvent> = {};
  
    const sub = pool.subscribeManyEose(
      RELAYS,
      [
        { kinds: [1], ids: [id] },
        { kinds: [1], '#e': [id] },
        { kinds: [7], '#e': [id] },
        { kinds: [6], '#e': [id] }
      ],
      {
        onevent: (event: Event) => {
          if (event.kind === 1) {
            const newReply: Reply = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              tags: event.tags,
              reactions: [],
              replies: [],
              hashtags: []
            };
            const newReplyExtendedEvent: ExtendedEvent = {
              ...event,
              deleted: false,
              repostedEvent: null,
              repliedEvent: null,
              rootEvent: null
            }
    
            if (event.id === id) {
              setPost(newReply);
            } else {
              allReplies[event.id] = newReply;
              allRepliesToSend[event.id] = newReplyExtendedEvent;
            }
          } else if (event.kind === 7) {
            // Handle reactions
            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
            if (postId) {
              const newReaction: Reaction = {
                id: event.id,
                liker_pubkey: event.pubkey,
                type: event.content,
                sig: event.sig
              };
              setAllReactions(prevReactions => ({
                ...prevReactions,
                [postId]: [...(prevReactions[postId] || []), newReaction]
              }));
            }
          } else if (event.kind === 6) {
            // Handle reposts
            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
            if (postId) {
              setAllReposts(prevReposts => ({
                ...prevReposts,
                [postId]: [...(prevReposts[postId] || []), event as unknown as ExtendedEvent]
              }));
            }
          }
        },
        onclose: () => {
          setAllRepliesNew(allReplies);
          setAllReplies(prevReplies => {
            const updatedReplies = { ...prevReplies };
            Object.entries(allRepliesToSend).forEach(([eventId, reply]) => {
              updatedReplies[eventId] = [...(updatedReplies[eventId] || []), reply];
            });
            return updatedReplies;
          });
          setLoading(false);
  
          // Fetch metadata, reactions, and reposts for all replies
          const allEvents = Object.values(allRepliesToSend);
          if (pool && allEvents.length > 0) {
            fetchMetadataReactionsAndReplies(
              pool,
              allEvents,
              [], // repostEvents (we don't have this information here)
              [], // replyEvents (we don't have this information here)
              setMetadata,
              setAllReactions,
              setAllReplies,
              setAllReposts
            );
          }
        },
      }
    );
  
    return () => {
      sub.close();
    };
  }, [id, pool]);


  const handleGenerateReply = async () => {
    if (isGeneratingReply || !post) return;
    setIsGeneratingReply(true);
    try {
      const response = await fetch(`${API_URLS.API_URL}llama`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: `Please write a reply to the following social media post: "${post.content}". 
          Make it concise and exactly how it would appear on the platform. 
          Please also leave out any reference to it being a sample, I want the text only.`
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to generate reply');
      }
  
      const data = await response.json();
      const generatedReply = data.response.replace(/^["']|["']$/g, '');
      setReplyContent(generatedReply);
      
      // Resize the textarea after setting the content
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, 0);
    } catch (error) {
      console.error('Error generating reply:', error);
      showCustomToast('Failed to generate reply. Please try again.', 'error');
    } finally {
      setIsGeneratingReply(false);
    }
  };

  useEffect(() => {
    if (!allRepliesNew || Object.keys(allRepliesNew).length === 0) return;
  
    const threadedReplies: Record<string, Reply> = {};
    const replyMap: Record<string, Reply> = {};
  
    // First pass: Create a map of all replies
    Object.values(allRepliesNew).forEach(reply => {
      replyMap[reply.id] = { ...reply, replies: [] };
    });
  
    // Second pass: Construct the threaded structure
    Object.values(allRepliesNew).forEach(reply => {
      const rootTag = reply.tags.find(tag => tag[0] === 'e' && tag[3] === 'root');
      const parentTag = reply.tags.find(tag => tag[0] === 'e' && tag[3] === 'reply');
  
      if (rootTag && rootTag[1] === id) {
        if (parentTag) {
          // This is a nested reply
          const parentId = parentTag[1];
          if (replyMap[parentId]) {
            replyMap[parentId].replies.push(replyMap[reply.id]);
          } else {
            // If parent doesn't exist yet, add it to the top level
            threadedReplies[reply.id] = replyMap[reply.id];
          }
        } else {
          // This is a top-level reply
          threadedReplies[reply.id] = replyMap[reply.id];
        }
      }
    });
    setThreadedReplies(threadedReplies);
  }, [allRepliesNew, id]);
  
  // Helper function to find a reply by its ID in the nested structure
  const findReplyById = (replies: Reply[], id: string): Reply | null => {
    for (const reply of replies) {
      if (reply.id === id) {
        return reply;
      }
      const nestedReply = findReplyById(reply.replies, id);
      if (nestedReply) {
        return nestedReply;
      }
    }
    return null;
  };

  useEffect(() => {
    //get for the replies
    if (!pool || !post) return;

    const authors = new Set<string>([post.pubkey]);
    replies.forEach(reply => authors.add(reply.pubkey));

    const uniqueAuthors = Array.from(authors);

    if (uniqueAuthors.length === 0) return;

    const sub = pool.subscribeManyEose(
      RELAYS,
      [
        { kinds: [0], authors: uniqueAuthors }
      ],
      {
        onevent: (event: Event) => {
          try {
            const userMetadata = JSON.parse(event.content) as Metadata;
            setMetadata(prevMetadata => ({
              ...prevMetadata,
              [event.pubkey]: userMetadata
            }));
          } catch (error) {
            console.error('Error parsing metadata:', error);
          }
        },
        onclose: () => {
          setLoading(false);
        }
      }
    );

    return () => {
      sub.close();
    };
  }, [pool, id, post, replies]);

  useEffect(() => {
    if (!pool || !post) return;
  
    const fetchData = async () => {
      const allEvents = [post, ...replies];
      await fetchMetadataReactionsAndReplies(
        pool,
        allEvents as unknown as ExtendedEvent[],
        [], // repostEvents (we don't have this information here)
        [], // replyEvents (we don't have this information here)
        setMetadata,
        setAllReactions,
        setAllReplies,
        setAllReposts
      );
    };
  
    fetchData();
  }, [pool, post, replies]);

  const handleReplyClick = (replyId: string) => {
    window.location.href = `/note/${replyId}`;
  };

  const handleReply = async () => {
    if (!pool || !id || !replyContent.trim()) return;

    const replyEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', id]],
      content: replyContent,
    };

    try {
      let signedEvent;
      if (nostrExists) {
        signedEvent = await (window as any).nostr.signEvent(replyEvent);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        signedEvent = finalizeEvent(replyEvent, skDecoded);
      }

      await pool.publish(RELAYS, signedEvent);
      // Add the new reply to the replies state
      const newReply: Reply = {
        id: signedEvent.id,
        content: replyContent,
        pubkey: signedEvent.pubkey,
        created_at: signedEvent.created_at,
        replies: [],
        tags: [],
        reactions: [],
        hashtags: [],
      };
      setReplies(prevReplies => [...prevReplies, newReply]);
      
      setReplyContent('');
      showCustomToast('Reply posted successfully!');
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
  };

  const handleUserClick = (userPubkey: string) => {
    const userNpub = nip19.npubEncode(userPubkey);
    navigate(`/profile/${userNpub}`);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  if (loading || !post) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  const title = `Note by ${metadata[post.pubkey]?.name || post.pubkey.slice(0, 8)} on Ghostcopywrite`;
  const description = post.content.slice(0, 200) + (post.content.length > 200 ? '...' : '');
  const url = `https://ghostcopywrite.com/note/${id}`;
  const image = metadata[post.pubkey]?.picture || 'https://ghostcopywrite.com/ostrich.png';

  return (
    <div className="space-y-4">
        <Helmet>
          <meta name="description" content={description} />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:url" content={url} />
          <meta property="og:type" content="article" />
          <meta property="og:image" content={image} />
          <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      <NoteCard
        isPreview={false}
        id={post.id}
        content={post.content}
        user={{
          pubkey: post.pubkey,
          name: metadata[post.pubkey]?.name || '',
          image: metadata[post.pubkey]?.picture || '',
          nip05: metadata[post.pubkey]?.nip05 || '',
        }}
        created_at={post.created_at}
        hashtags={[]}
        pool={pool}
        nostrExists={nostrExists}
        reactions={allReactions[post.id] || []}
        keyValue={keyValue}
        deleted={false}
        replies={allReplies[post.id]?.length || 0}
        repostedEvent={null}
        metadata={metadata}
        allReactions={allReactions}
        allReplies={allReplies} repliedEvent={null}
        reposts={allReposts[post.id]?.length || 0}
        allReposts={allReposts}
        setMetadata={setMetadata}
        connectionInfo={null}
        rootEvent={null}
        onUserClick={() => handleUserClick(post.pubkey)}
        />
      <div className="mt-8 p-16 rounded-lg">
        <textarea
          ref={textareaRef}
          value={replyContent}
          onChange={handleTextareaChange}
          placeholder="Write your reply..."
          className="w-full p-2 border rounded text-black resize-none overflow-hidden"
          style={{ minHeight: '100px' }}
        />
        <div className="flex items-center space-x-2 mt-2">
          <button 
            className={`text-white font-bold p-16 rounded mr-16 ${(!replyContent.trim() || isGeneratingReply) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#535bf2]-700 transition-colors duration-200'}`}
            onClick={handleReply}
            disabled={!replyContent.trim() || isGeneratingReply}
          >
            {'Reply'}
          </button>
          <button 
            className={`flex items-center justify-center font-bold p-16 rounded bg-transparent ${isGeneratingReply ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#535bf2]-700 transition-colors duration-200'}`}
            onClick={handleGenerateReply}
            disabled={isGeneratingReply}
          >
            {isGeneratingReply ? <Loading vCentered={false} tiny={true} /> : <FaviconIcon className="h-5 w-5 cursor-pointer" />}
          </button>
        </div>
      </div>
      <h2 className="text-xl font-bold mt-6 mb-4">Replies</h2>
{Object.keys(threadedReplies).length === 0 ? (
  <p>No replies yet</p>
) : (
  Object.values(threadedReplies)
    .sort((a, b) => a.created_at - b.created_at)
    .map(reply => (
      <ThreadedReply
        key={reply.id}
        reply={reply}
        depth={0}
        handleReplyClick={handleReplyClick}
        pool={pool}
        nostrExists={nostrExists}
        keyValue={keyValue}
        metadata={metadata}
        allReactions={allReactions}
        allReplies={allReplies}
        allReposts={allReposts}
        setMetadata={setMetadata}
      />
    ))
)}
    </div>
  );
};

export default Note;
