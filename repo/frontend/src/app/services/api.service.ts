import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

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
    return `${this.apiPrefix}${path.startsWith("/") ? path : `/${path}`}`;
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
