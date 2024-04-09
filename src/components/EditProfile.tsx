
import { useState } from "react";
import { SimplePool } from "nostr-tools";
import { bech32Decoder } from "../utils/helperFunctions";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from "../utils/constants";

interface EditProfileProps {
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
  }

const EditProfile : React.FC<EditProfileProps> = (props: EditProfileProps) => {
    const [name, setName] = useState('');
    const [about, setAbout] = useState('');
    const [picture, setPicture] = useState('');


    async function saveProfile() {
        console.log('not implemented yet');
        if (!props.pool) return;
        const profile = {
            name: name,
            about: about,
            picture: picture
        }
        if (props.nostrExists) {
            let event = {
              kind: 0,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(profile),
            }
            await window.nostr.signEvent(event).then(async (eventToSend: any) => {
              await props.pool?.publish(RELAYS, eventToSend);
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
          }
    }

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