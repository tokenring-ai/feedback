import type { TokenRingService } from "@tokenring-ai/app/types";
import type WebHostService from "@tokenring-ai/web-host/WebHostService.ts";

export const FEEDBACK_PATH_PREFIX = "/feedback";

/** Default how long a browser feedback session waits before timing out (5 minutes). */
export const DEFAULT_FEEDBACK_TIMEOUT_MS = 300_000;

export type FeedbackSubmission = {
  accepted: boolean;
  comment?: string | undefined;
};

export type CreateSessionOptions = {
  /** Milliseconds before the session rejects. `0` disables the timeout. Default: 5 minutes. */
  timeoutMs?: number;
};

export type FeedbackSession = {
  id: string;
  rootDir: string;
  promise: Promise<FeedbackSubmission>;
  resolve: (result: FeedbackSubmission) => void;
  reject: (error: Error) => void;
  settled: boolean;
};

/**
 * Holds in-flight browser feedback sessions. HTTP is served by {@link FeedbackResource}
 * on the shared WebHost (not a per-session HTTP server).
 */
export default class FeedbackService implements TokenRingService {
  readonly name = "FeedbackService";
  description = "Browser-based human feedback sessions served via WebHost";

  private sessions = new Map<string, FeedbackSession>();

  createSession(rootDir: string, options?: CreateSessionOptions): FeedbackSession {
    const id = crypto.randomUUID();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_FEEDBACK_TIMEOUT_MS;

    let resolve!: (result: FeedbackSubmission) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<FeedbackSubmission>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const session: FeedbackSession = {
      id,
      rootDir,
      promise,
      settled: false,
      resolve: (result: FeedbackSubmission) => {
        if (session.settled) return;
        session.settled = true;
        clearTimer();
        resolve(result);
      },
      reject: (error: Error) => {
        if (session.settled) return;
        session.settled = true;
        clearTimer();
        reject(error);
      },
    };

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        session.reject(new Error("Feedback timeout: no response received"));
        // Drop the session so further HTTP hits return 404.
        this.sessions.delete(id);
      }, timeoutMs);
    }

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): FeedbackSession | undefined {
    return this.sessions.get(id);
  }

  completeSession(id: string, result: FeedbackSubmission): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.resolve(result);
    return true;
  }

  /**
   * Removes a session. If it has not settled yet, rejects its promise so waiters
   * do not hang (e.g. tool cleanup after cancellation). A no-op catch is attached
   * so rejection is not unhandled when nobody is currently awaiting.
   */
  removeSession(id: string, reason?: Error): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    if (!session.settled) {
      void session.promise.catch(() => {
        /* prevent unhandled rejection when cleanup races setup failure */
      });
      session.reject(reason ?? new Error("Feedback session cancelled"));
    }
  }

  /**
   * Public URL for a session entry page (opens in the user's browser).
   * Maps 0.0.0.0 bind addresses to 127.0.0.1 so local browsers can open the link.
   */
  getSessionUrl(sessionId: string, webHost: WebHostService, entry = "index.html"): string {
    const base = webHost.getURL();
    const url = new URL(`${FEEDBACK_PATH_PREFIX}/${sessionId}/${entry}`, base);
    if (url.hostname === "0.0.0.0") {
      url.hostname = "127.0.0.1";
    }
    return url.toString();
  }
}
