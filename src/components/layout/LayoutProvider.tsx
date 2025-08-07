import React from 'react';
import ChecksLayout from './ChecksLayout';

interface LayoutProviderProps {
  children: React.ReactNode;
}

const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  // Always use the sidebar layout since platform shell components are handled by the host
  // This provides consistent local navigation within the module
  return <ChecksLayout>{children}</ChecksLayout>;
};

export default LayoutProvider;
