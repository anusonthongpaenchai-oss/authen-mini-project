import { InjectionToken } from '@angular/core';

export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => 'http://localhost:3000/api',
});
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user';
}
export interface AuthResponse {
  accessToken: string;
  expiresAt: number;
  rememberMe: boolean;
  user: User;
}
