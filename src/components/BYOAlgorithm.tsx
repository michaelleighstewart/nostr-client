import React, { useState, useEffect } from 'react';
import { SimplePool, getPublicKey } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { API_URLS } from '../utils/apiConstants';
import { showCustomToast } from "./CustomToast";
import { createAuthHeader } from '../utils/authUtils';

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
  basedOn: string;
}

const BYOAlgorithm: React.FC<BYOAlgorithmProps> = ({ keyValue, nostrExists }) => {
  const [loading, setLoading] = useState(true);
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<AlgorithmSettings | null>(null);
  const [isNewAlgorithm, setIsNewAlgorithm] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<AlgorithmSettings | null>(null);

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

  useEffect(() => {
    const fetchCurrentSettings = async () => {
      if (!userPublicKey) return;

      try {
        const authHeader = await createAuthHeader('GET', '/byo-algo', nostrExists ?? false, keyValue);
        const response = await fetch(`${API_URLS.BYO_ALGORITHM}?userId=${userPublicKey}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authHeader,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data && Object.keys(data).length > 0) {
            setSettings(data.data);
            setOriginalSettings(data.data);
            setIsNewAlgorithm(false);
          } else {
            setDefaultSettings();
          }
        } else if (response.status === 404) {
          setDefaultSettings();
        } else {
          throw new Error('Failed to fetch current settings');
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        showCustomToast('Failed to fetch current settings. Using default values.', 'error');
        setDefaultSettings();
      }
    };

    const setDefaultSettings = () => {
      const defaultSettings = {
        byoDegrees: 3,
        byoPosts: true,
        byoReposts: true,
        byoReplies: false,
        byoReactions: true,
        basedOn: 'Following',
      };
      setSettings(defaultSettings);
      setOriginalSettings(defaultSettings);
      setIsNewAlgorithm(true);
    };

    if (userPublicKey) {
      fetchCurrentSettings();
    }
  }, [userPublicKey]);

  const handleSettingChange = (setting: keyof AlgorithmSettings, value: number | boolean | string) => {
    setSettings(prev => prev ? ({ ...prev, [setting]: value }) : null);
  };

  const handleSaveSettings = async () => {
    if (!userPublicKey || !settings || !originalSettings) return;

    try {
      const authHeader = await createAuthHeader('POST', '/byo-algo', nostrExists ?? false, keyValue);
      const changedSettings = Object.entries(settings).reduce<Partial<AlgorithmSettings>>((acc, [key, value]) => {
        if (value !== originalSettings[key as keyof AlgorithmSettings]) {
          acc[key as keyof AlgorithmSettings] = value;
        }
        return acc;
      }, {});

      const response = await fetch(API_URLS.BYO_ALGORITHM, {
        method: isNewAlgorithm ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authHeader,
        },
        body: JSON.stringify({
          userId: userPublicKey,
          name: userPublicKey + "_BYOA_v1",
          ...(isNewAlgorithm ? settings : changedSettings),
        }),
      });

      if (response.ok) {
        showCustomToast('Settings saved successfully!', 'success');
        setIsNewAlgorithm(false);
        setOriginalSettings(settings);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showCustomToast('Failed to save settings. Please try again.', 'error');
    }
  };

  if (loading || settings === null) {
    return <Loading vCentered={false} />;
  }

  return (
    <div className="py-16 px-4 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Build Your Own Algorithm</h1>
      {isNewAlgorithm ? (
        <p className="mb-4 text-yellow-500">Creating a new algorithm. Adjust the settings below and save to create your personalized algorithm.</p>
      ) : (
        <p className="mb-4 text-green-500">Existing algorithm loaded. You can modify the settings below.</p>
      )}
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Based On</label>
          <select
            value={settings.basedOn}
            onChange={(e) => handleSettingChange('basedOn', e.target.value)}
            className="w-full p-2 border rounded text-black"
          >
            <option value="Following">Following</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Degrees of Separation</label>
          <input
            type="number"
            min="1"
            max="3"
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
          {isNewAlgorithm ? 'Create Algorithm' : 'Update Algorithm'}
        </button>
      </div>
    </div>
  );
};

export default BYOAlgorithm;