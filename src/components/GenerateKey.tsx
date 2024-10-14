import { useState, useEffect, useRef, useCallback } from "react";
import { getPublicKey, generateSecretKey, finalizeEvent, SimplePool } from 'nostr-tools';
import { bech32 } from 'bech32';
import Loading from './Loading';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { showCustomToast } from './CustomToast';
import Ostrich from './Ostrich';
import { RELAYS } from "../utils/constants";
import { bech32Decoder } from "../utils/helperFunctions";
import { Helmet } from 'react-helmet';

interface GenerateKeyProps {
    setKeyValue: (value: string) => void;
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean | null;
    isLoggedIn: boolean;
}

const GenerateKey: React.FC<GenerateKeyProps> = ({ setKeyValue, pool, nostrExists, keyValue, isLoggedIn }) => {
    const [nsec, setNsec] = useState<string>('');
    const [npub, setNpub] = useState<string>('');
    const [localIsLoggedIn, setLocalIsLoggedIn] = useState<boolean>(isLoggedIn);
    const [showOstrich, setShowOstrich] = useState<boolean>(false);
    const [profileName, setProfileName] = useState<string>("Gnostrich");
    const [profilePicture, setProfilePicture] = useState<string>("https://ghostcopywrite-uploads.s3.us-west-2.amazonaws.com/ostrich.png");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSigningUp, setIsSigningUp] = useState<boolean>(false);
    const [showNpubDialog, setShowNpubDialog] = useState<boolean>(false);
    const [showNsecDialog, setShowNsecDialog] = useState<boolean>(false);

    const generateKeys = useCallback(async (pool: SimplePool | null) => {
        if (localIsLoggedIn) {
            let pk = '';
            if (nostrExists) {
                pk = await (window as any).nostr.getPublicKey();
            } else if (keyValue) {
                const skDecoded = bech32Decoder('nsec', keyValue);
                pk = getPublicKey(skDecoded);
            }
            const npubWords = bech32.toWords(new Uint8Array(pk.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))));
            const npubEncoded = bech32.encode('npub', npubWords);
            setNpub(npubEncoded);
            setNsec(keyValue);
            setIsLoading(false);
            return;
        }

        const storedPrivateKey = localStorage.getItem('privateKey');
        let privateKey: Uint8Array;
        
        if (storedPrivateKey) {
            const { words } = bech32.decode(storedPrivateKey);
            privateKey = new Uint8Array(bech32.fromWords(words));
        } else {
            privateKey = generateSecretKey();
        }

        const publicKey = getPublicKey(privateKey);

        const nsecWords = bech32.toWords(privateKey);
        const nsecEncoded = bech32.encode('nsec', nsecWords);

        const npubWords = bech32.toWords(new Uint8Array(publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))));
        const npubEncoded = bech32.encode('npub', npubWords);

        setNsec(nsecEncoded);
        setNpub(npubEncoded);

        if (storedPrivateKey) {
            setKeyValue(storedPrivateKey);
            setLocalIsLoggedIn(true);
        }
        pool?.subscribeMany(RELAYS, [
            {
            kinds: [0],
            authors: [publicKey],
            },
        ],
        {
            onevent(event) {
                if (event.kind === 0) {
                    setLocalIsLoggedIn(true);
                    setShowOstrich(true);
                }
            }
        });

        setIsLoading(false);
    }, [keyValue, setKeyValue, localIsLoggedIn, nostrExists]);

    useEffect(() => {
        generateKeys(pool);
    }, [generateKeys, pool]);

    useEffect(() => {
        if (!isLoading && !localIsLoggedIn) {
            setTimeout(() => {
                setShowNpubDialog(true);
            }, 1000);

            setTimeout(() => {
                setShowNpubDialog(false);
                setShowNsecDialog(true);
            }, 6000);

            setTimeout(() => {
                setShowNsecDialog(false);
            }, 11000);
        }
    }, [isLoading, localIsLoggedIn]);

    const handleSignUp = async () => {

        setIsSigningUp(true);
        let skDecoded = bech32Decoder('nsec', nsec);
        let pk = getPublicKey(skDecoded);

        const profile = {
            name: profileName,
            picture: profilePicture,
            nip05: "",
            website: ""
        }
        let event = {
            kind: 0,
            pubkey: pk,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(profile),
        }

        const privateKeyBytes = new Uint8Array(bech32.fromWords(bech32.decode(nsec).words));
        const _signedEvent = finalizeEvent(event, privateKeyBytes);
        
        try {
            await pool?.querySync(RELAYS, {
                kinds: [0],
                authors: [pk],
            });
            const verifiedEvent = await pool?.verifyEvent(_signedEvent);
            if (verifiedEvent) {
                await pool?.publish(RELAYS, _signedEvent);

                setKeyValue(nsec);
                localStorage.setItem('privateKey', nsec);
            }
            else {
                console.error("Event verification failed");
                showCustomToast("Failed to save profile. Please try again.", "error");
            }
        } catch (error) {
            console.error("Error publishing event:", error);
            showCustomToast("Failed to save profile. Please try again.", "error");
        } finally {
            setIsSigningUp(false);
        }
    };

    useEffect(() => {
        setShowOstrich(localIsLoggedIn);
    }, [localIsLoggedIn]);

    const copyToClipboard = (text: string, keyType: string) => {
        navigator.clipboard.writeText(text);
        showCustomToast(`${keyType} key copied to clipboard!`, 'success');
    };

    const handleScreenClick = () => {
        if (showOstrich) {
            setShowOstrich(false);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfilePicture(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    if (isLoading) {
        return <div className="h-screen"><Loading vCentered={true} /></div>;
    }

    return (
        <div className="py-64 relative" style={{ pointerEvents: 'auto' }} onClick={handleScreenClick}>
            <Helmet>
                <title>Ghostcopywrite | Sign Up Or Sign In</title>
                <meta property="og:title" content="Ghostcopywrite | Sign Up Or Sign In" />
                <meta property="og:description" content="Let Freedom Ring" />
                <meta property="og:image" content="https://ghostcopywrite.com/ostrich.png" />
                <meta property="og:url" content="https://ghostcopywrite.com/generate-key" />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Helmet>
            <div>
                <div className="pb-24 relative">
                    <label htmlFor="npub" className="block mb-2 text-sm font-medium text-white">Public Key (npub): </label>
                    <div className="flex">
                        <input type="text" id="npub" 
                            className="text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
                            value={npub}
                            readOnly
                            disabled={!!npub}
                        />
                        <button 
                            onClick={() => copyToClipboard(npub, 'Public')}
                            className="text-white font-bold py-2.5 px-4 rounded-r-lg"
                        >
                            <ClipboardDocumentIcon className="h-5 w-5" />
                        </button>
                    </div>
                    {showNpubDialog && (
                        <Ostrich
                            show={true}
                            onClose={() => {}}
                            text="Your public key (npub) is your username that other users on Nostr can identify you with"
                        />
                    )}
                </div>
                <div className="pb-24 relative">
                    <label htmlFor="nsec" className="block mb-2 text-sm font-medium text-white">Private Key (nsec): </label>
                    <div className="flex">
                        <input type={nostrExists && keyValue ? "password" : "text"} id="nsec" 
                            className="text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
                            value={nsec}
                            readOnly
                            disabled={!!nsec}
                        />
                        <button 
                            disabled={!!(nostrExists && keyValue)}
                            onClick={() => copyToClipboard(nsec, 'Private')}
                            className={`text-white font-bold py-2.5 px-4 rounded-r-lg ${
                                !!(nostrExists && keyValue) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            <ClipboardDocumentIcon className={`h-5 w-5 ${
                                !!(nostrExists && keyValue) ? 'text-gray-400' : ''
                            }`} />
                        </button>
                    </div>
                    {showNsecDialog && (
                        <Ostrich
                            show={true}
                            onClose={() => {}}
                            text="Your private key (nsec) is like your password, it is your self-sovereign identity on the Nostr network. Make sure to keep it safe"
                        />
                    )}
                </div>
                {!localIsLoggedIn && keyValue === "" && (
                    <>
                        <div className="pb-24 border border-gray-300 rounded-lg p-32">
                            <h3 className="text-lg font-medium text-white mb-32">Extra Information:</h3>
                            <div className="mb-8">
                                <label htmlFor="profileName" className="block mb-2 text-sm font-medium text-white">Name: </label>
                                <input
                                    type="text"
                                    id="profileName"
                                    className="text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                    value={profileName}
                                    onChange={(e) => setProfileName(e.target.value)}
                                />
                            </div>
                            <div className="mt-32">
                                <label htmlFor="profilePicture" className="block mb-2 text-sm font-medium text-white">Picture: </label>
                                <div className="flex items-center">
                                    <input
                                        type="file"
                                        id="profilePicture"
                                        accept="image/*"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        ref={fileInputRef}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-white font-bold py-2 px-4 rounded pl-16 pr-16"
                                    >
                                        Choose File
                                    </button>
                                    <span className="ml-3 text-sm text-white">
                                        {profilePicture === "https://ghostcopywrite-uploads.s3.us-west-2.amazonaws.com/ostrich.png" ? "Ostrich (Default)" : "Custom Image"}
                                    </span>
                                </div>
                                {profilePicture && (
                                    <img src={profilePicture} alt="Profile" className="mt-2 w-80 h-80 object-cover rounded-full" />
                                )}
                            </div>
                        </div>
                        <div className="pb-24 pt-16">
                            <button
                                onClick={handleSignUp}
                                className="text-white font-bold py-3 px-6 rounded"
                                disabled={isSigningUp}
                            >
                                {isSigningUp ? 'Signing Up...' : 'Sign Up'}
                            </button>
                        </div>
                    </>
                )}
            </div>
            <Ostrich show={showOstrich} onClose={() => setShowOstrich(false)} 
            text="You are now on the Nostr network! Now, go " 
            linkText="find some people to follow!" 
            linkUrl="/people-to-follow" />
        </div>
    );
}

export default GenerateKey;