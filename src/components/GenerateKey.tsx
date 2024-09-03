
import { useState, useEffect } from "react";
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { bech32 } from 'bech32';

interface GenerateKeyProps {
    setKeyValue: (value: string) => void;
}

const GenerateKey: React.FC<GenerateKeyProps> = ({ setKeyValue }) => {
    const [nsec, setNsec] = useState<string>('');
    const [npub, setNpub] = useState<string>('');

    const generateKeys = () => {
        const privateKey = generateSecretKey();
        const publicKey = getPublicKey(privateKey);

        const nsecWords = bech32.toWords(privateKey);
        const nsecEncoded = bech32.encode('nsec', nsecWords);

        const npubWords = bech32.toWords(new Uint8Array(publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))));
        const npubEncoded = bech32.encode('npub', npubWords);

        setNsec(nsecEncoded);
        setNpub(npubEncoded);
    };

    useEffect(() => {
        generateKeys();
    }, []);

    const handleLogin = () => {
        setKeyValue(nsec);
    };

    return (
        <div className="py-64" style={{ pointerEvents: 'auto' }}>
            <div>
                <div className="pb-24">
                    <label htmlFor="nsec" className="block mb-2 text-sm font-medium text-white">Private Key (nsec): </label>
                    <input type="text" id="nsec" 
                        className="text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
                        value={nsec}
                        readOnly
                    />
                </div>
                <div className="pb-24">
                    <label htmlFor="npub" className="block mb-2 text-sm font-medium text-white">Public Key (npub): </label>
                    <input type="text" id="npub" 
                        className="text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
                        value={npub}
                        readOnly
                    />
                </div>
                <div className="pb-24">
                    <button
                        onClick={handleLogin}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded"
                    >
                        Login
                    </button>
                </div>
            </div>
            {!nsec && !npub && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
                    <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
                </div>
            )}
        </div>
    );
}

export default GenerateKey;