import React, { useState, useEffect } from 'react';
import { SimplePool } from 'nostr-tools';
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
  const [isCreatingNew, setIsCreatingNew] = useState(false);

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
        const response = await fetch(`${API_URLS.API_URL}byo-algo?userId=${userPublicKey}`, {
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
          }
        } else if (response.status !== 404) {
          throw new Error('Failed to fetch algorithms');
        }
      } catch (error) {
        console.error('Error fetching algorithms:', error);
        showCustomToast('Failed to fetch algorithms.', 'error');
      }
    };

    if (userPublicKey) {
      fetchAlgorithms();
    }
  }, [userPublicKey]);

  const handleSettingChange = (setting: keyof AlgorithmSettings, value: number | boolean | string) => {
    if (isCreatingNew) {
      setAlgorithms(prevAlgorithms => [
        ...prevAlgorithms.slice(0, -1),
        { ...prevAlgorithms[prevAlgorithms.length - 1], [setting]: value }
      ]);
    } else {
      setAlgorithms(prevAlgorithms => 
        prevAlgorithms.map(algo => 
          algo.algoId === selectedAlgorithm ? { ...algo, [setting]: value } : algo
        )
      );
    }
    if (setting === 'name') {
      setNameError(value ? null : 'Algorithm name is required');
    }
  };

  const handleSaveSettings = async () => {
    if (!userPublicKey) return;
  
    const algorithmToSave = isCreatingNew ? algorithms[algorithms.length - 1] : algorithms.find(algo => algo.algoId === selectedAlgorithm);
    if (!algorithmToSave) return;
  
    if (!algorithmToSave.name.trim()) {
      setNameError('Algorithm name is required');
      return;
    }
  
    try {
      const authHeader = await createAuthHeader(isCreatingNew ? 'POST' : 'PATCH', '/byo-algo', nostrExists ?? false, keyValue);
      const response = await fetch(API_URLS.API_URL + 'byo-algo', {
        method: isCreatingNew ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authHeader,
        },
        body: JSON.stringify({
          userId: userPublicKey,
          ...algorithmToSave,
          ...(isCreatingNew ? {} : { id: algorithmToSave.algoId }),
        }),
      });
  
      if (response.ok) {
        const savedAlgorithm = await response.json();
        showCustomToast('Algorithm saved successfully!', 'success');
        if (isCreatingNew) {
          setAlgorithms(prevAlgorithms => [savedAlgorithm.data.algorithm, ...prevAlgorithms.filter(algo => algo.algoId !== 'new')]);
        } else {
          setAlgorithms(prevAlgorithms => prevAlgorithms.map(algo => 
            algo.algoId === selectedAlgorithm ? savedAlgorithm.data.algorithm : algo
          ));
        }
        setIsCreatingNew(false);
      } else {
        throw new Error('Failed to save algorithm');
      }
    } catch (error) {
      console.error('Error saving algorithm:', error);
      showCustomToast('Failed to save algorithm. Please try again.', 'error');
    }
  };

  const handleCancel = () => {
    setIsCreatingNew(false);
    setAlgorithms(prevAlgorithms => prevAlgorithms.filter(algo => algo.algoId !== 'new'));
    setSelectedAlgorithm(algorithms[0]?.algoId || null);
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
    setSelectedAlgorithm(null);
    setIsCreatingNew(true);
    setAlgorithms(prevAlgorithms => [...prevAlgorithms, newAlgorithm]);
  };

  if (loading) {
    return <Loading vCentered={false} />;
  }

  const currentAlgorithm = isCreatingNew 
  ? algorithms[algorithms.length - 1] 
  : (selectedAlgorithm 
    ? algorithms.find(algo => algo.algoId === selectedAlgorithm) 
    : algorithms[0]) || { name: '', byoDegrees: 1, byoPosts: true, byoReposts: true, byoReplies: false, basedOn: 'Following' };

  return (
    <div className="py-16 px-4 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Build Your Own Algorithm</h1>
      {algorithms.length > 0 && !isCreatingNew && (
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Select Algorithm</label>
        <select
          value={selectedAlgorithm || ''}
          onChange={(e) => setSelectedAlgorithm(e.target.value)}
          className="w-full p-2 border rounded text-black"
        >
          {algorithms.filter(algo => algo.algoId !== 'new').map(algo => (
            <option key={algo.algoId} value={algo.algoId}>{algo.name || 'Unnamed Algorithm'}</option>
          ))}
        </select>
      </div>
    )}
      {!isCreatingNew && (
        <button
          onClick={handleAddNew}
          className="w-full py-2 px-4 bg-[#535bf2]-600 text-white rounded hover:bg-[#535bf2]-700 transition duration-200 mb-4"
        >
          Create New Algorithm
        </button>
      )}
      {(algorithms.length > 0 || isCreatingNew) && (
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
                checked={!!(currentAlgorithm as AlgorithmSettings)[setting as keyof AlgorithmSettings]}
                onChange={(e) => handleSettingChange(setting as keyof AlgorithmSettings, e.target.checked)}
                className="mr-2"
              />
              <label htmlFor={setting} className="text-sm font-medium">
                Include {setting.slice(3)}
              </label>
            </div>
          ))}
          <div className="flex space-x-4">
            <button
              onClick={handleSaveSettings}
              className="flex-1 py-2 px-4 bg-[#535bf2]-600 text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
              disabled={!currentAlgorithm.name?.trim()}
            >
              {isCreatingNew ? 'Create Algorithm' : 'Update Algorithm'}
            </button>
            {isCreatingNew && (
              <button
                onClick={handleCancel}
                className="flex-1 py-2 px-4 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition duration-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BYOAlgorithm;