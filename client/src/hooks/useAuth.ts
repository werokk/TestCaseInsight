import { useQuery } from '@tanstack/react-query';

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  avatar?: string;
}

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isAuthenticated = !!user;

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    refetch
  };
}