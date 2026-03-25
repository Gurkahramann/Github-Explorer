import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { GithubUser } from '../models/github-user.model';
import { GithubRepo } from '../models/github-repo.model';
import { GithubSearchUser } from '../models/github-search-user.model';

export interface UserFullProfile {
  user: GithubUser;
  repos: GithubRepo[];
}

@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = 'https://api.github.com';

  /**
   * In-memory cache: maps a lowercased username to its shared Observable.
   * Keyed on the username so concurrent and repeat lookups reuse the same stream
   * without issuing a second HTTP request.
   */
  private readonly profileCache = new Map<string, Observable<UserFullProfile>>();

  /**
   * Searches GitHub users by query string and returns the top 5 matches.
   * Maps the API envelope { items: [...] } down to the items array directly
   * so callers never need to unwrap the response shape.
   */
  searchUsers(query: string): Observable<GithubSearchUser[]> {
    return this.http
      .get<{ items: GithubSearchUser[] }>(
        `${this.apiBase}/search/users?q=${encodeURIComponent(query)}&per_page=5`
      )
      .pipe(
        map((response) => response.items),
        catchError(() => of([] as GithubSearchUser[]))
      );
  }

  /**
   * Fetches a user's full profile (bio + 6 most-recently-updated repos) in
   * parallel via forkJoin, and caches the resulting Observable with shareReplay(1).
   *
   * ### Why shareReplay(1)?
   * GitHub's unauthenticated API is rate-limited to **60 requests / hour**.
   * shareReplay(1) keeps the last emitted value in a replay buffer; any
   * subscriber that arrives after the HTTP response has landed — including a
   * re-render or a second component reading the same profile — receives the
   * cached emission instantly without a new network round-trip.
   * Combined with the Map-based cache that stores the Observable itself,
   * even a call made *before* the response arrives shares the same
   * in-flight request (no duplicate calls), cutting API usage to
   * exactly 1 request per unique username for the lifetime of the service.
   *
   * ### Error strategy
   * On failure, the cache entry is evicted inside catchError *before*
   * shareReplay sees the error, so the next call retries the API instead of
   * replaying a stale error to future subscribers.
   */
  getUserFullProfile(username: string): Observable<UserFullProfile> {
    const key = username.toLowerCase().trim();

    if (this.profileCache.has(key)) {
      return this.profileCache.get(key)!;
    }

    const user$ = this.http.get<GithubUser>(
      `${this.apiBase}/users/${username}`
    );

    const repos$ = this.http
      .get<GithubRepo[]>(
        `${this.apiBase}/users/${username}/repos?sort=updated&per_page=6`
      )
      .pipe(catchError(() => of([] as GithubRepo[])));

    const profile$ = forkJoin({ user: user$, repos: repos$ }).pipe(
      map(({ user, repos }) => ({ user, repos })),
      catchError((error: unknown) => {
        // Evict the failed entry so the next call issues a fresh request
        // instead of replaying this error from the buffer.
        this.profileCache.delete(key);
        const message =
          error instanceof Error ? error.message : 'Kullanıcı bulunamadı.';
        throw new Error(message);
      }),
      shareReplay(1)
    );

    this.profileCache.set(key, profile$);
    return profile$;
  }
}
