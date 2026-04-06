import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

const LOCAL_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^::1$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /\.local$/i,
];

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly apiPrefix = "/api";

  public constructor(private readonly http: HttpClient) {}

  public get<T>(path: string, query?: Record<string, unknown>): Observable<T> {
    return this.http.get<T>(this.withPrefix(path), {
      headers: this.buildHeaders(),
      params: this.buildParams(query),
    });
  }

  public post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.withPrefix(path), body ?? {}, {
      headers: this.buildHeaders(),
    });
  }

  public put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.withPrefix(path), body ?? {}, {
      headers: this.buildHeaders(),
    });
  }

  public delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.withPrefix(path), {
      headers: this.buildHeaders(),
    });
  }

  private withPrefix(path: string): string {
    this.assertLocalOnlyBoundary();
    return `${this.apiPrefix}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private assertLocalOnlyBoundary(): void {
    if (typeof window === "undefined") {
      return;
    }

    const hostname = window.location.hostname;
    const isLocalHostname = LOCAL_HOSTNAME_PATTERNS.some((pattern) =>
      pattern.test(hostname),
    );

    if (isLocalHostname) {
      return;
    }

    // Frontend boundary only: backend/network policies must also enforce local-only access.
    // TODO(security): mirror this boundary with infrastructure network controls in deployment.
    throw new Error(
      "This frontend build is restricted to local/private-network operation.",
    );
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      "x-nonce": crypto.randomUUID(),
      "x-timestamp": String(Date.now()),
    });

    const token = localStorage.getItem("auth.token");
    if (token) {
      headers = headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }

  private buildParams(query?: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    if (!query) {
      return params;
    }

    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      params = params.set(key, String(value));
    }

    return params;
  }
}
