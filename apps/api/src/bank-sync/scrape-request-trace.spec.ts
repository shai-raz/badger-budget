import { EventEmitter } from "events";
import { redactUrl, ScrapeRequestTrace } from "./scrape-request-trace";

function fakeRequest(url: string, opts: { method?: string; type?: string; status?: number; error?: string } = {}) {
    return {
        url: () => url,
        method: () => opts.method ?? "GET",
        resourceType: () => opts.type ?? "script",
        response: () => (opts.status === undefined ? null : { status: () => opts.status }),
        failure: () => (opts.error ? { errorText: opts.error } : null),
    };
}

function setup() {
    let clock = 1_000;
    const page = Object.assign(new EventEmitter(), { mainFrame: () => mainFrame });
    const mainFrame = { url: () => "https://www.cal-online.co.il/?token=secret" };
    const trace = new ScrapeRequestTrace(() => clock);
    trace.attach(page);
    return { page, mainFrame, trace, advance: (ms: number) => (clock += ms) };
}

describe("ScrapeRequestTrace", () => {
    it("reports requests that never finished, oldest first, with how long they were open", () => {
        const { page, trace, advance } = setup();
        const slow = fakeRequest("https://connect.cal-online.co.il/api/login?user=x", { method: "POST", type: "xhr" });
        const later = fakeRequest("https://www.cal-online.co.il/app.js");
        page.emit("request", slow);
        advance(2_000);
        page.emit("request", later);
        advance(28_000);

        expect(trace.report()).toEqual([
            "2 request(s) still open",
            "OPEN POST https://connect.cal-online.co.il/api/login (xhr, started +0.0s, open 30.0s)",
            "OPEN GET https://www.cal-online.co.il/app.js (script, started +2.0s, open 28.0s)",
        ]);
    });

    it("drops finished requests and records failures, error responses and main-frame navigations", () => {
        const { page, mainFrame, trace, advance } = setup();
        const ok = fakeRequest("https://www.cal-online.co.il/ok.js", { status: 200 });
        const blocked = fakeRequest("https://api.cal-online.co.il/x", { type: "fetch", status: 403 });
        const failed = fakeRequest("https://www.google.com/recaptcha", { error: "net::ERR_TUNNEL_CONNECTION_FAILED" });
        for (const req of [ok, blocked, failed]) page.emit("request", req);
        advance(500);
        page.emit("requestfinished", ok);
        page.emit("requestfinished", blocked);
        page.emit("requestfailed", failed);
        page.emit("framenavigated", { url: () => "https://other-frame.example/" });
        page.emit("framenavigated", mainFrame);

        expect(trace.report()).toEqual([
            "+0.5s HTTP 403 GET https://api.cal-online.co.il/x (fetch, 0.5s)",
            "+0.5s FAILED GET https://www.google.com/recaptcha (script, net::ERR_TUNNEL_CONNECTION_FAILED, 0.5s)",
            "+0.5s NAVIGATED https://www.cal-online.co.il/",
            "0 request(s) still open",
        ]);
    });

    it("caps the kept events", () => {
        const { page, trace } = setup();
        for (let i = 0; i < 70; i++) {
            const req = fakeRequest(`https://x.example/${i}`, { error: "net::ERR_FAILED" });
            page.emit("request", req);
            page.emit("requestfailed", req);
        }

        const report = trace.report();
        expect(report.filter((line) => line.includes("FAILED"))).toHaveLength(60);
        expect(report).toContain("… 10 more event(s) not kept");
    });
});

describe("redactUrl", () => {
    it("strips the query string and fragment", () => {
        expect(redactUrl("https://a.example/p/q?token=1#frag")).toBe("https://a.example/p/q");
    });

    it("hides data URLs and caps long URLs", () => {
        expect(redactUrl("data:image/png;base64,AAAA")).toBe("data:…");
        expect(redactUrl(`https://a.example/${"x".repeat(200)}`)).toHaveLength(151);
    });
});
