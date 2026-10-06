/** Dataset planning state only; this is not a timed benchmark implementation.
 * Keeping a live-order model lets cancels/replacements target real orders and
 * crossing bursts consume real liquidity instead of mostly rejected events.
 */
export const EXCHANGE_PROFILES = ["deep-book", "crossing-burst", "cancel-storm", "hot-symbols", "balanced-session"] as const;
type Node = { id: number; account: number; instrument: number; side: number; price: number; quantity: number; slot: number; previous?: Node; next?: Node };
type Level = { first?: Node; last?: Node };
type Book = { prices: number[]; levels: Map<number, Level> };
type SymbolState = { books: [Book, Book]; halted: boolean; low: number; high: number; accounts: [number[], number[]] };
const mixes: Record<string, number[]> = {
  "deep-book": [65, 5, 15, 10, 1, 1, 0.5, 0.5, 1, 1],
  "crossing-burst": [35, 35, 8, 12, 1, 1, 1, 1, 2, 4],
  "cancel-storm": [45, 5, 30, 15, 1, 1, 0.5, 0.5, 1, 1],
  "hot-symbols": [45, 15, 15, 12, 1.5, 1.5, 0.75, 0.75, 1.5, 7],
  "balanced-session": [45, 15, 15, 12, 1.5, 1.5, 0.75, 0.75, 1.5, 7]
};

export function generateExchangeDataset(size: string, profile: string, random: () => number): string {
  const dimensions = {
    small: [16, 2_000, 50_000], medium: [128, 20_000, 500_000], large: [1_024, 100_000, 3_000_000]
  }[size];
  if (!dimensions || !mixes[profile] || (size === "large" && profile !== "balanced-session")) {
    throw new Error(`No arena-exchange generation profile for '${size}/${profile}'`);
  }
  const [instrumentCount, accountCount, eventCount] = dimensions as [number, number, number];
  const symbols: SymbolState[] = Array.from({ length: instrumentCount }, () => ({
    books: [{ prices: [], levels: new Map() }, { prices: [], levels: new Map() }],
    halted: false, low: 9_000, high: 11_000, accounts: [[], []]
  }));
  const instruments = symbols.map((_, i) => [i + 1, 9_000, 11_000]);
  const accounts = Array.from({ length: accountCount }, (_, i) => {
    const instrument = i % instrumentCount;
    const side = Math.floor(i / instrumentCount) % 2;
    symbols[instrument]!.accounts[side]!.push(i + 1);
    return [i + 1, 10_000_000_000, [[instrument + 1, 10_000_000]]];
  });
  const live: Node[] = [];
  const events: number[][] = [];
  let nextOrder = 1;
  const pick = (n: number) => Math.floor(random() * n);
  const chooseSymbol = () => profile === "hot-symbols" && random() < 0.9
    ? pick(Math.max(1, Math.ceil(instrumentCount * 0.01))) : pick(instrumentCount);
  const chooseAccount = (instrument: number, side: number) => {
    const pool = symbols[instrument]!.accounts[side]!;
    return pool[pick(pool.length)]!;
  };
  const remove = (o: Node) => {
    const b = symbols[o.instrument]!.books[o.side]!;
    const level = b.levels.get(o.price)!;
    if (o.previous) o.previous.next = o.next; else level.first = o.next;
    if (o.next) o.next.previous = o.previous; else level.last = o.previous;
    if (!level.first) { b.levels.delete(o.price); b.prices.splice(b.prices.indexOf(o.price), 1); }
    const last = live.pop()!;
    if (last !== o) { live[o.slot] = last; last.slot = o.slot; }
  };
  const add = (o: Node) => {
    const b = symbols[o.instrument]!.books[o.side]!;
    let level = b.levels.get(o.price);
    if (!level) {
      level = {}; b.levels.set(o.price, level);
      let lo = 0, hi = b.prices.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (o.side === 0 ? b.prices[mid]! > o.price : b.prices[mid]! < o.price) lo = mid + 1; else hi = mid; }
      b.prices.splice(lo, 0, o.price);
    }
    o.previous = level.last; o.next = undefined;
    if (level.last) level.last.next = o; else level.first = o;
    level.last = o; o.slot = live.length; live.push(o);
  };
  const fill = (instrument: number, side: number, quantity: number, price?: number) => {
    const b = symbols[instrument]!.books[1 - side]!;
    while (quantity > 0 && b.prices.length) {
      const best = b.prices[0]!;
      if (price !== undefined && (side === 0 ? best > price : best < price)) break;
      const maker = b.levels.get(best)!.first!;
      const q = Math.min(quantity, maker.quantity); quantity -= q; maker.quantity -= q;
      if (!maker.quantity) remove(maker);
    }
    return quantity;
  };
  const push = (type: number, ...fields: number[]) => events.push([type, events.length + 1, ...fields]);
  // Exact quotas plus a deterministic shuffle; fallbacks are visible in profile
  // statistics and tested rather than pretending selected types always execute.
  const schedule: number[] = [];
  const weights = mixes[profile]!;
  for (let type = 0; type < weights.length; type++) {
    const count = Math.floor((eventCount - 1) * weights[type]! / 100);
    for (let i = 0; i < count; i++) schedule.push(type);
  }
  while (schedule.length < eventCount - 1) schedule.push(0);
  for (let i = schedule.length - 1; i > 0; i--) { const j = pick(i + 1); [schedule[i], schedule[j]] = [schedule[j]!, schedule[i]!]; }
  for (let type of schedule) {
    let instrument = chooseSymbol();
    let symbol = symbols[instrument]!;
    const side = pick(2); let quantity = 1 + pick(20);
    // Exactly one deliberate unknown-account event per 32 event slots.
    if ((events.length + 1) % 32 === 0) { push(5, 2_147_483_647, 1); continue; }
    if (type <= 1 || type === 3) {
      // Controls halt only briefly; select an active symbol for trading.
      let attempts = 0;
      const activePool = profile === "hot-symbols" && instrument < Math.ceil(instrumentCount * 0.01)
        ? Math.max(1, Math.ceil(instrumentCount * 0.01)) : instrumentCount;
      while (symbol.halted && attempts++ < activePool) { instrument = (instrument + 1) % activePool; symbol = symbols[instrument]!; }
      if (symbol.halted) { push(7, instrument + 1); symbol.halted = false; continue; }
    }
    if ((type === 2 || type === 3) && !live.length) type = 0;
    if (type === 1 && !symbol.books[1 - side]!.prices.length) type = 0;
    if (type === 0) {
      const crossing = profile === "crossing-burst" && random() < 0.98 && symbol.books[1 - side]!.prices.length > 0;
      if (profile === "crossing-burst" && !crossing) quantity = 1_000 + pick(1_000);
      const spread = profile === "deep-book" ? pick(512) : profile === "crossing-burst" ? 0 : pick(64);
      const price = crossing ? symbol.books[1 - side]!.prices[0]!
        : side === 0 ? Math.max(symbol.low, 9_980 - spread) : Math.min(symbol.high, 10_020 + spread);
      const id = nextOrder++, account = chooseAccount(instrument, side);
      push(0, id, account, instrument + 1, side, price, quantity);
      const remaining = fill(instrument, side, quantity, price);
      if (remaining) add({ id, account, instrument, side, price, quantity: remaining, slot: 0 });
    } else if (type === 1) {
      push(1, nextOrder++, chooseAccount(instrument, side), instrument + 1, side, quantity);
      fill(instrument, side, quantity);
    } else if (type === 2) {
      const o = live[pick(live.length)]!; push(2, o.account, o.id); remove(o);
    } else if (type === 3) {
      const o = live[pick(live.length)]!;
      const ownerSymbol = symbols[o.instrument]!;
      if (ownerSymbol.halted) { push(7, o.instrument + 1); ownerSymbol.halted = false; continue; }
      const spread = profile === "crossing-burst" ? 0 : pick(64);
      if (profile === "crossing-burst") quantity = 1_000 + pick(1_000);
      const price = o.side === 0 ? Math.max(ownerSymbol.low, 9_980 - spread) : Math.min(ownerSymbol.high, 10_020 + spread);
      push(3, o.account, o.id, price, quantity); remove(o); o.price = price; o.quantity = quantity; add(o);
    } else if (type === 4 || type === 5) {
      push(type, 1 + pick(accountCount), 1 + pick(1_000));
    } else if (type === 6 || type === 7) {
      push(symbol.halted ? 7 : 6, instrument + 1); symbol.halted = !symbol.halted;
    } else if (type === 8) {
      const tight = symbol.low === 9_000; symbol.low = tight ? 9_980 : 9_000; symbol.high = tight ? 10_020 : 11_000;
      push(8, instrument + 1, symbol.low, symbol.high);
      for (const b of symbol.books) for (const p of [...b.prices]) {
        if (p < symbol.low || p > symbol.high) { const level = b.levels.get(p)!; while (level.first) remove(level.first); }
      }
    } else { push(9, instrument + 1, 1 + pick(10)); }
  }
  push(10);
  return `${JSON.stringify({ schemaVersion: "1.0.0", instruments, accounts, events })}\n`;
}
