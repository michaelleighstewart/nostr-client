
import { useState, useEffect } from "react";
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { bech32 } from 'bech32';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';

interface GenerateKeyProps {
    setKeyValue: (value: string) => void;
    keyValue: string;
}

const GenerateKey: React.FC<GenerateKeyProps> = ({ setKeyValue }) => {
    const [nsec, setNsec] = useState<string>('');
    const [npub, setNpub] = useState<string>('');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [showOstrich, setShowOstrich] = useState<boolean>(false);

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
        // Delay showing the ostrich to ensure state updates have completed
        //setShowOstrich(true);
    };

    useEffect(() => {
        setShowOstrich(isLoggedIn);
    }, [isLoggedIn]);

    const copyToClipboard = (text: string, keyType: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${keyType} key copied to clipboard!`);
    };

    const handleScreenClick = () => {
        if (showOstrich) {
            setShowOstrich(false);
        }
    };

    return (
        <div className="py-64 relative" style={{ pointerEvents: 'auto' }} onClick={handleScreenClick}>
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
            <AnimatePresence>
                {showOstrich && (
                    <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
                    onClick={() => setShowOstrich(false)}
                    >
                        <div className="relative">
                            <img src="/ostrich.png" alt="Ostrich" className="ostrich max-w-full max-h-full" />
                            <div className="absolute top-0 left-full ml-4 p-32 bg-white rounded-lg shadow-lg speech-bubble" style={{ width: '400px' }}>
                                <p className="text-black">
                                    You are now on the Nostr network! Now, go{' '}
                                    <Link to="/people-to-follow" className="text-blue-500 hover:underline">
                                        find some people to follow!
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <style>{`
                .speech-bubble::before {
                    content: '';
                    position: absolute;
                    left: -20px;
                    top: 50%;
                    transform: translateY(-50%);
                    border-width: 10px;
                    border-style: solid;
                    border-color: transparent white transparent transparent;
                }
                .ostrich {
                    max-width: 100%;
                    max-height: 100%;
                }
                @media (max-width: 768px) {
                    .ostrich {
                        display: none;
                    }
                    .speech-bubble {
                        position: static;
                        width: 90% !important;
                        margin: 0 auto;
                    }
                    .speech-bubble::before {
                        display: none;
                    }
                }
            `}</style>
            {!nsec && !npub && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
                    <Loading vCentered={false} />
                </div>
            )}
        </div>
    );
}

export default GenerateKey;