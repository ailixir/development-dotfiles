// Module Federation entry point for remote dev server standalone preview
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ChecksModule from './Module';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter basename="/">
        <ChecksModule />
      </BrowserRouter>
    </React.StrictMode>
  );
}