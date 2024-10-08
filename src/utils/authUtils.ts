import { bech32Decoder } from './helperFunctions';
import { EventTemplate, finalizeEvent } from 'nostr-tools';

export async function createAuthHeader(method: string, path: string,
    nostrExists: boolean, keyValue: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${method}:${path}:${timestamp}`;
  let event = {
    kind: 222420,
    content: message,
    created_at: parseInt(timestamp),
    tags: [],
  };
  let signature: any;
  if (nostrExists) {
    try {
      signature = await (window as any).nostr.signEvent(event);
    } catch {
      console.log("Unable to sign event");
    }
  }
  else {
    try {
        let sk = keyValue ?? "";
        let skDecoded = bech32Decoder('nsec', sk);
        const eventTemplate: EventTemplate = {
            kind: 222420,
            content: message,
            created_at: parseInt(timestamp),
            tags: [],
          };
        signature = finalizeEvent(eventTemplate, skDecoded);
    } catch {
      console.log("Unable to sign event");
    }
  }
  const token = btoa(`${timestamp}:${signature.sig}`);
  return `Bearer ${token}`;
}