import { createTheme, ThemeOptions } from '@mui/material/styles';
import { THEME_COLORS } from '@/utils/constants';

// Citibank theme configuration
const themeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: THEME_COLORS.primary,
      light: '#3377D9',
      dark: '#003C8A',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: THEME_COLORS.secondary,
      light: '#339AE5',
      dark: '#004F93',
      contrastText: '#FFFFFF',
    },
    success: {
      main: THEME_COLORS.success,
      light: '#6BC36F',
      dark: '#357A37',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: THEME_COLORS.warning,
      light: '#FFB74D',
      dark: '#F57C00',
      contrastText: '#000000',
    },
    error: {
      main: THEME_COLORS.error,
      light: '#F66D5B',
      dark: '#C5221C',
      contrastText: '#FFFFFF',
    },
    info: {
      main: THEME_COLORS.info,
      light: '#4FC3F7',
      dark: '#0277BD',
      contrastText: '#FFFFFF',
    },
    grey: THEME_COLORS.grey,
    background: {
      default: '#FAFAFA',
      paper: '#FFFFFF',
    },
    text: {
      primary: THEME_COLORS.grey[900],
      secondary: THEME_COLORS.grey[700],
      disabled: THEME_COLORS.grey[500],
    },
    divider: THEME_COLORS.grey[200],
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.25,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.35,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.45,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.66,
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
  },
  spacing: 8, // 8px base spacing
  shape: {
    borderRadius: 8,
  },
  components: {
    // Button overrides
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12)',
          },
        },
        contained: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    // Card overrides
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    // Paper overrides
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
        },
        elevation4: {
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
        },
      },
    },
    // Chip overrides
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontWeight: 500,
        },
      },
    },
    // TextField overrides
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
          },
        },
      },
    },
    // AppBar overrides
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: THEME_COLORS.grey[900],
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    // Toolbar overrides
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '64px !important',
          '@media (min-width: 600px)': {
            minHeight: '64px !important',
          },
        },
      },
    },
    // Tab overrides
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 48,
        },
      },
    },
    // Table overrides
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: THEME_COLORS.grey[50],
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          color: THEME_COLORS.grey[700],
        },
      },
    },
    // List overrides
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 86, 199, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(0, 86, 199, 0.12)',
            },
          },
        },
      },
    },
    // Switch overrides
    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: THEME_COLORS.primary,
            '& + .MuiSwitch-track': {
              backgroundColor: THEME_COLORS.primary,
              opacity: 0.5,
            },
          },
        },
      },
    },
    // Skeleton overrides
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  zIndex: {
    mobileStepper: 1000,
    fab: 1050,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },
};

// Create and export the theme
export const theme = createTheme(themeOptions);

// Type augmentation for custom theme properties
declare module '@mui/material/styles' {
  interface Theme {
    status: {
      danger: string;
    };
  }

  interface ThemeOptions {
    status?: {
      danger?: string;
    };
  }
}

export default theme;
