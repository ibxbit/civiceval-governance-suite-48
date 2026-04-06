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

type ModerationQna = {
  id: number;
  questionText: string;
  answerText: string | null;
  status: "pending" | "approved" | "blocked";
  pinned: boolean;
};

type ModerationQnaReport = {
  id: number;
  qnaId: number;
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
      <p *ngIf="errorMessage" class="error">{{ errorMessage }}</p>

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

      <section class="panel">
        <h2>Q&A Queue</h2>
        <p *ngIf="qnaEntries.length === 0">No Q&A in queue.</p>
        <article *ngFor="let qna of qnaEntries" class="panel">
          <p>{{ qna.questionText }}</p>
          <small *ngIf="qna.answerText">Answer: {{ qna.answerText }}</small>
          <small>Status: {{ qna.status }} | Pinned: {{ qna.pinned }}</small>
          <div>
            <button type="button" (click)="approveQna(qna.id)">Approve</button>
            <button type="button" (click)="pinQna(qna.id)">Pin</button>
            <button type="button" (click)="blockQna(qna.id)">Block</button>
          </div>
        </article>
      </section>

      <section class="panel">
        <h2>Open Q&A Reports</h2>
        <p *ngIf="qnaReports.length === 0">No open Q&A reports.</p>
        <article *ngFor="let report of qnaReports" class="panel">
          <p>Q&A #{{ report.qnaId }}: {{ report.reason }}</p>
          <small *ngIf="report.details">{{ report.details }}</small>
          <div>
            <button type="button" (click)="handleQnaReport(report.id, 'approve')">
              Approve
            </button>
            <button type="button" (click)="handleQnaReport(report.id, 'block')">
              Block
            </button>
            <button type="button" (click)="handleQnaReport(report.id, 'dismiss')">
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
  protected qnaEntries: ModerationQna[] = [];
  protected qnaReports: ModerationQnaReport[] = [];
  protected loginEvents: UnrecognizedLoginEvent[] = [];
  protected readonly isAdmin: boolean;
  protected errorMessage = "";

  public constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isAdmin = this.auth.getCurrentUserSnapshot()?.role === "admin";
    this.loadComments();
    this.loadReports();
    this.loadQna();
    this.loadQnaReports();
    if (this.isAdmin) {
      this.loadLoginEvents();
    }
  }

  protected loadComments(): void {
    this.errorMessage = "";
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
        error: () => {
          this.comments = [];
          this.errorMessage = "Failed to load moderation comments.";
        },
      });
  }

  protected loadReports(): void {
    this.errorMessage = "";
    this.api
      .get<{ data: ModerationReport[] }>("/moderation/reports", {
        page: 1,
        limit: 20,
      })
      .subscribe({
        next: (response: { data: ModerationReport[] }) => {
          this.reports = response.data;
        },
        error: () => {
          this.reports = [];
          this.errorMessage = "Failed to load moderation reports.";
        },
      });
  }

  protected loadQna(): void {
    this.api
      .get<{ data: ModerationQna[] }>("/moderation/qna", {
        page: 1,
        limit: 20,
        status: "pending",
      })
      .subscribe({
        next: (response: { data: ModerationQna[] }) => {
          this.qnaEntries = response.data;
        },
        error: () => {
          this.qnaEntries = [];
          this.errorMessage = "Failed to load moderation Q&A.";
        },
      });
  }

  protected loadQnaReports(): void {
    this.api
      .get<{ data: ModerationQnaReport[] }>("/moderation/qna/reports", {
        page: 1,
        limit: 20,
      })
      .subscribe({
        next: (response: { data: ModerationQnaReport[] }) => {
          this.qnaReports = response.data;
        },
        error: () => {
          this.qnaReports = [];
          this.errorMessage = "Failed to load moderation Q&A reports.";
        },
      });
  }

  protected approve(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/approve`)
      .subscribe({
        next: () => this.loadComments(),
        error: () => {
          this.errorMessage = "Approve action failed.";
        },
      });
  }

  protected pin(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/pin`, { pinned: true })
      .subscribe({
        next: () => this.loadComments(),
        error: () => {
          this.errorMessage = "Pin action failed.";
        },
      });
  }

  protected block(commentId: number): void {
    this.api
      .post(`/moderation/comments/${commentId}/block`)
      .subscribe({
        next: () => this.loadComments(),
        error: () => {
          this.errorMessage = "Block action failed.";
        },
      });
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
        error: () => {
          this.errorMessage = "Report action failed.";
        },
      });
  }

  protected approveQna(qnaId: number): void {
    this.api.post(`/moderation/qna/${qnaId}/approve`).subscribe({
      next: () => this.loadQna(),
      error: () => {
        this.errorMessage = "Q&A approve action failed.";
      },
    });
  }

  protected pinQna(qnaId: number): void {
    this.api.post(`/moderation/qna/${qnaId}/pin`, { pinned: true }).subscribe({
      next: () => this.loadQna(),
      error: () => {
        this.errorMessage = "Q&A pin action failed.";
      },
    });
  }

  protected blockQna(qnaId: number): void {
    this.api.post(`/moderation/qna/${qnaId}/block`).subscribe({
      next: () => this.loadQna(),
      error: () => {
        this.errorMessage = "Q&A block action failed.";
      },
    });
  }

  protected handleQnaReport(
    reportId: number,
    action: "approve" | "block" | "dismiss",
  ): void {
    this.api
      .post(`/moderation/qna/reports/${reportId}/handle`, { action })
      .subscribe({
        next: () => {
          this.loadQna();
          this.loadQnaReports();
        },
        error: () => {
          this.errorMessage = "Q&A report action failed.";
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
