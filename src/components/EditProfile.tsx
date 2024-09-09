
import { SimplePool } from "nostr-tools";
import { bech32Decoder, getBase64 } from "../utils/helperFunctions";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from "../utils/constants";
import { useState, useEffect, useRef } from "react";
import Loading from "./Loading";
import { showCustomToast } from "./CustomToast";

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
    const [saving, setSaving] = useState(false);
    const [uploadingPicture, setUploadingPicture] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
      }, [props.nostrExists, props.keyValue, props.pool, saving]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            console.error('No file selected');
            return;
        }
    
        setUploadingPicture(true);
        try {
            const base64File = await getBase64(file); // Convert file to base64
            const contentType = file.type; // Get the MIME type of the file
        
            const response = await fetch('https://z2wavnt1bj.execute-api.us-west-2.amazonaws.com/prod/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ file: base64File, contentType })
            });
          
            const data = await response.json();
            const dataObj = JSON.parse(data.body);
            setPicture(dataObj.url); // Update the picture state with the S3 URL
        } catch (error) {
            console.error('Error uploading picture:', error);
            showCustomToast("Failed to upload picture. Please try again.");
        } finally {
            setUploadingPicture(false);
        }
    };

    async function saveProfile() {
        setSaving(true);
        if (!props.pool) {
            showCustomToast("Pool is not initialized");
            setSaving(false);
            return;
        }
        const profile = {
            name: name,
            about: about,
            picture: picture,
            nip05: lightningAddress
        }
        try {
            if (props.nostrExists) {
                let event = {
                  kind: 0,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [],
                  content: JSON.stringify(profile),
                }
                const eventToSend = await (window as any).nostr.signEvent(event);
                console.log("event from editprofile1", eventToSend);
                await props.pool.publish(RELAYS, eventToSend);
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
                console.log("event from editprofile2", event);
                let eventFinal = finalizeEvent(event, skDecoded);
                await props.pool.publish(RELAYS, eventFinal);
              }
            showCustomToast("Profile updated successfully!");
        } catch (error) {
            console.error("Error saving profile:", error);
            showCustomToast("Failed to update profile. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    if (loading || saving) return <Loading vCentered={false}></Loading>

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
                        onChange={(e) => setName(e.target.value)}
                        />
                </div>
                <div className="pb-24">
                    <label htmlFor="about" 
                        className="block mb-2 text-sm font-medium text-white">About: </label>
                    <input type="text" id="about" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Something about you..."}
                        value={about}
                        onChange={(e) => setAbout(e.target.value)}
                        />
                </div>
                <div className="pb-24">
                    <label htmlFor="picture" 
                        className="block mb-2 text-sm font-medium text-white">Picture: </label>
                    <input 
                        type="file" 
                        id="picture" 
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-16 rounded"
                        disabled={uploadingPicture}
                    >
                        {uploadingPicture ? 'Uploading...' : 'Choose File'}
                    </button>
                    {uploadingPicture && <Loading vCentered={false} />}
                    {picture && !uploadingPicture && (
                        <img src={picture} alt="Profile" className="mt-2 w-80 h-80 object-cover rounded-full" />
                    )}
                </div>
                <div className="pb-24">
                    <label htmlFor="lightning-address"
                        className="block mb-2 text-sm font-medium text-white">Lightning Wallet Address: </label>
                    <input type="text" id="lightning-address"
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Lightning Wallet Address - eg. john@getalby.com"}
                        value={lightningAddress}
                        onChange={(e) => setLightningAddress(e.target.value)}
                        /> 
                </div>
                <div className="h-64">
                    <div className="float-right">
                    <button 
                        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold p-16 rounded ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={saveProfile}
                        disabled={saving}
                    >
                        {'Save'}
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
  }
  
  export default EditProfile;