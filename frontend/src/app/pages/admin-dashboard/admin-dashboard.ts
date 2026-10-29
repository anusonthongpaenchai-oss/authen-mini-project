import { Component } from '@angular/core';
import { DashboardBase } from '../../shared/dashboard/dashboard-base';
import { SessionTimer } from '../../shared/session-timer/session-timer';

@Component({
  selector: 'app-admin-dashboard',
  imports: [SessionTimer],
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboard extends DashboardBase {
  readonly role = 'admin' as const;
}
