export interface PlatformNavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
  children?: PlatformNavigationItem[];
}

export interface PlatformModuleNavigation {
  moduleId: string;
  moduleLabel: string;
  moduleIcon: string;
  version: string;
  navigation: PlatformNavigationItem[];
}

type Listener = () => void;

class NavigationRegistry {
  private readonly modules = new Map<string, PlatformModuleNavigation>();
  private readonly listeners = new Set<Listener>();

  register(module: PlatformModuleNavigation) {
    this.modules.set(module.moduleId, module);
    this.listeners.forEach((listener) => listener());
  }

  get(moduleId: string) {
    return this.modules.get(moduleId);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const navigationRegistry = new NavigationRegistry();
