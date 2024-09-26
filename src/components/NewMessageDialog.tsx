import React, { useState, useEffect } from 'react';
import { SimplePool, nip19, nip04, finalizeEvent } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import { showCustomToast } from './CustomToast';
import { RELAYS } from '../utils/constants';
import { getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';

interface NewMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pool: SimplePool | null;
  nostrExists: boolean | null;
  keyValue: string;
  initialRecipientNpub?: string;
}

interface UserInfo {
  name: string;
  picture: string;
}

const NewMessageDialog: React.FC<NewMessageDialogProps> = ({ isOpen, onClose, pool, nostrExists, keyValue, initialRecipientNpub }) => {
  const [recipientNpub, setRecipientNpub] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    if (initialRecipientNpub) {
      setRecipientNpub(initialRecipientNpub);
      fetchUserMetadata(initialRecipientNpub);
    }
  }, [initialRecipientNpub]);

  const fetchUserMetadata = async (npub: string) => {
    if (!pool) return;

    try {
      const pubkey = nip19.decode(npub).data as string;

      // Check cache first
      const cachedMetadata = getMetadataFromCache(pubkey);
      if (cachedMetadata) {
        setRecipientInfo({
          name: cachedMetadata.name || '',
          picture: cachedMetadata.picture || '',
        });
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
        setRecipientInfo(userInfo);
      }
    } catch (error) {
      console.error('Error fetching user metadata:', error);
    }
  };

  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNpub = e.target.value;
    setRecipientNpub(newNpub);
    if (newNpub.startsWith('npub1')) {
      fetchUserMetadata(newNpub);
    } else {
      setRecipientInfo(null);
    }
  };

  const handleSendMessage = async () => {
    if (!pool || !recipientNpub || !messageContent.trim()) return;

    setIsSending(true);

    try {
      const recipientPubkey = nip19.decode(recipientNpub).data as string;
      let userPubkey: string;
      let encryptedContent: string;

      if (nostrExists) {
        userPubkey = await (window as any).nostr.getPublicKey();
        encryptedContent = await (window as any).nostr.nip04.encrypt(recipientPubkey, messageContent);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        userPubkey = skDecoded.toString('hex');
        encryptedContent = await nip04.encrypt(userPubkey, recipientPubkey, messageContent);
      }

      let event = {
        kind: 4,
        pubkey: userPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPubkey]],
        content: encryptedContent,
      };

      if (nostrExists) {
        await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
          await pool?.publish(RELAYS, eventToSend);
        });
      } else {
        let skDecoded = bech32Decoder('nsec', keyValue);
        let eventFinal = finalizeEvent(event, skDecoded);
        await pool?.publish(RELAYS, eventFinal);
      }

      showCustomToast("Message sent successfully!", "success");
      onClose();
      setRecipientNpub('');
      setMessageContent('');
      setRecipientInfo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      showCustomToast("Failed to send message", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-gray-800">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-white">Send New Message</h3>
          <div className="mt-2 px-7 py-3">
            {initialRecipientNpub ? (
              recipientInfo && (
                <div className="mt-2 flex items-center justify-center pb-32">
                  {recipientInfo.picture && (
                    <img
                      src={recipientInfo.picture}
                      alt={recipientInfo.name || "Recipient"}
                      className="w-8 h-8 rounded-full mr-2"
                    />
                  )}
                  <span className="text-white">{recipientInfo.name || "Unknown"}</span>
                </div>
              )
            ) : (
              <>
                <input
                  type="text"
                  value={recipientNpub}
                  onChange={handleRecipientChange}
                  placeholder="Recipient's npub"
                  className="px-8 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-black"
                />
                {recipientInfo && (
                  <div className="mt-2 flex items-center">
                    {recipientInfo.picture && (
                      <img
                        src={recipientInfo.picture}
                        alt={recipientInfo.name || "Recipient"}
                        className="w-8 h-8 rounded-full mr-2"
                      />
                    )}
                    <span className="text-white">{recipientInfo.name || "Unknown"}</span>
                  </div>
                )}
              </>
            )}
            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder="Message content"
              className="px-8 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-black"
              rows={4}
            />
          </div>
          <div className="items-center px-4 py-3">
            <button
              onClick={handleSendMessage}
              disabled={isSending}
              className="px-4 py-2 bg-[#535bf2]-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-[#535bf2]-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewMessageDialog;