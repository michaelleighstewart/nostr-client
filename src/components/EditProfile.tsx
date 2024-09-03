
import { SimplePool } from "nostr-tools";
import { bech32Decoder } from "../utils/helperFunctions";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from "../utils/constants";
import { useState, useEffect } from "react";
import Loading from "./Loading";

interface EditProfileProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean | null;
}
export interface Metadata {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
  }

const EditProfile : React.FC<EditProfileProps> = (props: EditProfileProps) => {
    const [name, setName] = useState<string|undefined>('');
    const [about, setAbout] = useState<string|undefined>('');
    const [picture, setPicture] = useState<string|undefined>('');
    const [lightningAddress, setLightningAddress] = useState<string|undefined>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const fetchData = async() => {
            let authors = [];
            if (props.nostrExists) {
                let pk = await (window as any).nostr.getPublicKey();
                authors.push(pk);
            }
            else {
                let sk = props.keyValue;
                let skDecoded = bech32Decoder('nsec', sk);
                let pk = getPublicKey(skDecoded);
                authors.push(pk);
            }
            const subMeta = props.pool?.subscribeMany(RELAYS, [
                {
                kinds: [0],
                authors: authors,
                },
            ],
            {
                onevent(event) {
                const metadata = JSON.parse(event.content) as Metadata;
                setName(metadata.name);
                setAbout(metadata.about);
                setPicture(metadata.picture);
                setLightningAddress(metadata.nip05);
                setLoading(false);
                },
                oneose() {
                    subMeta?.close();
                    setLoading(false);
                }
            });
        }
        fetchData();
      }, [props.nostrExists]);


    async function saveProfile() {
        setLoading(true);
        if (!props.pool) return;
        const profile = {
            name: name,
            about: about,
            picture: picture,
            nip05: lightningAddress
        }
        if (props.nostrExists) {
            let event = {
              kind: 0,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(profile),
            }
            await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
              await props.pool?.publish(RELAYS, eventToSend);
              setLoading(false);
            });
          }
          else {
            let sk = props.keyValue;
            let skDecoded = bech32Decoder('nsec', sk);
            let pk = getPublicKey(skDecoded);
            let event = {
              kind: 0,
              pubkey: pk,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(profile),
            }
            let eventFinal = finalizeEvent(event, skDecoded);
            await props.pool?.publish(RELAYS, eventFinal);
            setLoading(false);
          }
    }

    if (loading) return <Loading vCentered={false}></Loading>

    return (
        <div className="py-64">
            <div>
                <div className="pb-24">
                    <label htmlFor="name" 
                        className="block mb-2 text-sm font-medium text-white">Name: </label>
                    <input type="text" id="name" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"John Smith"}
                        value={name}
                        onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="pb-24">
                    <label htmlFor="about" 
                        className="block mb-2 text-sm font-medium text-white">About: </label>
                    <input type="text" id="about" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Something about you..."}
                        value={about}
                        onChange={(e) => setAbout(e.target.value)} />
                </div>
                <div className="pb-24">
                    <label htmlFor="picture" 
                        className="block mb-2 text-sm font-medium text-white">Picture: </label>
                    <input type="text" id="picture" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Location of avatar picture"}
                        value={picture}
                        onChange={(e) => setPicture(e.target.value)} />
                </div>
                <div className="pb-24">
                    <label htmlFor="lightning-address"
                        className="block mb-2 text-sm font-medium text-white">Lightning Wallet Address: </label>
                    <input type="text" id="lightning-address"
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Lightning Wallet Address - eg. john@getalby.com"}
                        value={lightningAddress}
                        onChange={(e) => setLightningAddress(e.target.value)} /> 
                </div>
                <div className="h-64">
                    <div className="float-right">
                    <button 
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold p-16 rounded"
                        onClick={saveProfile}
                    >Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
  }
  
  export default EditProfile;