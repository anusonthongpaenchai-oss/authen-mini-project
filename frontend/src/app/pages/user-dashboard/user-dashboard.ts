import { Component } from '@angular/core';
import { DashboardBase } from '../../shared/dashboard/dashboard-base';
import { SessionTimer } from '../../shared/session-timer/session-timer';

@Component({
  selector: 'app-user-dashboard',
  imports: [SessionTimer],
  templateUrl: './user-dashboard.html',
})
export class UserDashboard extends DashboardBase {
  readonly role = 'user' as const;
}
