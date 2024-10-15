import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { SimplePool, Event, getPublicKey, SubCloser } from 'nostr-tools';
import NewMessageDialog from './NewMessageDialog';
import { getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';

interface MessagesProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface MessageGroup {
  pubkey: string;
  messages: Event[];
  userInfo: UserInfo | null;
}

interface UserInfo {
  name: string;
  picture: string;
}

const Messages: React.FC<MessagesProps> = ({ keyValue, pool, nostrExists }) => {
  const [messageGroups, setMessageGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const subscriptionMap = new Map<string, SubCloser>(); // To store subscriptions
  const poolRef = useRef(pool);
  const keyValueRef = useRef(keyValue);

  useEffect(() => {
    poolRef.current = pool;
    keyValueRef.current = keyValue;

    const fetchMessages = async () => {
      if (!pool) return;

      let userPubkey: string;
      if (nostrExists) {
        userPubkey = await (window as any).nostr.getPublicKey();
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        userPubkey = getPublicKey(skDecoded);
      }

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [4],
            authors: [userPubkey],
          },
          {
            kinds: [4],
            '#p': [userPubkey],
          }
        ],
        {
          onevent(event: Event) {
            setMessageGroups((prevGroups) => {
              const otherPubkey = event.pubkey === userPubkey ? event.tags.find(tag => tag[0] === 'p')?.[1] : event.pubkey;
              if (!otherPubkey) return prevGroups;

              const groupIndex = prevGroups.findIndex(group => group.pubkey === otherPubkey);
              if (groupIndex > -1) {
                const updatedGroup = {
                  ...prevGroups[groupIndex],
                  messages: [...prevGroups[groupIndex].messages, event].sort((a, b) => a.created_at - b.created_at),
                };
                
                // Unsubscribe after receiving the first message
                if (subscriptionMap.has(otherPubkey)) {
                  const userSub = subscriptionMap.get(otherPubkey);
                  userSub?.close();
                  subscriptionMap.delete(otherPubkey);
                }

                return [
                  ...prevGroups.slice(0, groupIndex),
                  updatedGroup,
                  ...prevGroups.slice(groupIndex + 1),
                ];
              } else {
                const newGroup = { pubkey: otherPubkey, messages: [event], userInfo: null };
                
                // Unsubscribe after receiving the first message
                if (subscriptionMap.has(otherPubkey)) {
                  const userSub = subscriptionMap.get(otherPubkey);
                  userSub?.close();
                  subscriptionMap.delete(otherPubkey);
                }
                
                fetchUserMetadata(otherPubkey);
                return [...prevGroups, newGroup];
              }
            });
          },
          oneose() {
            setLoading(false);
          },
        }
      );

      // Track subscription for the user
      subscriptionMap.set(userPubkey, sub);

      return () => {
        sub.close();
      };
    };

    fetchMessages();
  }, [nostrExists]);


  useEffect(() => {
    messageGroups.forEach(group => {
      if (!group.userInfo) {
        fetchUserMetadata(group.pubkey);
      }
    });
  }, [messageGroups]);

  const fetchUserMetadata = async (pubkey: string) => {
    if (!pool) return;
    
    // Check cache first
    const cachedMetadata = getMetadataFromCache(pubkey);
    if (cachedMetadata) {
      const userInfo: UserInfo = {
        name: cachedMetadata.name || '',
        picture: cachedMetadata.picture || '',
      };
      updateMessageGroupsWithUserInfo(pubkey, userInfo);
      return;
    }
  
    const metadata = await pool.querySync(RELAYS, {
      kinds: [0],
      authors: [pubkey],
    });
  
    if (metadata && metadata.length > 0) {
      const content = JSON.parse(metadata[0].content);
      const userInfo = {
        name: content.name || '',
        picture: content.picture || '',
      };
      setMetadataToCache(pubkey, userInfo);
      updateMessageGroupsWithUserInfo(pubkey, userInfo);
    }
  };

  const updateMessageGroupsWithUserInfo = (pubkey: string, userInfo: UserInfo) => {
    setMessageGroups((prevGroups) => {
      return prevGroups.map(group => 
        group.pubkey === pubkey ? { ...group, userInfo } : group
      );
    });
  };

  if (loading) return <div className="h-screen"><Loading vCentered={false} /></div>;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Messages</h1>
      <div>
      <button
        onClick={() => setIsDialogOpen(true)}
        className="mb-4 bg-[#535bf2] hover:bg-[#535bf2]-700 text-white font-bold py-2 px-16 rounded mt-16 mb-16"
      >
          Send New Message
        </button>
      </div>
      <div className="p-16">
        {messageGroups.map((group) => (
          <Link
            key={group.pubkey}
            to={`/conversation/${group.pubkey}`}
            className="block border-b border-gray-200 py-32 hover:bg-gray-50"
          >
            <div className="flex items-center pl-16 pr-16">
              {group.userInfo?.picture && (
                <img
                  src={group.userInfo.picture}
                  alt={group.userInfo.name || "User"}
                  className="w-64 h-64 rounded-full object-cover mr-4"
                />
              )}
              <div className="flex-grow">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{group.userInfo?.name || group.pubkey.slice(0, 8)}</span>
                  <span className="text-sm text-gray-500">
                    {new Date(group.messages[group.messages.length - 1].created_at * 1000).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <NewMessageDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        pool={pool}
        nostrExists={nostrExists}
        keyValue={keyValue}
      />
    </div>
  );
};

export default Messages;