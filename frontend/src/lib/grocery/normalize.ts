// Defensive normalizers for LocalOCR / Grocery Manager responses. The
// app's JSON shape isn't versioned, so we check several common keys
// (quantity / qty / amount, category / section / aisle, etc.) and
// fall back quietly. Keeps the tiles working when the upstream
// schema drifts.

export interface InvItem {
  id: string;
  name: string;
  qty: number;
  min: number;
  unit?: string;
  category?: string;
}

export interface ShopItem {
  id: string;
  name: string;
  qty?: string;
  category?: string;
  done?: boolean;
}

function firstDefined<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v != null && v !== '') return v as T;
  return undefined;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}

function pickArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['items', 'inventory', 'data', 'results', 'list', 'entries']) {
      const v = d[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function normalizeInventory(data: unknown): InvItem[] {
  return pickArray(data).map((raw, idx) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: toStr(firstDefined(r.id, r.uuid, r.product_id, idx)),
      name: toStr(firstDefined(r.name, r.product_name, r.title, r.label) ?? '—'),
      qty: toNumber(firstDefined(r.qty, r.quantity, r.amount, r.count, r.stock, r.current_qty)),
      min: toNumber(
        firstDefined(r.min, r.min_qty, r.min_stock, r.threshold, r.reorder_point, r.par_level),
      ),
      unit: firstDefined(r.unit, r.uom, r.units) as string | undefined,
      category: firstDefined(r.category, r.section, r.aisle, r.group) as string | undefined,
    };
  });
}

export function normalizeShopping(data: unknown): ShopItem[] {
  return pickArray(data).map((raw, idx) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const qtyRaw = firstDefined(r.qty, r.quantity, r.amount, r.count);
    const qty = qtyRaw == null ? undefined : toStr(qtyRaw);
    return {
      id: toStr(firstDefined(r.id, r.uuid, r.item_id, idx)),
      name: toStr(firstDefined(r.name, r.product_name, r.title, r.label) ?? '—'),
      qty: qty && qty !== '0' ? qty : undefined,
      category: firstDefined(r.category, r.section, r.aisle, r.group) as string | undefined,
      done: Boolean(firstDefined(r.done, r.completed, r.checked, r.bought)),
    };
  });
}
