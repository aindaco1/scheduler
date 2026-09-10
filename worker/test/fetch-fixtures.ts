import { vi, expect } from "vitest";
type FixtureReply = {
  statusCode: number;
  data?: unknown;
  responseOptions?: { headers?: Record<string, string> };
};
type Fixture = {
  origin: string;
  path: string | RegExp | ((path: string) => boolean);
  method: string;
  persistent?: boolean;
  respond: (request: Request) => Promise<FixtureReply>;
};
const fixtures: Fixture[] = [];
// The installed Workers test plugin removed fetchMock. This strict global stub only
// intercepts these directly imported providers and rejects every unexpected request.
export const fetchMock = {
  activate() {
    activate();
  },
  disableNetConnect() {},
  deactivate() {
    vi.unstubAllGlobals();
    fixtures.length = 0;
  },
  assertConsumed() {
    expect(
      fixtures
        .filter((f) => !f.persistent)
        .map((f) => `${f.method} ${f.origin} ${String(f.path)}`),
    ).toEqual([]);
  },
  get(origin: string) {
    return {
      intercept(options: Pick<Fixture, "path" | "method">) {
        return {
          reply(
            status:
              | number
              | ((request: {
                  body: string;
                  headers: Record<string, string>;
                }) => FixtureReply),
            data?: unknown,
            responseOptions?: FixtureReply["responseOptions"],
          ) {
            const fixture: Fixture = {
              origin,
              ...options,
              respond: async (request) =>
                typeof status === "function"
                  ? status({
                      body: await request.text(),
                      headers: Object.fromEntries(request.headers),
                    })
                  : { statusCode: status, data, responseOptions },
            };
            fixtures.push(fixture);
            return {
              persist() {
                fixture.persistent = true;
              },
            };
          },
          replyWithError(error: Error) {
            fixtures.push({
              origin,
              ...options,
              respond: async () => {
                throw error;
              },
            });
          },
        };
      },
    };
  },
};
function activate() {
  fixtures.length = 0;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init),
        url = new URL(request.url),
        path = url.pathname + url.search;
      const index = fixtures.findIndex(
        (f) =>
          f.origin === url.origin &&
          f.method === request.method &&
          (typeof f.path === "string"
            ? f.path === path
            : f.path instanceof RegExp
              ? f.path.test(path)
              : f.path(path)),
      );
      if (index < 0)
        throw new Error(
          `Unexpected fixture request: ${request.method} ${url.origin}${path}`,
        );
      const fixture = fixtures[index];
      if (!fixture.persistent) fixtures.splice(index, 1);
      const reply = await fixture.respond(request);
      return new Response(
        typeof reply.data === "string"
          ? reply.data
          : JSON.stringify(reply.data),
        { status: reply.statusCode, headers: reply.responseOptions?.headers },
      );
    },
  );
}
