import { Routes } from '@angular/router';
import { HealthCheck } from './pages/health-check/health-check';
import { Login } from './pages/login/login';
import { UserDashboard } from './pages/user-dashboard/user-dashboard';
import { guestGuard, userGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'dashboard', component: UserDashboard, canActivate: [userGuard] },
  { path: 'health-check', component: HealthCheck },
  { path: '**', redirectTo: 'dashboard' },
];
