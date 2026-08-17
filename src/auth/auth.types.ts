export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}
