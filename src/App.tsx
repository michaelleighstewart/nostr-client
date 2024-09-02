import './App.css';
import Layout from "./components/Layout";
import { BrowserRouter as Router, Routes, Route, useParams } from "react-router-dom";
import Home from "./components/Home";
import EditProfile from "./components/EditProfile";
import Profile from "./components/Profile";
import GenerateKey from "./components/GenerateKey";
import PeopleToFollow from "./components/PeopleToFollow";
import Followers from "./components/Followers";
import Following from "./components/Following";
import Post from "./components/Post";
import NavBar from "./components/NavBar";
import { SimplePool } from "nostr-tools";
import { useState, useEffect } from "react";
import { RELAYS } from "./utils/constants";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [key, setKey] = useState('');
  const [nostrExists, setNostrExists] = useState(false);

  async function getPublicKey() {
    try {
      const pk = await (window as any).nostr.getPublicKey();
      return pk;
    } catch (error) {
      return "";
    }
  }

  function handleSetKey(value: string) {
    setKey(value);
  }

  useEffect(() => {
    const checkNostrAvailability = () => {
      if ((window as any).nostr) {
        setNostrExists(true);
        clearInterval(nostrCheckInterval);
      }
    };

    const nostrCheckInterval = setInterval(checkNostrAvailability, 100);

    return () => {
      clearInterval(nostrCheckInterval);
    };
  }, [key]);

  useEffect(() => {
    const initialize = async () => {
      if (nostrExists) {
        const pk = await getPublicKey();
        setKey(pk);
      }
    };

    const _pool = new SimplePool();
    setPool(_pool);
    initialize();

    return () => {
      _pool.close(RELAYS);
    };
  }, [nostrExists, key]);

  return (
    <div className="h-full">
      <Router>
        <NavBar keyValue={key} setKey={setKey}></NavBar>
        <Routes>
          <Route path="/" element={<Layout />}></Route>
          <Route index element={<Home keyValue={key} pool={pool} nostrExists={nostrExists} />}></Route>
          <Route path="edit-profile" element={<EditProfile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
          <Route path="profile" element={<Profile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
          <Route path="generate-key" element={<GenerateKey setKeyValue={handleSetKey} />} />
          <Route path="people-to-follow" element={<PeopleToFollow keyValue={key} pool={pool} nostrExists={nostrExists} />} />
          <Route path="followers/:pubkey" element={<Followers keyValue={key} pool={pool} nostrExists={nostrExists} />} />
          <Route path="following/:pubkey" element={<Following pool={pool} />} />
          <Route path="post/:id" element={<Post pool={pool} id={useParams().id ?? ""} />} />
        </Routes>
      </Router>
      <ToastContainer />
    </div>
  )
}

export default App;