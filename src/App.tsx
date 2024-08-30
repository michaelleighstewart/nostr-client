import './App.css';
import Layout from "./components/Layout";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import EditProfile from "./components/EditProfile";
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
  }, []);

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
  }, [nostrExists]);

  return (
    <div className="h-full">
      <Router>
        <NavBar keyValue={key} setKey={setKey}></NavBar>
        <Routes>
          <Route path="/" element={<Layout />}></Route>
          <Route index element={<Home keyValue={key} pool={pool} nostrExists={nostrExists} />}></Route>
          <Route path="edit-profile" element={<EditProfile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
        </Routes>
      </Router>
      <ToastContainer />
    </div>
  )
}

export default App;