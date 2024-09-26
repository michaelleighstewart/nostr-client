import React, { useState, useEffect } from 'react';
import { SimplePool, getPublicKey } from 'nostr-tools';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { API_URLS } from '../utils/apiConstants';
import { showCustomToast } from "./CustomToast";
import { createAuthHeader } from '../utils/authUtils';
import { getUserPublicKey } from '../utils/profileUtils';

interface BYOAlgorithmProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface AlgorithmSettings {
  algoId: string;
  name: string;
  byoDegrees: number;
  byoPosts: boolean;
  byoReposts: boolean;
  byoReplies: boolean;
  basedOn: string;
}

const BYOAlgorithm: React.FC<BYOAlgorithmProps> = ({ keyValue, nostrExists }) => {
  const [loading, setLoading] = useState(true);
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null);
  const [algorithms, setAlgorithms] = useState<AlgorithmSettings[]>([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserPublicKey = async () => {
      const pubkey = await getUserPublicKey(nostrExists ?? false, keyValue);
      setUserPublicKey(pubkey)
      setLoading(false);
    };

    fetchUserPublicKey();
  }, [nostrExists, keyValue]);

  useEffect(() => {
    const fetchAlgorithms = async () => {
      if (!userPublicKey) return;

      try {
        const authHeader = await createAuthHeader('GET', '/byo-algo', nostrExists ?? false, keyValue);
        const response = await fetch(`${API_URLS.API_URL}by-algo?userId=${userPublicKey}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authHeader,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.algos) && data.algos.length > 0) {
            setAlgorithms([...data.algos]);
            setSelectedAlgorithm(data.algos[0].id);
          } else {
            setDefaultAlgorithm();
          }
        } else if (response.status === 404) {
          setDefaultAlgorithm();
        } else {
          throw new Error('Failed to fetch algorithms');
        }
      } catch (error) {
        console.error('Error fetching algorithms:', error);
        showCustomToast('Failed to fetch algorithms. Using default values.', 'error');
        setDefaultAlgorithm();
      }
    };

    const getDefaultAlgorithm = () => ({
      algoId: 'default',
      name: '',
      byoDegrees: 1,
      byoPosts: true,
      byoReposts: true,
      byoReplies: false,
      basedOn: 'Following',
    });

    const setDefaultAlgorithm = () => {
      setAlgorithms([getDefaultAlgorithm()]);
      setSelectedAlgorithm('default');
    };

    if (userPublicKey) {
      fetchAlgorithms();
    }
  }, [userPublicKey]);

  const handleSettingChange = (setting: keyof AlgorithmSettings, value: number | boolean | string) => {
    setAlgorithms(prevAlgorithms => 
      prevAlgorithms.map(algo => 
        algo.algoId === selectedAlgorithm ? { ...algo, [setting]: value } : algo
      )
    );
    if (setting === 'name') {
      setNameError(value ? null : 'Algorithm name is required');
    }
  };

  const handleSaveSettings = async () => {
    if (!userPublicKey || !selectedAlgorithm) return;

    const algorithmToSave = algorithms.find(algo => algo.algoId === selectedAlgorithm);
    if (!algorithmToSave) return;

    if (!algorithmToSave.name.trim()) {
      setNameError('Algorithm name is required');
      return;
    }

    try {
      const authHeader = await createAuthHeader('POST', '/byo-algo', nostrExists ?? false, keyValue);
      const response = await fetch(API_URLS.API_URL + 'byo-algo', {
        method: algorithmToSave.algoId === 'new' ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authHeader,
        },
        body: JSON.stringify({
          userId: userPublicKey,
          ...algorithmToSave,
          ...(algorithmToSave.algoId !== 'new' && { id: algorithmToSave.algoId }),
        }),
      });

      if (response.ok) {
        showCustomToast('Algorithm saved successfully!', 'success');
        if (algorithmToSave.algoId === 'default') {
          const newAlgorithm = await response.json();
          setAlgorithms(prevAlgorithms => [...prevAlgorithms.filter(algo => algo.algoId !== 'default'), newAlgorithm]);
          setSelectedAlgorithm(newAlgorithm.id);
        }
      } else {
        throw new Error('Failed to save algorithm');
      }
    } catch (error) {
      console.error('Error saving algorithm:', error);
      showCustomToast('Failed to save algorithm. Please try again.', 'error');
    }
  };

  const handleAddNew = () => {
    const newAlgorithm: AlgorithmSettings = {
      algoId: 'new',
      name: '',
      byoDegrees: 1,
      byoPosts: true,
      byoReposts: true,
      byoReplies: false,
      basedOn: 'Following',
    };
    setAlgorithms(prevAlgorithms => [...prevAlgorithms, newAlgorithm]);
    setSelectedAlgorithm('new');
  };

  if (loading || algorithms.length === 0) {
    return <Loading vCentered={false} />;
  }

  const currentAlgorithm = algorithms.find(algo => algo.algoId === selectedAlgorithm) || algorithms[0];

  return (
    <div className="py-16 px-4 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Build Your Own Algorithm</h1>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Select Algorithm</label>
        <select
          value={selectedAlgorithm || ''}
          onChange={(e) => setSelectedAlgorithm(e.target.value)}
          className="w-full p-2 border rounded text-black"
        >
          {algorithms.map(algo => (
            <option key={algo.algoId} value={algo.algoId}>{algo.name || 'New Algorithm'}</option>
          ))}
        </select>
        <button
          onClick={handleAddNew}
          className="w-full py-2 px-4 bg-[#535bf2]-600 text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
        >
          Create Algorithm
        </button>
      </div>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Algorithm Name*</label>
          <input
            type="text"
            value={currentAlgorithm.name}
            onChange={(e) => handleSettingChange('name', e.target.value)}
            className={`w-full p-2 border rounded text-black ${nameError ? 'border-red-500' : ''}`}
            placeholder="Enter algorithm name"
          />
          {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Based On</label>
          <select
            value={currentAlgorithm.basedOn}
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
            max="2"
            value={currentAlgorithm.byoDegrees}
            onChange={(e) => handleSettingChange('byoDegrees', parseInt(e.target.value))}
            className="w-full p-2 border rounded text-black"
          />
        </div>
        {['byoPosts', 'byoReposts', 'byoReplies'].map((setting) => (
          <div key={setting} className="flex items-center">
            <input
              type="checkbox"
              id={setting}
              checked={!!currentAlgorithm[setting as keyof AlgorithmSettings]}
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
          disabled={!currentAlgorithm.name.trim()}
        >
          {currentAlgorithm.algoId === 'new' ? 'Create Algorithm' : 'Update Algorithm'}
        </button>
      </div>
    </div>
  );
};

export default BYOAlgorithm;