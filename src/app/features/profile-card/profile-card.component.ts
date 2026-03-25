import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GithubUser } from '../../core/models/github-user.model';

@Component({
  selector: 'app-profile-card',
  templateUrl: './profile-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileCardComponent {
  readonly user = input.required<GithubUser>();

  formatStat(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}
