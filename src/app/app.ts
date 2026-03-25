import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, merge, of, Subject } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';
import { GithubSearchUser } from './core/models/github-search-user.model';
import { GithubService, UserFullProfile } from './core/services/github.service';
import { ProfileCardComponent } from './features/profile-card/profile-card.component';
import { RepoListComponent } from './features/repo-list/repo-list.component';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, ProfileCardComponent, RepoListComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class App {
  private readonly el = inject(ElementRef);
  private readonly githubService = inject(GithubService);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly profile = signal<UserFullProfile | null>(null);
  readonly showDropdown = signal(false);
  readonly selectedIndex = signal(-1);

  private readonly manualTrigger$ = new Subject<string>();

  /**
   * Fires when the user has typed >2 chars (debounced, deduplicated).
   * switchMap cancels the previous in-flight request on every new keystroke,
   * preventing stale responses from appearing in the dropdown.
   */
  private readonly autoComplete$ = this.searchControl.valueChanges.pipe(
    filter((v) => v.length > 2),
    debounceTime(400),
    map((v) => this.sanitizeInput(v)),
    distinctUntilChanged(),
    switchMap((q) =>
      this.githubService.searchUsers(q).pipe(
        catchError(() => of([] as GithubSearchUser[])),
        tap((results) => {
          this.showDropdown.set(results.length > 0);
          this.selectedIndex.set(-1);
        })
      )
    )
  );

  /** Clears suggestions immediately when the input drops to ≤2 characters. */
  private readonly clearOnShort$ = this.searchControl.valueChanges.pipe(
    filter((v) => v.length <= 2),
    tap(() => {
      this.showDropdown.set(false);
      this.selectedIndex.set(-1);
    }),
    map(() => [] as GithubSearchUser[])
  );

  /**
   * toSignal bridges the merged RxJS autocomplete stream to an Angular Signal.
   * The template reads this signal directly — no subscribe, no async pipe, no manual cleanup.
   */
  readonly suggestions = toSignal(
    merge(this.autoComplete$, this.clearOnShort$),
    { initialValue: [] as GithubSearchUser[] }
  );

  constructor() {
    /**
     * Main profile-fetch pipeline.
     * Merges debounced auto-search with the instant manual trigger (button / Enter).
     */
    merge(
      this.searchControl.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        filter((v) => v.trim().length >= 2)
      ),
      this.manualTrigger$
    )
      .pipe(
        filter((v) => v.trim().length > 0),
        map((v) => this.sanitizeInput(v)),
        filter((username) => username.length > 0),
        tap((username) => {
          // If a URL was pasted, update the input field to show the extracted username
          if (this.searchControl.value.trim() !== username) {
            this.searchControl.setValue(username, { emitEvent: false });
          }
          this.isLoading.set(true);
          this.error.set(null);
          this.profile.set(null);
          this.showDropdown.set(false);
        }),
        switchMap((username) =>
          this.githubService.getUserFullProfile(username).pipe(
            catchError((err: unknown) => {
              this.error.set(
                err instanceof Error ? err.message : 'Kullanıcı bulunamadı.'
              );
              return EMPTY;
            }),
            finalize(() => this.isLoading.set(false))
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe((profile) => this.profile.set(profile));
  }

  /**
   * Extracts a plain GitHub username from any of these input forms:
   *   https://github.com/username
   *   http://github.com/username/repo  → returns only "username"
   *   github.com/username
   *   username                         → returned unchanged
   *
   * Uses a single regex that matches the first path segment of a github.com
   * URL, ignoring protocol, www prefix, and any trailing paths/query strings.
   * Non-URL inputs pass through untouched so plain usernames still work.
   */
  private sanitizeInput(raw: string): string {
    const trimmed = raw.trim();
    const urlMatch = trimmed.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i
    );
    return urlMatch ? urlMatch[1] : trimmed;
  }

  selectUser(user: GithubSearchUser): void {
    // emitEvent:false prevents the autocomplete stream from re-triggering
    this.searchControl.setValue(user.login, { emitEvent: false });
    this.showDropdown.set(false);
    this.selectedIndex.set(-1);
    this.manualTrigger$.next(user.login);
  }

  analyze(): void {
    const value = this.searchControl.value.trim();
    this.showDropdown.set(false);
    if (value) {
      this.manualTrigger$.next(value);
    }
  }

  onInputKeydown(event: KeyboardEvent): void {
    const sugg = this.suggestions();
    const show = this.showDropdown();

    if (event.key === 'ArrowDown' && show && sugg.length > 0) {
      event.preventDefault();
      this.selectedIndex.update((i) => Math.min(i + 1, sugg.length - 1));
    } else if (event.key === 'ArrowUp' && show && sugg.length > 0) {
      event.preventDefault();
      this.selectedIndex.update((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      const idx = this.selectedIndex();
      if (show && idx >= 0 && sugg[idx]) {
        this.selectUser(sugg[idx]);
      } else {
        this.analyze();
      }
    } else if (event.key === 'Escape') {
      this.showDropdown.set(false);
      this.selectedIndex.set(-1);
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.showDropdown.set(false);
      this.selectedIndex.set(-1);
    }
  }
}
