import type { ICacheService } from "@medusajs/framework/types";
import { DateTime } from "luxon";

type Rates = { rates: Record<string, number> };

export async function analyticsRates(
  base: string,
  orders: { currency_code: string }[],
  cache: ICacheService,
): Promise<Record<string, number>> {
  const currencies = new Set(
    orders.map((order) => order.currency_code.toUpperCase()),
  );
  currencies.delete(base);
  if (!currencies.size) return { [base]: 1 };

  const valid = (data: Rates | null): data is Rates =>
    !!data?.rates &&
    [...currencies].every(
      (code) => Number.isFinite(data.rates[code]) && data.rates[code] > 0,
    );
  const key = `exchange_rates_${base}`;
  let rates = await cache.get<Rates>(key);
  if (!valid(rates)) {
    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("Analytics exchange rates unavailable");
    rates = await response.json();
    if (!valid(rates)) throw new Error("Missing analytics exchange rate");
    const now = DateTime.now().setZone("Europe/Berlin");
    let expiry = now.startOf("day").set({ hour: 16 });
    if (expiry <= now) expiry = expiry.plus({ days: 1 });
    await cache.set(
      key,
      rates,
      Math.max(1, Math.floor(expiry.diff(now, "seconds").seconds)),
    );
  }
  return { ...rates.rates, [base]: 1 };
}
