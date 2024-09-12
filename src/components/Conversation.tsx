import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SimplePool, Event, getPublicKey, nip04, finalizeEvent } from 'nostr-tools';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { toast } from 'react-toastify';

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
          console.log("message event", event);
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

          console.log("new message", newMessage);

          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages, newMessage]
              .sort((a, b) => b.created_at - a.created_at);
            return updatedMessages;
          });

          setOldestMessageTimestamp(prevTimestamp => Math.min(prevTimestamp, event.created_at));
        },
        oneose() {
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
    fetchMessages(Math.floor(Date.now() / 1000));
  }, [pool, id, userPubkey, nostrExists, privateKey]);

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

    if (nostrExists) {
        await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
            await pool?.publish(RELAYS, eventToSend);
        });
    }
    else {
        let sk = keyValue;
        let skDecoded = bech32Decoder('nsec', sk);
        let eventFinal = finalizeEvent(event, skDecoded);
        await pool?.publish(RELAYS, eventFinal);
    }
    toast.success("Message sent successfully!");
    setNewMessage('');
  };

  const handleLoadOlderMessages = () => {
    setLoadingOlderMessages(true);
    fetchMessages(oldestMessageTimestamp - 1);
  };

  if (loading) return <Loading vCentered={false} />;

  const conversationPartner = id && userMetadata[id]?.name || id?.slice(0, 8) || 'Unknown';

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4 pb-4">Conversation with {conversationPartner}</h1>
      <div className="flex mb-4 pb-64">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-grow border rounded-l px-4 py-2 text-black"
          placeholder="Type your message..."
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
            <img
              src={userMetadata[message.pubkey]?.picture || 'default-avatar.png'}
              alt={userMetadata[message.pubkey]?.name || 'User'}
              className="w-32 h-32 rounded-full mr-16"
            />
            <div>
              <p>{message.content}</p>
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
        disabled={loadingOlderMessages}
      >
        {loadingOlderMessages ? 'Loading...' : 'Load Older Messages'}
      </button>
    </div>
  );
};

export default Conversation;