import { useState, useEffect } from 'react';
import { getAuthStatus } from '../api';

export interface AuthState {
  loggedIn: boolean;
  hasUser: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loggedIn: false, hasUser: false, loading: true });

  useEffect(() => {
    getAuthStatus()
      .then(data => setState({ ...data, loading: false }))
      .catch(() => setState({ loggedIn: false, hasUser: false, loading: false }));
  }, []);

  return state;
}
