import React from 'react';
import { Helmet } from 'react-helmet';

const DefaultHelmet: React.FC = () => {
  return (
    <Helmet>
      <title>Ghostcopywrite | Nostr Client | Let Freedom Ring</title>
      <meta property="og:title" content="Ghostcopywrite | Nostr Client" />
      <meta property="og:description" content="Let Freedom Ring" />
      <meta property="og:image" content="https://ghostcopywrite.com/ostrich.png" />
      <meta property="og:url" content="https://ghostcopywrite.com" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
  );
};

export default DefaultHelmet;