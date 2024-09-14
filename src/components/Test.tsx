import React from 'react';
import { Helmet } from 'react-helmet';

const Test: React.FC = () => {
  const title = "Test Component";
  const description = "This is a test component demonstrating the use of Helmet for SEO and preview cards.";
  const url = "https://ghostcopywrite.com/test";
  const imageUrl = "https://ghostcopywrite.com/test-image.png";

  return (
    <div>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={imageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
      </Helmet>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
};

export default Test;
