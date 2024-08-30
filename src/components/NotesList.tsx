import { nip19 } from "nostr-tools";
import NoteCard from "./NoteCard";
import { Metadata, Reaction } from "./Home";
import { SimplePool } from "nostr-tools";
import { ExtendedEvent } from "../utils/helperFunctions";

interface Props {
    notes: ExtendedEvent[];
    metadata: Record<string, Metadata>;
    pool: SimplePool | null;
    nostrExists: boolean;
    reactions: Record<string, Reaction[]>;
    keyValue: string;
}

export default function NotesList({ notes, metadata, pool, nostrExists, reactions, keyValue } : Props) {
    if (notes.length === 0) {
        return (
            <div className="flex flex-col gap-16">
                <p className="text-center text-gray-500">Waiting for recent notes...</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-16">
            {notes.map((note) => (
                <NoteCard
                key={`${note.id}-${note.deleted}`}
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
                content={note.content}
                hashtags={note.tags.filter((t) => t[0] === "t").map((t) => t[1])}
                pool={pool}
                nostrExists={nostrExists}
                reactions={reactions[note.id]}
                keyValue={keyValue}
                deleted={note.deleted}
                />
            ))}
        </div>
    )
}