import React, { useState, useEffect } from 'react';
import { Event, nip19, nip44 } from 'nostr-tools';

interface DecryptedMessageProps {
  message: Event;
  keyValue?: string;
}

const DecryptedMessage: React.FC<DecryptedMessageProps> = ({ message, keyValue }) => {
  const [decryptedContent, setDecryptedContent] = useState<string>('');

  useEffect(() => {
    const decryptMessage = async () => {
      try {
        let decryptedContent: string;
        const nostrExists = (window as any).nostr;

        if (nostrExists) {
          decryptedContent = await (window as any).nostr.nip44.decrypt(message.pubkey, message.content);
        } else if (keyValue) {
          const privateKeyHex = nip19.decode(keyValue).data as string;
          const conversationKey = nip44.v2.utils.getConversationKey(privateKeyHex, message.pubkey);
          
          // Attempt to decode the payload before decryption
          //const decodedPayload = nip44.v2.utils.decodePayload(message.content);

          decryptedContent = nip44.v2.decrypt(message.content, conversationKey);
        } else {
          throw new Error('No decryption method available');
        }

        setDecryptedContent(decryptedContent);
      } catch (error) {
        console.error('Error decrypting message:', error);
        setDecryptedContent(`Failed to decrypt message: ${(error as Error).message}`);
      }
    };

    decryptMessage();
  }, [message, keyValue]);

  return <span>{decryptedContent}</span>;
};

export default DecryptedMessage;
