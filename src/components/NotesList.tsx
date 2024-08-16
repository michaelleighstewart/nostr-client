import { Event, nip19 } from "nostr-tools";
import NoteCard from "./NoteCard";
import { Metadata, Reaction } from "./Home";
import { SimplePool } from "nostr-tools";

interface Props {
    notes: Event[];
    metadata: Record<string, Metadata>;
    pool: SimplePool | null;
    nostrExists: boolean;
    reactions: Record<string, Reaction[]>;
}

export default function NotesList({ notes, metadata, pool, nostrExists, reactions } : Props) {
    return (
        <div className="flex flex-col gap-16">
            {notes.map((note) => (
                <NoteCard
                id={note.id}
                created_at={note.created_at}
                user={{
                    name:
                      metadata[note.pubkey]?.name ??
                      `${nip19.npubEncode(note.pubkey).slice(0, 12)}...`,
                    image:
                      metadata[note.pubkey]?.picture,
                    pubkey: note.pubkey,
                    nip05: metadata[note.pubkey]?.nip05
                  }}
                key={note.id}
                content={note.content}
                hashtags={note.tags.filter((t) => t[0] === "t").map((t) => t[1])}
                pool={pool}
                nostrExists={nostrExists}
                reactions={reactions[note.id]}
                />
            ))}
        </div>
    )
}