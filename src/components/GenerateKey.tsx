
import { useState, useEffect } from "react";
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { bech32 } from 'bech32';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

interface GenerateKeyProps {
    setKeyValue: (value: string) => void;
    keyValue: string;
}

const GenerateKey: React.FC<GenerateKeyProps> = ({ setKeyValue, keyValue }) => {
    const [nsec, setNsec] = useState<string>('');
    const [npub, setNpub] = useState<string>('');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

    const generateKeys = () => {
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
            setIsLoggedIn(true);
        }
    };

    useEffect(() => {
        generateKeys();
    }, []);

    const handleLogin = () => {
        setKeyValue(nsec);
        setIsLoggedIn(true);
        localStorage.setItem('privateKey', nsec);
    };

    const copyToClipboard = (text: string, keyType: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${keyType} key copied to clipboard!`);
    };

    return (
        <div className="py-64" style={{ pointerEvents: 'auto' }}>
            <div>
                <div className="pb-24">
                    <label htmlFor="nsec" className="block mb-2 text-sm font-medium text-white">Private Key (nsec): </label>
                    <div className="flex">
                        <input type="text" id="nsec" 
                            className="text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
                            value={nsec}
                            readOnly
                            disabled={!!nsec}
                        />
                        <button 
                            onClick={() => copyToClipboard(nsec, 'Private')}
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-r-lg"
                        >
                            <ClipboardDocumentIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div className="pb-24">
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
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-r-lg"
                        >
                            <ClipboardDocumentIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                {!isLoggedIn && (
                    <div className="pb-24">
                        <button
                            onClick={handleLogin}
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded"
                        >
                            Login
                        </button>
                    </div>
                )}
            </div>
            {keyValue && (
                <div className="mt-8 text-center">
                    <p className="text-white mb-4 pb-32">You are now on the Nostr network! Go and find some people to follow!</p>
                    <Link to="/people-to-follow" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded">
                        Find People to Follow
                    </Link>
                </div>
            )}
            {!nsec && !npub && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
                    <Loading vCentered={false} />
                </div>
            )}
        </div>
    );
}

export default GenerateKey;