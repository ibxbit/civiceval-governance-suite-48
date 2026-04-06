import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { ApiService } from "./api.service";

type AnalyticsEventType =
  | "page_view"
  | "dwell"
  | "read_complete"
  | "search"
  | "search_click";

type TrackEventPayload = {
  eventType: AnalyticsEventType;
  pagePath: string;
  contentId?: number;
  referrer?: string;
  dwellMs?: number;
};

@Injectable({ providedIn: "root" })
export class AnalyticsService {
  public constructor(private readonly api: ApiService) {}

  public trackPageView(pagePath: string, referrer?: string): Observable<unknown> {
    return this.trackEvent({ eventType: "page_view", pagePath, referrer });
  }

  public trackDwell(pagePath: string, dwellMs: number, contentId?: number): Observable<unknown> {
    return this.trackEvent({ eventType: "dwell", pagePath, dwellMs, contentId });
  }

  public trackReadComplete(pagePath: string, contentId?: number): Observable<unknown> {
    return this.trackEvent({ eventType: "read_complete", pagePath, contentId });
  }

  public trackSearch(pagePath: string, query: string): Observable<unknown> {
    return this.trackEvent({ eventType: "search", pagePath, referrer: query });
  }

  public trackSearchClick(pagePath: string, contentId: number): Observable<unknown> {
    return this.trackEvent({ eventType: "search_click", pagePath, contentId });
  }

  private trackEvent(payload: TrackEventPayload): Observable<unknown> {
    return this.api.post("/analytics/events", payload);
  }
}
