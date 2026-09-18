import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { Movie } from '@mui/icons-material';

interface StudioProofVideoProps {
  videoUrl?: string | null;
  title: string;
  posterUrl?: string;
  height?: number;
  emptyMessage?: string;
  errorMessage?: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onTimeUpdate?: (currentTime: number) => void;
}

const StudioProofVideo: React.FC<StudioProofVideoProps> = ({
  videoUrl,
  title,
  posterUrl,
  height = 320,
  emptyMessage = 'Visual proof will appear after a completed run.',
  errorMessage = 'The proof video could not be loaded. Run the test again or refresh this page.',
  videoRef,
  onTimeUpdate,
}) => {
  const [loading, setLoading] = useState(Boolean(videoUrl));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(Boolean(videoUrl));
    setFailed(false);
  }, [videoUrl]);

  if (!videoUrl) {
    return (
      <Box sx={{ minHeight: height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, bgcolor: 'grey.900', color: 'grey.300', borderRadius: 1 }}>
        <Movie color="disabled" />
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  if (failed) {
    return <Alert severity="warning">{errorMessage}</Alert>;
  }

  return (
    <Box sx={{ height, position: 'relative', bgcolor: 'grey.900', borderRadius: 1, overflow: 'hidden' }}>
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'grey.200' }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading proof…</Typography>
        </Box>
      )}
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        aria-label={`${title} proof video`}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: failed ? 'none' : 'block' }}
      />
    </Box>
  );
};

export default StudioProofVideo;
