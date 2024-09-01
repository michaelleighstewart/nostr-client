import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import { useLocation } from "react-router-dom";
import { bech32Decoder } from "../utils/helperFunctions";
import { getPublicKey } from "nostr-tools";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";

interface ProfileProps {
    npub?: string;
    keyValue: string;
    pool: SimplePool | null;
    nostrExists: boolean;
}

interface ProfileData {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
}

const Profile: React.FC<ProfileProps> = ({ npub, keyValue, pool, nostrExists }) => {
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const location = useLocation();

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const npubFromUrl = queryParams.get("npub");
        const targetNpub = npubFromUrl || npub;

        const fetchProfileData = async () => {
            setLoading(true);
            if (!pool) return;

            let pubkey: string;
            if (targetNpub) {
                pubkey = Buffer.from(bech32Decoder("npub", targetNpub)).toString('hex');
            } else if (nostrExists) {
                pubkey = await (window as any).nostr.getPublicKey();
            } else {
                const skDecoded = bech32Decoder("nsec", keyValue);
                pubkey = getPublicKey(skDecoded);
            }

            pool.subscribeMany(
                RELAYS,
                [{ kinds: [0], authors: [pubkey] }],
                {
                    onevent(event) {
                        const metadata = JSON.parse(event.content) as ProfileData;
                        setProfileData(metadata);
                        setLoading(false);
                    },
                    oneose() {
                        setLoading(false);
                    }
                }
            );
        };

        fetchProfileData();
    }, [npub, keyValue, pool, nostrExists, location]);

    if (loading) {
        return <Loading vCentered={false} />;
    }

    return (
        <div className="py-64">
            <h1>Profile</h1>
            {profileData ? (
                <div>
                    <p>Name: {profileData.name}</p>
                    <p>About: {profileData.about}</p>
                    {profileData.picture && <img src={profileData.picture} alt="Profile" className="w-24 h-24 rounded-full" />}
                    <p>NIP-05: {profileData.nip05}</p>
                </div>
            ) : (
                <p>No profile data available.</p>
            )}
        </div>
    );
};

export default Profile;