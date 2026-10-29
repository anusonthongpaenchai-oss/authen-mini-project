import { InjectionToken } from '@angular/core';

export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => 'http://localhost:3000/api',
});
export type Role = 'user' | 'admin';
export const isRole = (value: unknown): value is Role => value === 'user' || value === 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}
export interface AuthResponse {
  accessToken: string;
  expiresAt: number;
  rememberMe: boolean;
  user: User;
}
