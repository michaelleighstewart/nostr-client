
import { useState, useEffect } from "react";
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { bech32 } from 'bech32';

const GenerateKey: React.FC = () => {
    const [nsec, setNsec] = useState<string>('');
    const [npub, setNpub] = useState<string>('');

    const generateKeys = () => {

        const privateKey = generateSecretKey();
        const publicKey = getPublicKey(privateKey);

        const nsecWords = bech32.toWords(privateKey);

        const nsecEncoded = bech32.encode('nsec', nsecWords);

        setNsec(nsecEncoded);
        setNpub(publicKey);
    };

    useEffect(() => {
        generateKeys();
    }, []);

    return (
        <div className="py-64">
            {nsec && npub ? (
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
                </div>
            ) : (
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
                </div>
            )}
        </div>
    );
}

export default GenerateKey;