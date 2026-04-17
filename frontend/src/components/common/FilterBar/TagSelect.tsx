import React from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  LocalOffer,
  Close,
} from '@mui/icons-material';

interface TagSelectProps {
  tags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

const TagSelect: React.FC<TagSelectProps> = ({
  tags,
  selectedTags,
  onTagsChange,
  loading = false,
  disabled = false,
  placeholder = 'Add tags...',
  label = 'Filter by Tags',
}) => {
  const theme = useTheme();

  const handleTagChange = (_event: any, newTags: string[]) => {
    onTagsChange(newTags);
  };

  return (
    <Autocomplete
      multiple
      options={Array.isArray(tags) ? tags : []}
      value={Array.isArray(selectedTags) ? selectedTags : []}
      onChange={handleTagChange}
      loading={loading}
      disabled={disabled}
      disableCloseOnSelect
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={disabled ? "Select CSI first..." : placeholder}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <LocalOffer sx={{ color: 'text.secondary', mr: 1, fontSize: '1.1rem' }} />
                {params.InputProps.startAdornment}
              </>
            ),
          }}
        />
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option}
            label={option}
            size="small"
            deleteIcon={<Close />}
            sx={{
              backgroundColor: alpha(theme.palette.secondary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
              color: theme.palette.secondary.dark,
              fontWeight: 500,
              '& .MuiChip-deleteIcon': {
                color: theme.palette.secondary.main,
                '&:hover': {
                  color: theme.palette.secondary.dark,
                }
              }
            }}
          />
        ))
      }
      renderOption={(props, option, { selected }) => (
        <li {...props} key={option}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              width: '100%',
              py: 0.5,
              px: 0.5,
              borderRadius: 1,
              backgroundColor: selected 
                ? alpha(theme.palette.secondary.main, 0.08)
                : 'transparent',
              '&:hover': {
                backgroundColor: alpha(theme.palette.secondary.main, 0.12),
              }
            }}
          >
            <LocalOffer 
              sx={{ 
                color: selected ? theme.palette.secondary.main : 'text.secondary',
                fontSize: '1rem'
              }} 
            />
            <Typography
              variant="body2"
              sx={{
                color: selected ? theme.palette.secondary.main : 'text.primary',
                fontWeight: selected ? 500 : 400,
              }}
            >
              {option}
            </Typography>
          </Box>
        </li>
      )}
      noOptionsText={disabled ? "Select a CSI first to see available tags" : "No tags found"}
      filterSelectedOptions
      getOptionLabel={(option) => option}
      isOptionEqualToValue={(option, value) => option === value}
      ChipProps={{
        size: "small"
      }}
    />
  );
};

export default TagSelect;