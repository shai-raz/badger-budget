/** The slice of a Puppeteer page this trace listens to. */
export interface TraceablePage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each Puppeteer event has its own payload type
    on(event: string, handler: (arg: any) => void): unknown;
    mainFrame(): unknown;
}

interface PendingRequest {
    method: string;
    url: string;
    type: string;
    startedAt: number;
}

const MAX_EVENTS = 60;
const MAX_PENDING_REPORTED = 25;

/** Strips the query string and fragment (they can carry tokens) and caps the length. */
export function redactUrl(raw: string): string {
    let url = raw;
    try {
        const parsed = new URL(raw);
        url = parsed.protocol === "data:" ? "data:…" : `${parsed.origin}${parsed.pathname}`;
    } catch {
        url = raw.split(/[?#]/)[0];
    }
    return url.length > 150 ? `${url.slice(0, 150)}…` : url;
}

/**
 * Records a scrape page's navigations, failed requests and error responses, and which requests are
 * still open, so a timed-out scrape can say what it was waiting on. Holds URLs only (no headers or
 * bodies), with query strings stripped.
 */
export class ScrapeRequestTrace {
    private readonly pending = new Map<unknown, PendingRequest>();
    private readonly events: string[] = [];
    private droppedEvents = 0;
    private startedAt = 0;

    constructor(private readonly now: () => number = Date.now) {}

    attach(page: TraceablePage): void {
        this.startedAt = this.now();

        page.on("request", (req) => {
            this.pending.set(req, {
                method: req.method(),
                url: redactUrl(req.url()),
                type: req.resourceType(),
                startedAt: this.now(),
            });
        });

        page.on("requestfinished", (req) => {
            const entry = this.take(req);
            const status: number | undefined = req.response()?.status();
            if (entry && status !== undefined && status >= 400) {
                this.record(`HTTP ${status} ${entry.method} ${entry.url} (${entry.type}, ${this.since(entry)})`);
            }
        });

        page.on("requestfailed", (req) => {
            const entry = this.take(req) ?? {
                method: req.method(),
                url: redactUrl(req.url()),
                type: req.resourceType(),
                startedAt: this.now(),
            };
            // `||`, not `??`: some blocked requests fail with an empty error text.
            const reason: string = req.failure()?.errorText || "unknown error";
            this.record(`FAILED ${entry.method} ${entry.url} (${entry.type}, ${reason}, ${this.since(entry)})`);
        });

        page.on("framenavigated", (frame) => {
            if (frame === page.mainFrame()) this.record(`NAVIGATED ${redactUrl(frame.url())}`);
        });
    }

    /** Log lines: the event timeline, then the requests still open, oldest first. */
    report(): string[] {
        const lines = [...this.events];
        if (this.droppedEvents > 0) lines.push(`… ${this.droppedEvents} more event(s) not kept`);

        const open = [...this.pending.values()].sort((a, b) => a.startedAt - b.startedAt);
        lines.push(`${open.length} request(s) still open`);
        for (const entry of open.slice(0, MAX_PENDING_REPORTED)) {
            lines.push(
                `OPEN ${entry.method} ${entry.url} (${entry.type}, started ${this.at(entry.startedAt)}, open ${this.since(entry)})`,
            );
        }
        if (open.length > MAX_PENDING_REPORTED) lines.push(`… ${open.length - MAX_PENDING_REPORTED} more open`);
        return lines;
    }

    private take(req: unknown): PendingRequest | undefined {
        const entry = this.pending.get(req);
        this.pending.delete(req);
        return entry;
    }

    private record(message: string): void {
        if (this.events.length >= MAX_EVENTS) {
            this.droppedEvents++;
            return;
        }
        this.events.push(`${this.at(this.now())} ${message}`);
    }

    private at(time: number): string {
        return `+${((time - this.startedAt) / 1000).toFixed(1)}s`;
    }

    private since(entry: PendingRequest): string {
        return `${((this.now() - entry.startedAt) / 1000).toFixed(1)}s`;
    }
}
