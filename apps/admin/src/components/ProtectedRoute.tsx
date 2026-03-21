import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken } from '../api';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
