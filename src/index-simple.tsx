import React from 'react';
import { createRoot } from 'react-dom/client';

const SimpleApp: React.FC = () => {
  return (
    <div>
      <h1>PUT Checks Module - Test</h1>
      <p>If you can see this, React is working!</p>
    </div>
  );
};

const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');

const root = createRoot(container);
root.render(<SimpleApp />);

