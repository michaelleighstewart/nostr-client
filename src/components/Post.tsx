import React, { useState, useEffect } from 'react';
import { SimplePool, Event, getPublicKey } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NoteCard from './NoteCard';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import { ExtendedEvent, Metadata, Reaction } from '../utils/interfaces';
import Loading from './Loading';

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

const Post: React.FC<PostProps> = ({ pool, nostrExists, keyValue }) => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Reply | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reposts, setReposts] = useState<Reply[]>([]);
  const [allReactions, setAllReactions] = useState<Record<string, Reaction[]>>({});
  const [allReplies, _setAllReplies] = useState<Record<string, ExtendedEvent[]>>({});
  const [allReposts, _setAllReposts] = useState<Record<string, ExtendedEvent[]>>({});

  useEffect(() => {
    if (!pool || !id) return;

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
            }
          }
          else if (event.kind === 7) {
            const newReaction: Reaction = {
              id: event.id,
              liker_pubkey: event.pubkey,
              type: event.content,
              sig: event.sig
            };
            setReactions(prevReactions => {
              const reactionExists = prevReactions.some(reaction => reaction.id === newReaction.id);
              if (!reactionExists) {
                return [...prevReactions, newReaction];
              }
              return prevReactions;
            });
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
            setReposts(prevReposts => {
              const repostExists = prevReposts.some(repost => repost.id === reply.id);
              if (!repostExists) {
                return [...prevReposts, reply];
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
      }
    );

    return () => {
      sub.close();
    };
  }, [pool, post, replies]);

  useEffect(() => {
    if (!pool || !post) return;

    const postIds = [post.id, ...replies.map(reply => reply.id)];

    const sub = pool.subscribeManyEose(
      RELAYS,
      postIds.map(postId => ({ kinds: [7], '#e': [postId] })),
      {
        onevent: (event: Event) => {
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
        },
      }
    );

    return () => {
      sub.close();
    };
  }, [pool, post, replies]);

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
        const publicKey = getPublicKey(skDecoded);
        signedEvent = {
          ...replyEvent,
          pubkey: publicKey,
          id: '',
          sig: '',
        };
      }

      await pool.publish(RELAYS, signedEvent);
      setReplyContent('');
      // Optionally, you can add the new reply to the replies state here
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
  };

  if (loading) {
    return <Loading vCentered={false} />;
  }

  if (!post) {
    return <div>Post not found</div>;
  }

  return (
    <div className="space-y-4">
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
        reactions={reactions}
        keyValue={keyValue}
        deleted={false}
        replies={replies.length}
        repostedEvent={null}
        metadata={metadata}
        allReactions={allReactions}
        allReplies={allReplies} repliedEvent={null}
        reposts={reposts.length}
        allReposts={null}
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
      {replies.sort((a, b) => b.created_at - a.created_at).map(reply => (
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
          />
      ))}
    </div>
  );
};

export default Post;
