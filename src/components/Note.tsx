import React, { useState, useEffect } from 'react';
import { SimplePool, Event, finalizeEvent } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NoteCard from './NoteCard';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import { ExtendedEvent, Metadata, Reaction } from '../utils/interfaces';
import Loading from './Loading';
import { showCustomToast } from './CustomToast';
import { Helmet } from 'react-helmet';

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
  hashtags: string[];
  reactions: Reaction[];
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

  useEffect(() => {
    if (!pool || !id) return;
    //get for the original post
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
              hashtags: event.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]),
              reactions: [],
            };
            const newExtendedEvent: ExtendedEvent = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              deleted: false,
              tags: event.tags,
              repostedEvent: null,
              repliedEvent: null
            };

            if (event.id === id) {
              setPost(newReply);
            } else {
              setReplies((prevReplies) => {
                // Check if the reply already exists
                const replyExists = prevReplies.some(reply => reply.id === newReply.id);
                if (!replyExists) {
                  return [...prevReplies, newReply];
                }
                return prevReplies;
              });
              setAllReplies(prevReplies => {
                if (!newReply.id) return prevReplies;
                const existingReplies = prevReplies[id] || [];
                const replyExists = existingReplies.some(
                  (r: ExtendedEvent) => r.id === newExtendedEvent.id
                );
                if (!replyExists) {
                  return {
                    ...prevReplies,
                    [id]: [...existingReplies, newExtendedEvent]
                  };
                }
                return prevReplies;
              });
            }
          }
          else if (event.kind === 7) {
            const newReaction: Reaction = {
              id: event.id,
              liker_pubkey: event.pubkey,
              type: event.content,
              sig: event.sig
            };
            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
            setAllReactions(prevReactions => {
              if (!postId) return prevReactions;
              const existingReactions = prevReactions[postId] || [];
              const reactionExists = existingReactions.some(
                (r: Reaction) => r.liker_pubkey === newReaction.liker_pubkey && r.type === newReaction.type
              );
              if (!reactionExists) {
                return {
                  ...prevReactions,
                  [postId as string]: [...existingReactions, newReaction]
                };
              }
              return prevReactions;
            });
          }
          else if (event.kind === 6) {
            const newExtendedEvent: ExtendedEvent = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              deleted: false,
              tags: event.tags,
              repostedEvent: null,
              repliedEvent: null
            };
            setAllReposts((prevReposts: Record<string, ExtendedEvent[]>) => {
              if (!newExtendedEvent.id) return prevReposts;
              const existingReposts = prevReposts[id] || [];
              const repostExists = existingReposts.some(
                (r: ExtendedEvent) => r.id === newExtendedEvent.id
              );
              if (!repostExists) {
                return {
                  ...prevReposts,
                  [id]: [...existingReposts, newExtendedEvent]
                };
              }
              return prevReposts;
            });
          }
        },
        onclose: () => {
          setLoading(false);
        },
      }
    );

    return () => {
      sub.close();
    };
  }, [id, pool]);

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
    //get all reactions, replies, reposts for replies
    if (!pool || !post) return;

    //const postIds = [post.id, ...replies.map(reply => reply.id)];
    const postIds = replies.map(reply => reply.id);

    const sub = pool.subscribeManyEose(
      RELAYS,
      [
        { kinds: [7], '#e': [post.id] },
        ...postIds.map(postId => ({ kinds: [7, 6, 1], '#e': [postId] }))
      ],
      {
        onevent: (event: Event) => {
          if (event.kind === 7) {
            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
            if (postId) {
              const newReaction: Reaction = { 
                id: event.id,
                liker_pubkey: event.pubkey,
                type: event.content,
                sig: event.sig
              };
              setAllReactions(prevReactions => {
                const existingReactions = prevReactions[postId] || [];
                const reactionExists = existingReactions.some(
                  (r: Reaction) => r.liker_pubkey === newReaction.liker_pubkey && r.type === newReaction.type
                );
                if (!reactionExists) {
                  return {
                    ...prevReactions,
                    [postId]: [...existingReactions, newReaction]
                  };
                }
                return prevReactions;
              });
            }
          }
          else if (event.kind === 6) {
            const reply: Reply = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              hashtags: event.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]),
              reactions: [],
            };
            const newExtendedEvent: ExtendedEvent = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              deleted: false,
              tags: event.tags,
              repostedEvent: null,
              repliedEvent: null
            };
            const contentObj = JSON.parse(event.content);
            const postId = contentObj.id;
            setAllReposts(prevReposts => {
              if (!reply.id) return prevReposts;
              const existingReposts = prevReposts[postId] || [];
              const repostExists = existingReposts.some(
                (r: ExtendedEvent) => r.id === newExtendedEvent.id
              );
              if (!repostExists) {
                return {
                  ...prevReposts,
                  [postId]: [...existingReposts, newExtendedEvent]
                };
              }
              return prevReposts;
            });
          }
          else if (event.kind === 1) {
            const newReply: Reply = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              hashtags: event.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]),
              reactions: [],
            };
            const newExtendedEvent: ExtendedEvent = {
              id: event.id,
              content: event.content,
              pubkey: event.pubkey,
              created_at: event.created_at,
              deleted: false,
              tags: event.tags,
              repostedEvent: null,
              repliedEvent: null
            };
            const postIdsRepliedTo = event.tags.filter(tag => tag[0] === 'e').map(tag => tag[1]);
            for (const replyPostId of postIdsRepliedTo) {
            setAllReplies(prevReplies => {
              if (!newReply.id) return prevReplies;
              const existingReplies = prevReplies[replyPostId] || [];
              const replyExists = existingReplies.some(
                (r: ExtendedEvent) => r.id === newExtendedEvent.id
              );
              if (!replyExists) {
                return {
                  ...prevReplies,
                  [replyPostId]: [...existingReplies, newExtendedEvent]
                };
              }
              return prevReplies;
            });
          }
        }
        },
      }
    );

    return () => {
      sub.close();
    };
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
        hashtags: [],
        reactions: [],
      };
      setReplies(prevReplies => [newReply, ...prevReplies]);
      
      setReplyContent('');
      showCustomToast('Reply posted successfully!');
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
  };

  if (loading) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  if (!post) {
    return <div>Post not found</div>;
  }

  const title = `Note by ${post.pubkey.slice(0, 8)}...`;
  const description = post.content.slice(0, 200) + (post.content.length > 200 ? '...' : '');
  const url = `https://ghostcopywrite.com/note/${id}`;

  return (
    <div className="space-y-4">
        <Helmet>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content="https://ghostcopywrite.com/ostrich.png" />
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
        hashtags={post.hashtags}
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
        />
      <div className="mt-8 p-16 rounded-lg">
        <textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Write your reply..."
          className="w-full p-2 border rounded text-black"
        />
        <button
          onClick={handleReply}
          className="mt-2 p-12 text-white rounded"
        >
          Reply
        </button>
      </div>
      <h2 className="text-xl font-bold mt-6 mb-4">Replies</h2>
      {replies.length === 0 && <p>No replies yet</p>}
      {replies.sort((a, b) => b.created_at - a.created_at).map(reply => (
        <div onClick={() => handleReplyClick(reply.id)}>
        <NoteCard
          isPreview={false}
          key={reply.id}
          id={reply.id}
          content={reply.content}
          user={{
            pubkey: reply.pubkey,
            name: metadata[reply.pubkey]?.name || '',
            image: metadata[reply.pubkey]?.picture || '',
            nip05: metadata[reply.pubkey]?.nip05 || '',
          }}
          created_at={reply.created_at}
          hashtags={reply.hashtags}
          pool={pool}
          nostrExists={nostrExists}
          reactions={allReactions[reply.id] || []}
          keyValue={keyValue}
          deleted={false}
          replies={allReplies[reply.id]?.length || 0}
          repostedEvent={null}
          metadata={metadata}
          allReactions={allReactions}
          allReplies={allReplies} repliedEvent={null} 
          reposts={allReposts[reply.id]?.length || 0}
          allReposts={allReposts}
          setMetadata={setMetadata}
          />
          </div>
      ))}
    </div>
  );
};

export default Note;
