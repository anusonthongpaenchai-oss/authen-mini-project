import { Routes } from '@angular/router';
import { HealthCheck } from './pages/health-check/health-check';
export const routes: Routes = [
  { path: '', redirectTo: 'health-check', pathMatch: 'full' },
  { path: 'health-check', component: HealthCheck },
];
