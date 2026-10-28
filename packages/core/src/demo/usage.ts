import { schema } from "@posta/db";
import { utcHour } from "../usage-hourly.js";
import { utcDay } from "../utc-day.js";
import type { DemoCtx } from "./context.js";

const FIELDS = [
  "accepted",
  "sent",
  "delivered",
  "bounced",
  "hardBounced",
  "complained",
  "opened",
  "clicked",
  "prefetched",
  "received",
] as const;
type Field = (typeof FIELDS)[number];
type Counts = Record<Field, number>;

const zero = (): Counts => Object.fromEntries(FIELDS.map((f) => [f, 0])) as Counts;

/**
 * The counters are derived from the same events the rows are written from, one
 * bump per event, so Metrics can never disagree with the Emails list.
 */
export class DemoUsage {
  readonly #daily = new Map<string, Counts>();
  readonly #hourly = new Map<number, Counts>();

  bump(at: Date, field: Field, n = 1): void {
    const day = utcDay(at);
    const hour = utcHour(at).getTime();
    const d = this.#daily.get(day) ?? zero();
    const h = this.#hourly.get(hour) ?? zero();
    d[field] += n;
    h[field] += n;
    this.#daily.set(day, d);
    this.#hourly.set(hour, h);
  }

  async flush(ctx: DemoCtx): Promise<void> {
    const { db, teamId } = ctx;
    await db
      .insert(schema.usageCounters)
      .values([...this.#daily].map(([day, counts]) => ({ teamId, day, ...counts })));
    const hourly = [...this.#hourly].map(([hour, counts]) => ({
      teamId,
      hour: new Date(hour),
      ...counts,
    }));
    for (let i = 0; i < hourly.length; i += 500) {
      await db.insert(schema.usageCountersHourly).values(hourly.slice(i, i + 500));
    }
    // The calendar month in progress, which is what a team with no subscription is metered on.
    const periodStart = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1));
    const inPeriod = [...this.#daily].filter(([day]) => Date.parse(day) >= periodStart.getTime());
    const sum = (f: Field) => inPeriod.reduce((n, [, c]) => n + c[f], 0);
    await db
      .insert(schema.usagePeriods)
      .values({ teamId, periodStart, accepted: sum("accepted"), received: sum("received") });
  }
}
