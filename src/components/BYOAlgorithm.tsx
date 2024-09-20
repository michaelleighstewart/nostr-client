import React, { useState, useEffect } from 'react';
import { SimplePool, getPublicKey } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';

interface BYOAlgorithmProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface AlgorithmSettings {
  byoDegrees: number;
  byoPosts: boolean;
  byoReposts: boolean;
  byoReplies: boolean;
  byoReactions: boolean;
}

const BYOAlgorithm: React.FC<BYOAlgorithmProps> = ({ keyValue, pool, nostrExists }) => {
  const [loading, setLoading] = useState(true);
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<AlgorithmSettings>({
    byoDegrees: 3,
    byoPosts: true,
    byoReposts: true,
    byoReplies: false,
    byoReactions: true,
  });

  useEffect(() => {
    const fetchUserPublicKey = async () => {
      if (nostrExists) {
        const pubkey = await (window as any).nostr.getPublicKey();
        setUserPublicKey(pubkey);
      } else if (keyValue) {
        const skDecoded = bech32Decoder('nsec', keyValue);
        const pubkey = getPublicKey(skDecoded);
        setUserPublicKey(pubkey);
      }
      setLoading(false);
    };

    fetchUserPublicKey();
  }, [nostrExists, keyValue]);

  const handleSettingChange = (setting: keyof AlgorithmSettings, value: number | boolean) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
  };

  const handleSaveSettings = async () => {
    if (!userPublicKey) return;

    try {
      const response = await fetch('YOUR_API_ENDPOINT/byo-algorithm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userPublicKey,
          ...settings,
        }),
      });

      if (response.ok) {
        alert('Settings saved successfully!');
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  };

  if (loading) {
    return <Loading vCentered={false} />;
  }

  return (
    <div className="py-16 px-4 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Build Your Own Algorithm (WIP)</h1>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Degrees of Separation</label>
          <input
            type="number"
            min="1"
            max="6"
            value={settings.byoDegrees}
            onChange={(e) => handleSettingChange('byoDegrees', parseInt(e.target.value))}
            className="w-full p-2 border rounded text-black"
          />
        </div>
        {['byoPosts', 'byoReposts', 'byoReplies', 'byoReactions'].map((setting) => (
          <div key={setting} className="flex items-center">
            <input
              type="checkbox"
              id={setting}
              checked={!!settings[setting as keyof AlgorithmSettings]}
              onChange={(e) => handleSettingChange(setting as keyof AlgorithmSettings, e.target.checked)}
              className="mr-2"
            />
            <label htmlFor={setting} className="text-sm font-medium">
              Include {setting.slice(3)}
            </label>
          </div>
        ))}
        <button
          onClick={handleSaveSettings}
          className="w-full py-2 px-4 bg-[#535bf2]-600 text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default BYOAlgorithm;