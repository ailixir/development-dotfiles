import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DeploymentMode } from '../../types/common/commonTypes';

interface UIState {
  deploymentMode: DeploymentMode;
  sidebarCollapsed: boolean;
  currentModule: string;
  currentPage: string;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
  }>;
  loading: {
    global: boolean;
    [key: string]: boolean;
  };
  modals: {
    [key: string]: boolean;
  };
  theme: {
    mode: 'light' | 'dark';
    primaryColor: string;
  };
}

const initialState: UIState = {
  deploymentMode: 'standalone',
  sidebarCollapsed: false,
  currentModule: 'checks',
  currentPage: 'dashboard',
  notifications: [],
  loading: {
    global: false,
  },
  modals: {},
  theme: {
    mode: 'light',
    primaryColor: '#0056C7', // Citibank blue
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setDeploymentMode: (state, action: PayloadAction<DeploymentMode>) => {
      state.deploymentMode = action.payload;
    },
    
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    
    setCurrentPage: (state, action: PayloadAction<string>) => {
      state.currentPage = action.payload;
    },
    
    addNotification: (state, action: PayloadAction<Omit<UIState['notifications'][0], 'id' | 'timestamp' | 'read'>>) => {
      const notification = {
        ...action.payload,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      state.notifications.unshift(notification);
      
      // Keep only the last 50 notifications
      if (state.notifications.length > 50) {
        state.notifications = state.notifications.slice(0, 50);
      }
    },
    
    markNotificationAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification) {
        notification.read = true;
      }
    },
    
    markAllNotificationsAsRead: (state) => {
      state.notifications.forEach(n => n.read = true);
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    
    clearNotifications: (state) => {
      state.notifications = [];
    },
    
    setLoading: (state, action: PayloadAction<{ key: string; loading: boolean }>) => {
      state.loading[action.payload.key] = action.payload.loading;
    },
    
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.global = action.payload;
    },
    
    setModalOpen: (state, action: PayloadAction<{ key: string; open: boolean }>) => {
      state.modals[action.payload.key] = action.payload.open;
    },
    
    closeAllModals: (state) => {
      state.modals = {};
    },
    
    setThemeMode: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme.mode = action.payload;
    },
    
    setPrimaryColor: (state, action: PayloadAction<string>) => {
      state.theme.primaryColor = action.payload;
    },
  },
});

export const {
  setDeploymentMode,
  setSidebarCollapsed,
  toggleSidebar,
  setCurrentPage,
  addNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearNotifications,
  setLoading,
  setGlobalLoading,
  setModalOpen,
  closeAllModals,
  setThemeMode,
  setPrimaryColor,
} = uiSlice.actions;

export default uiSlice.reducer;