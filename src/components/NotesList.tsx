import { nip19 } from "nostr-tools";
import NoteCard from "./NoteCard";
import { SimplePool } from "nostr-tools";
import { ExtendedEvent, Metadata, Reaction } from "../utils/interfaces";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
    notes: ExtendedEvent[];
    metadata: Record<string, Metadata>;
    pool: SimplePool | null;
    nostrExists: boolean | null;
    reactions: Record<string, Reaction[]>;
    keyValue: string;
    replies: Record<string, ExtendedEvent[]>;
    reposts: Record<string, ExtendedEvent[]>;
}

export default function NotesList({ notes, metadata, pool, nostrExists, reactions, keyValue, replies, reposts } : Props) {
    const [visibleNotes, setVisibleNotes] = useState<ExtendedEvent[]>([]);
    const isLoggedIn = nostrExists || !!keyValue;

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isLoggedIn) {
                setVisibleNotes(notes);
            } else {
                // When not logged in, only show the most recent 10 notes
                setVisibleNotes(prevNotes => {
                    const newNotes = notes.slice(0, 10);
                    // Find new notes that are not in the previous visible notes
                    const addedNotes = newNotes.filter(note => !prevNotes.some(prevNote => prevNote.id === note.id));
                    // Combine new notes with previous notes, keeping only the most recent 10
                    return [...addedNotes, ...prevNotes].slice(0, 10);
                });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [notes, isLoggedIn, keyValue, nostrExists]);

    if (notes.length === 0) {
        return (
            <div className="flex flex-col gap-16">
                <p className="text-center text-gray-500">Waiting for recent notes...</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-16">
            <AnimatePresence>
                {visibleNotes.map((note, index) => (
                    <motion.div
                        key={`${note.id}-${note.deleted}`}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                        <div className="pb-32">
                            <NoteCard
                                isPreview={false}
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
                                allReactions={reactions}
                                keyValue={keyValue}
                                replies={replies?.[note.id]?.length ?? 0}
                                allReplies={replies}
                                deleted={note.deleted}
                                repostedEvent={note.repostedEvent}
                                repliedEvent={note.repliedEvent}
                                metadata={metadata}
                                reposts={reposts?.[note.id]?.length ?? 0}
                                allReposts={reposts}
                            />
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}