import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";

import { AuthService } from "../../services/auth.service";
import { ApiService } from "../../services/api.service";

type ModerationComment = {
  id: number;
  body: string;
  status: "pending" | "approved" | "blocked";
  pinned: boolean;
};

type ModerationReport = {
  id: number;
  commentId: number;
  reason: string;
  details: string | null;
};

type UnrecognizedLoginEvent = {
  id: number;
  username: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

@Component({
  selector: "app-moderation-queue-page",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page">
      <h1>Moderation Queue</h1>

      <section class="panel">
        <h2>Comments</h2>
        <p *ngIf="comments.length === 0">No comments in queue.</p>
        <article *ngFor="let comment of comments" class="panel">
          <p>{{ comment.body }}</p>
          <small
            >Status: {{ comment.status }} | Pinned: {{ comment.pinned }}</small
          >
          <div>
            <button type="button" (click)="approve(comment.id)">Approve</button>
            <button type="button" (click)="pin(comment.id)">Pin</button>
            <button type="button" (click)="block(comment.id)">Block</button>
          </div>
        </article>
      </section>

      <section class="panel">
        <h2>Open Reports</h2>
        <p *ngIf="reports.length === 0">No open reports.</p>
        <article *ngFor="let report of reports" class="panel">
          <p>Comment #{{ report.commentId }}: {{ report.reason }}</p>
          <small *ngIf="report.details">{{ report.details }}</small>
          <div>
            <button type="button" (click)="handleReport(report.id, 'approve')">
              Approve
            </button>
            <button type="button" (click)="handleReport(report.id, 'block')">
              Block
            </button>
            <button type="button" (click)="handleReport(report.id, 'dismiss')">
              Dismiss
            </button>
          </div>
        </article>
      </section>

      <section class="panel" *ngIf="isAdmin">
        <h2>Unrecognized Login Events</h2>
        <p *ngIf="loginEvents.length === 0">No unreviewed events.</p>
        <article *ngFor="let event of loginEvents" class="panel">
          <p>{{ event.username }} - {{ event.ipAddress ?? "Unknown IP" }}</p>
          <small>{{ event.userAgent ?? "Unknown device" }}</small>
          <small>{{ event.createdAt | date: "medium" }}</small>
          <div>
            <button type="button" (click)="reviewLoginEvent(event.id)">
              Mark Reviewed
            </button>
          </div>
        </article>
      </section>
    </section>
  `,
})
export class ModerationQueuePageComponent {
  protected comments: ModerationComment[] = [];
  protected reports: ModerationReport[] = [];
  protected loginEvents: UnrecognizedLoginEvent[] = [];
  protected readonly isAdmin: boolean;

  public constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isAdmin = this.auth.getCurrentUserSnapshot()?.role === "admin";
    this.loadComments();
    this.loadReports();
    if (this.isAdmin) {
      this.loadLoginEvents();
    }
  }

  protected loadComments(): void {
    this.api
      .get<{ data: ModerationComment[] }>("/moderation/comments", {
        page: 1,
        limit: 20,
        status: "pending",
      })
      .subscribe({
        next: (response: { data: ModerationComment[] }) => {
          this.comments = response.data;
        },
      });
  }

  protected loadReports(): void {
    this.api
      .get<{ data: ModerationReport[] }>("/moderation/reports", {
        page: 1,
        limit: 20,
      })
      .subscribe({
        next: (response: { data: ModerationReport[] }) => {
          this.reports = response.data;
        },
      });
  }

  protected approve(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/approve`)
      .subscribe({ next: () => this.loadComments() });
  }

  protected pin(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/pin`, { pinned: true })
      .subscribe({ next: () => this.loadComments() });
  }

  protected block(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/block`)
      .subscribe({ next: () => this.loadComments() });
  }

  protected handleReport(
    reportId: number,
    action: "approve" | "block" | "dismiss",
  ): void {
    this.api
      .post(`/moderation/reports/${reportId}/handle`, { action })
      .subscribe({
        next: () => {
          this.loadComments();
          this.loadReports();
        },
      });
  }

  protected loadLoginEvents(): void {
    this.api
      .get<{ data: UnrecognizedLoginEvent[] }>(
        "/auth/login-events/unrecognized",
        {
          page: 1,
          limit: 20,
          reviewed: "false",
        },
      )
      .subscribe({
        next: (response: { data: UnrecognizedLoginEvent[] }) => {
          this.loginEvents = response.data;
        },
        error: () => {
          this.loginEvents = [];
        },
      });
  }

  protected reviewLoginEvent(eventId: number): void {
    this.api.post(`/auth/login-events/${eventId}/review`, {}).subscribe({
      next: () => {
        this.loadLoginEvents();
      },
    });
  }
}
