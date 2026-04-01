import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable, map, tap } from "rxjs";

import { ApiService } from "./api.service";

export type UserRole = "admin" | "program_owner" | "reviewer" | "participant";

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly tokenKey = "auth.token";
  private readonly userKey = "auth.user";

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(
    this.readUserFromStorage(),
  );

  public readonly currentUser$ = this.currentUserSubject.asObservable();
  public readonly isLoggedIn$ = this.currentUser$.pipe(
    map((user: AuthUser | null) => user !== null),
  );

  public constructor(private readonly api: ApiService) {}

  public register(
    username: string,
    password: string,
  ): Observable<{ user: AuthUser }> {
    return this.api.post<{ user: AuthUser }>("/auth/register", {
      username,
      password,
    });
  }

  public login(username: string, password: string): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse>("/auth/login", { username, password })
      .pipe(
        tap((response: AuthResponse) =>
          this.persistSession(response.accessToken, response.user),
        ),
      );
  }

  public logout(): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>("/auth/logout").pipe(
      tap(() => {
        this.clearSession();
      }),
    );
  }

  public forceLogout(): void {
    this.clearSession();
  }

  public getCurrentUserSnapshot(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  private persistSession(token: string, user: AuthUser): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  private readUserFromStorage(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AuthUser;
      if (!parsed || typeof parsed.id !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
