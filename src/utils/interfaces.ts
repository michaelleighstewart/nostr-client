export interface User {
    name: string;
    image: string | undefined;
    pubkey: string;
    nip05: string | undefined;
}

export type ExtendedEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  deleted: boolean;
  content: string;
  tags: string[][];
  repostedEvent: ExtendedEvent | null;
  repliedEvent: ExtendedEvent | null;
}

export interface Metadata {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export interface Reaction {
  id: string;
  liker_pubkey: string;
  type: string;
  sig: string;
}


export interface Reply {
  id: string;
  content: string;
  pubkey: string;
  created_at: number;
  hashtags: string[];
  reactions: Reaction[];
}

export interface ProfileData {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}