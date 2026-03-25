import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GithubRepo } from '../../core/models/github-repo.model';

@Component({
  selector: 'app-repo-list',
  templateUrl: './repo-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoListComponent {
  readonly repos = input.required<GithubRepo[]>();

  private readonly languageColors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Java: '#b07219',
    'C#': '#178600',
    'C++': '#f34b7d',
    Go: '#00ADD8',
    Rust: '#dea584',
    PHP: '#4F5D95',
    Ruby: '#701516',
    Swift: '#fa7343',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Vue: '#41b883',
  };

  getLanguageColor(language: string | null): string {
    if (!language) return '#6b7280';
    return this.languageColors[language] ?? '#6b7280';
  }

  formatCount(n: number): string {
    return n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);
  }

  formatDate(dateStr: string): string {
    const diffDays = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 86_400_000
    );
    if (diffDays === 0) return 'Bugün';
    if (diffDays < 30) return `${diffDays} gün önce`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} ay önce`;
    return `${Math.floor(diffDays / 365)} yıl önce`;
  }
}
