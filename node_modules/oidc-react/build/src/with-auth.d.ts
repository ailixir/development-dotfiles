import { AuthContextProps } from './auth-context-interface';
import React from 'react';
/**
 * A public higher-order component to access the imperative API
 */
export declare function withAuth<P extends AuthContextProps>(Component: React.ComponentType<P>): React.ComponentType<Omit<P, keyof AuthContextProps>>;
