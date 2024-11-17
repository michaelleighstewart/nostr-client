import { nip19 } from "nostr-tools";
import NoteCard from "./NoteCard";
import { SimplePool } from "nostr-tools";
import { ExtendedEvent, Metadata } from "../utils/interfaces";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
    notes: ExtendedEvent[];
    metadata: Record<string, Metadata>;
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>;
    pool: SimplePool | null;
    nostrExists: boolean | null;
    keyValue: string;
    initialLoadComplete: boolean;
    calculateConnectionInfo: (notePubkey: string) => {
        degree: number;
        connectedThrough?: {
          name: string;
          picture: string;
        };
      } | null;
}

const NotesList = React.memo(({ notes, metadata, setMetadata, pool, nostrExists, keyValue, initialLoadComplete, calculateConnectionInfo }: Props) => {
    const [visibleNotes, setVisibleNotes] = useState<ExtendedEvent[]>([]);
    const isLoggedIn = nostrExists || !!keyValue;

    const navigate = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isLoggedIn) {
                setVisibleNotes(notes);
            } else {
                setVisibleNotes(prevNotes => {
                    const newNotes = notes.slice(0, 10);
                    const addedNotes = newNotes.filter(note => !prevNotes.some(prevNote => prevNote.id === note.id));
                    return [...addedNotes, ...prevNotes].slice(0, 10);
                });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [notes, isLoggedIn, keyValue, nostrExists]);

    if (!initialLoadComplete || visibleNotes.length === 0) {
        return (
            <div className="flex flex-col gap-16">
                <p className="text-center text-gray-500">Waiting for recent notes...</p>
            </div>
        )
    }

    const handleUserClick = (userPubkey: string) => {
        const userNpub = nip19.npubEncode(userPubkey);
        navigate(`/profile/${userNpub}`);
      };

    return (
        <div className="w-full">
            {visibleNotes.map((note, _index) => (
                <div key={note.id} className="mb-4 py-16">
                    <NoteCard
                        event={note}
                        referencedNoteInput={null}
                        isPreview={false}
                        id={note.id}
                        created_at={note.created_at}
                        user={{
                            name: metadata[note.pubkey]?.name ?? `${nip19.npubEncode(note.pubkey).slice(0, 12)}...`,
                            image: metadata[note.pubkey]?.picture,
                            pubkey: note.pubkey,
                            nip05: metadata[note.pubkey]?.nip05
                        }}
                        content={note.content}
                        hashtags={note.tags.filter((t) => t[0] === "t").map((t) => t[1])}
                        pool={pool}
                        nostrExists={nostrExists}
                        //reactions={reactions[note.id]}
                        //allReactions={reactions}
                        keyValue={keyValue}
                        //replies={replies?.[note.id]?.length ?? 0}
                        //allReplies={replies}
                        deleted={note.deleted}
                        repostedEvent={note.repostedEvent}
                        repliedEvent={note.repliedEvent}
                        metadata={metadata}
                        //reposts={reposts?.[note.id]?.length ?? 0}
                        //allReposts={reposts}
                        setMetadata={setMetadata}
                        connectionInfo={calculateConnectionInfo(note.pubkey)}
                        rootEvent={note.rootEvent}
                        onUserClick={() => {handleUserClick(note.pubkey)}}
                    />
                </div>
            ))}
        </div>
    );
});

export default NotesList;