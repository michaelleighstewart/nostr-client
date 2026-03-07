import React, { useState, useEffect } from 'react';
import { SimplePool, nip19, nip04, finalizeEvent } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import { showCustomToast } from './CustomToast';
import { RELAYS } from '../utils/constants';
import { getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';

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
      let pubkey = npub;
      if (pubkey.startsWith("npub")) {
        pubkey = nip19.decode(npub).data as string;
      }

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
        try {
          userPubkey = await (window as any).nostr.getPublicKey();
          encryptedContent = await (window as any).nostr.nip04.encrypt(recipientPubkey, messageContent);
        } catch (error) {
          console.warn("Nostr extension error:", (error as Error).message);
          const skDecoded = bech32Decoder('nsec', keyValue);
          userPubkey = skDecoded.toString('hex');
          encryptedContent = await nip04.encrypt(userPubkey, recipientPubkey, messageContent);
        }
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
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card w-96 max-w-full p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mt-3 text-center">
          <ChatBubbleLeftRightIcon className="mx-auto h-64 w-64 text-violet-600" />
          <div className="mt-2 px-7 py-3">
            {initialRecipientNpub ? (
              recipientInfo && (
                <div className="mt-2 flex items-center justify-center pb-32">
                  {recipientInfo.picture && (
                    <img
                      src={recipientInfo.picture}
                      alt={recipientInfo.name || "Recipient"}
                      className="w-64 h-64 rounded-full object-cover mr-2"
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
                  className="input-field mt-1"
                />
                {recipientInfo && (
                  <div className="mt-2 flex items-center">
                    {recipientInfo.picture && (
                      <img
                        src={recipientInfo.picture}
                        alt={recipientInfo.name || "Recipient"}
                        className="w-8 h-8 rounded-full object-cover mr-2"
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
              className="input-field mt-1"
              rows={4}
            />
          </div>
          <div className="items-center px-4 py-3 space-y-3">
            <button
              onClick={handleSendMessage}
              disabled={isSending}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={onClose}
              className="btn-secondary w-full"
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