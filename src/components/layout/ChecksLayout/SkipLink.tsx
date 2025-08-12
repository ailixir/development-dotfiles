import React from 'react';

const styles: React.CSSProperties = {
  position: 'absolute',
  top: -40,
  left: 16,
  background: '#fff',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #E5E7EB',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  color: '#111827',
  textDecoration: 'none',
};

interface SkipLinkProps {
  targetId: string;
}

const SkipLink: React.FC<SkipLinkProps> = ({ targetId }) => {
  return (
    <a
      href={`#${targetId}`}
      style={styles}
      onFocus={(e) => {
        // Reveal when focused
        (e.currentTarget.style as any).top = '8px';
      }}
      onBlur={(e) => {
        (e.currentTarget.style as any).top = '-40px';
      }}
    >
      Skip to main content
    </a>
  );
};

export default SkipLink;


