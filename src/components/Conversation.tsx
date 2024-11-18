import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SimplePool, Event, getPublicKey, nip04, finalizeEvent } from 'nostr-tools';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';

interface ConversationProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface Message {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
}

interface UserMetadata {
  picture?: string;
  name?: string;
}

const Conversation: React.FC<ConversationProps> = ({ keyValue, pool, nostrExists }) => {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPubkey, setUserPubkey] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [newMessage, setNewMessage] = useState<string>('');
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState<number>(Math.floor(Date.now() / 1000));
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [userMetadata, setUserMetadata] = useState<Record<string, UserMetadata>>({});
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [isPoolReady, setIsPoolReady] = useState(false);

  useEffect(() => {
    const fetchUserPubkey = async () => {
      if (nostrExists) {
        const pubkey = await (window as any).nostr.getPublicKey();
        setUserPubkey(pubkey);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        const pubkey = getPublicKey(skDecoded);
        setUserPubkey(pubkey);
        setPrivateKey(skDecoded.toString('hex'));
      }
    };

    fetchUserPubkey();
  }, [keyValue, nostrExists]);

  const fetchMessages = async (until: number) => {
    if (!pool || !id || !userPubkey) return;
    let gotAnyMessages = false;
    const sub = pool.subscribeMany(
      RELAYS,
      [
        {
          kinds: [4],
          authors: [userPubkey],
          '#p': [id],
          until,
          limit: 10,
        },
        {
          kinds: [4],
          authors: [id],
          '#p': [userPubkey],
          until,
          limit: 10,
        }
      ],
      {
        async onevent(event: Event) {
          let decryptedContent: string;
          try {
            if (event.pubkey === userPubkey) {
              if (nostrExists) {
                decryptedContent = await (window as any).nostr.nip04.decrypt(id, event.content);
              } else {
                decryptedContent = await nip04.decrypt(privateKey, id, event.content);
              }
            } else {
              if (nostrExists) {
                decryptedContent = await (window as any).nostr.nip04.decrypt(event.pubkey, event.content);
              } else {
                decryptedContent = await nip04.decrypt(privateKey, event.pubkey, event.content);
              }
            }
          } catch (error) {
            console.error("Error decrypting message:", error);
            decryptedContent = "Error decrypting message";
          }

          const newMessage: Message = {
            id: event.id,
            content: decryptedContent,
            created_at: event.created_at,
            pubkey: event.pubkey,
          };

          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages, newMessage]
              .sort((a, b) => b.created_at - a.created_at);
            if (updatedMessages.length > 0) {
              gotAnyMessages = true;
              setHasOlderMessages(true);
              // Store the timestamp of the latest message
              localStorage.setItem(`lastViewedMessage_${userPubkey}`, String(Math.max(...updatedMessages.map(m => m.created_at))));
            }
            return updatedMessages;
          });

          setOldestMessageTimestamp(prevTimestamp => Math.min(prevTimestamp, event.created_at));
          
        },
        oneose() {
          if (!gotAnyMessages) {
            setHasOlderMessages(false);
          }
          setLoading(false);
          setLoadingOlderMessages(false);
        },
      }
    );

    return () => {
      sub.close();
    };
  };

  useEffect(() => {
    if (pool) {
      const isReady = RELAYS.every(relay => pool?.ensureRelay(relay));
      setIsPoolReady(isReady);
    }
  }, [pool]);

  useEffect(() => {
    if (!isPoolReady) return;
    const initialFetch = fetchMessages(Math.floor(Date.now() / 1000));
    
    // Set up a subscription for new messages
    const newMessagesSub = pool?.subscribeMany(
      RELAYS,
      [
        {
          kinds: [4],
          authors: [id ?? ''],
          '#p': [userPubkey ?? ''],
          since: Math.floor(Date.now() / 1000),
        }
      ],
      {
        async onevent(event: Event) {
          let decryptedContent: string;
          try {
            if (nostrExists) {
              decryptedContent = await (window as any).nostr.nip04.decrypt(event.pubkey, event.content);
            } else {
              decryptedContent = await nip04.decrypt(privateKey, event.pubkey, event.content);
            }
          } catch (error) {
            console.error("Error decrypting new message:", error);
            decryptedContent = "Error decrypting message";
          }

          const newMessage: Message = {
            id: event.id,
            content: decryptedContent,
            created_at: event.created_at,
            pubkey: event.pubkey,
          };

          setMessages(prevMessages => {
            const updatedMessages = [newMessage, ...prevMessages];
            // Store the timestamp of the latest message
            localStorage.setItem(`lastViewedMessage_${userPubkey}`, String(Math.max(...updatedMessages.map(m => m.created_at))));
            return updatedMessages;
          });
        },
      }
    );

    return () => {
      initialFetch.then(unsubscribe => unsubscribe?.());
      newMessagesSub?.close();
    };
  }, [pool, isPoolReady, id, userPubkey, nostrExists, privateKey]);

  useEffect(() => {
    const fetchUserMetadata = async () => {
      if (!pool || !id || !userPubkey) return;

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [0],
            authors: [userPubkey, id],
          },
        ],
        {
          onevent(event: Event) {
            try {
              const metadata = JSON.parse(event.content);
              setUserMetadata(prev => ({
                ...prev,
                [event.pubkey]: {
                  picture: metadata.picture,
                  name: metadata.name,
                },
              }));
            } catch (error) {
              console.error("Error parsing user metadata:", error);
            }
          },
        }
      );

      return () => {
        sub.close();
      };
    };

    fetchUserMetadata();
  }, [pool, id, userPubkey]);

  const handleSendMessage = async () => {
    if (!pool || !id || !userPubkey || !newMessage.trim()) return;

    let encryptedContent: string;
    if (nostrExists) {
      encryptedContent = await (window as any).nostr.nip04.encrypt(id, newMessage);
    } else {
      encryptedContent = await nip04.encrypt(privateKey, id, newMessage);
    }

    let event = {
      kind: 4,
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', id]],
      content: encryptedContent,
    };

    let signedEvent;
    if (nostrExists) {
        signedEvent = await (window as any).nostr.signEvent(event);
    } else {
        let sk = keyValue;
        let skDecoded = bech32Decoder('nsec', sk);
        signedEvent = finalizeEvent(event, skDecoded);
    }

    await pool?.publish(RELAYS, signedEvent);

    // Add the new message to the messages state
    const newMessageObj: Message = {
      id: signedEvent.id,
      content: newMessage,
      created_at: signedEvent.created_at,
      pubkey: userPubkey,
    };

    setMessages(prevMessages => {
      const updatedMessages = [newMessageObj, ...prevMessages];
      // Store the timestamp of the latest message
      localStorage.setItem(`lastViewedMessage_${userPubkey}`, String(Math.max(...updatedMessages.map(m => m.created_at))));
      return updatedMessages;
    });
    setNewMessage('');
  };

  const handleLoadOlderMessages = () => {
    setLoadingOlderMessages(true);
    fetchMessages(oldestMessageTimestamp - 1);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const imageRegex = /\.(jpeg|jpg|gif|png)$/i;
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([^\s&]+)/;
    const videoRegex = /\.(mp4|webm|ogg)$/i;
  
    let youtubeVideoId = null;
    const parts = content.split(urlRegex);
  
    const processedContent = parts.map((part, index) => {
      if (part.match(urlRegex)) {
        if (part.match(imageRegex)) {
          return <img key={index} src={part} alt="Embedded content" className="max-w-full h-auto cursor-pointer" onClick={() => setModalImage(part)} />;
        } else if (part.match(youtubeRegex)) {
          const match = part.match(youtubeRegex);
          if (match && match[1]) {
            youtubeVideoId = match[1];
          }
          return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
        } else if (part.match(videoRegex)) {
          return <video key={index} src={part} controls className="max-w-full h-auto" />;
        } else {
          return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
        }
      } else {
        return part;
      }
    });
  
    return (
      <>
        <p>{processedContent}</p>
        {youtubeVideoId && (
          <div className="mt-2">
            <iframe
              width="100%"
              height="315"
              src={`https://www.youtube.com/embed/${youtubeVideoId}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        )}
      </>
    );
  };

  if (loading) return <div className="h-screen"><Loading vCentered={false} /></div>;

  const conversationPartner = id && userMetadata[id]?.name || id?.slice(0, 8) || 'Unknown';

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4 pb-4">Conversation with {conversationPartner}</h1>
      <div className="flex mb-4 pb-64">
        <textarea
          ref={textareaRef}
          value={newMessage}
          onChange={handleTextareaChange}
          className="flex-grow border rounded-l px-4 py-2 bg-white text-black resize-none overflow-hidden"
          placeholder="Type your message..."
          rows={1}
          style={{ minHeight: '40px' }}
        />
        <button
          onClick={handleSendMessage}
          className="text-white px-4 py-2 rounded-r"
        >
          Send
        </button>
      </div>
      <div className="space-y-16 mb-16">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-16 rounded-lg flex ${
              message.pubkey === userPubkey ? 'bg-[#535bf2] bg-opacity-20 ml-auto text-white' : 'bg-gray-100 text-black'
            } max-w-[70%]`}
          >
            <Link to={`/profile/${message.pubkey}`}>
              <img
                src={userMetadata[message.pubkey]?.picture || '/ostrich.png'}
                alt={userMetadata[message.pubkey]?.name || 'User'}
                className="w-32 h-32 rounded-full object-cover mr-32"
              />
            </Link>
            <div className="pl-8">
              <p>{renderMessageContent(message.content)}</p>
              <span className="text-xs text-gray-500">
                {new Date(message.created_at * 1000).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleLoadOlderMessages}
        className="w-full bg-gray-200 text-gray-800 py-2 rounded"
        disabled={loadingOlderMessages || !hasOlderMessages}
      >
        {loadingOlderMessages ? 'Loading...' : hasOlderMessages ? 'Load Older Messages' : 'No Older Messages'}
      </button>
      {modalImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalImage(null)}>
          <img src={modalImage} alt="Enlarged view" className="max-w-[90%] max-h-[90%] object-contain" />
        </div>
      )}
    </div>
  );
};

export default Conversation;