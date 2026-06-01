import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

interface Props { children: ReactNode; }

export default function AuthGuard({ children }: Props) {
  const { loggedIn, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>;
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
