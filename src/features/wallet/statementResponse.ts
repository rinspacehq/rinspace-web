import { convertBoundShangong, parsePositiveWalletInteger, parseWalletInteger, rechargeShangong } from './amount';
import { parseWalletOperation, type WalletOperation } from './response';
import { exactFields, objectFields, reasonText, walletUUID } from './validation';

type Operation<K extends WalletOperation['kind']> = Extract<WalletOperation, { kind: K }>;
type Content = Readonly<{ content_type: 'blog' | 'book'; post_id: string; title: string }>;
interface Base { readonly sequence: string; readonly quantity: string }
/** Quantity describes the order; a pending order has not necessarily posted. */
export type WalletTransaction = Base & (
  | Readonly<{ operation: Operation<'recharge'>; perspective: 'recharge'; unit: 'SG'; amount_fen: string; refundable_fen: string }>
  | Readonly<{ operation: Operation<'tip'>; perspective: 'spend'; unit: 'SG'; content: Content }>
  | Readonly<{ operation: Operation<'tip'>; perspective: 'received'; unit: 'SG_BOUND'; content: Content }>
  | Readonly<{ operation: Operation<'conversion'>; perspective: 'conversion'; unit: 'SG_BOUND'; received_quantity: string }>
  | Readonly<{ operation: Operation<'refund'>; perspective: 'refund'; unit: 'SG'; amount_fen: string; original_operation_id: string }>
);
export interface WalletTransactionPage {
  readonly items: readonly WalletTransaction[];
  readonly next_cursor?: string;
  readonly watermark: string;
}
export interface WalletTransactionArchive {
  readonly pages: readonly WalletTransactionPage[];
  readonly exported_pages: number;
  readonly exported_items: number;
  readonly truncated: boolean;
  readonly next_cursor?: string;
  readonly watermark: string;
}

export function parseWalletTransaction(raw: unknown): WalletTransaction {
  const base = ['sequence', 'operation', 'perspective', 'unit', 'quantity'];
  const r = objectFields(raw, [...base, 'content', 'received_quantity', 'amount_fen', 'refundable_fen', 'original_operation_id']);
  const operation = parseWalletOperation(r.operation);
  const sequence = parsePositiveWalletInteger(r.sequence).toString();
  const quantity = parsePositiveWalletInteger(r.quantity);
  const common = { sequence, quantity: quantity.toString() };
  switch (r.perspective) {
    case 'recharge':
    case 'refund': {
      exactFields(raw, [...base, 'amount_fen', ...(r.perspective === 'refund' ? ['original_operation_id'] : ['refundable_fen'])]);
      const fen = parsePositiveWalletInteger(r.amount_fen);
      if (r.unit !== 'SG' || quantity !== rechargeShangong(fen)) throw new TypeError('Inconsistent wallet statement');
      if (r.perspective === 'recharge' && operation.kind === 'recharge') {
        const refundable = parseWalletInteger(r.refundable_fen);
        if (refundable > fen || refundable % 10n !== 0n || (operation.state !== 'CREDIT_POSTED' && refundable !== 0n)) throw new TypeError('Invalid refundable wallet amount');
        return Object.freeze({ ...common, operation, perspective: 'recharge', unit: 'SG', amount_fen: fen.toString(), refundable_fen: refundable.toString() });
      }
      if (r.perspective === 'refund' && operation.kind === 'refund') {
        const original_operation_id = walletUUID(r.original_operation_id);
        if (original_operation_id === operation.operation_id) throw new TypeError('Invalid wallet original operation');
        return Object.freeze({ ...common, operation, perspective: 'refund', unit: 'SG', amount_fen: fen.toString(), original_operation_id });
      }
      break;
    }
    case 'spend':
    case 'received': {
      exactFields(raw, [...base, 'content']);
      const c = exactFields(r.content, ['content_type', 'post_id', 'title']);
      if (operation.kind !== 'tip' || (c.content_type !== 'blog' && c.content_type !== 'book')) throw new TypeError('Invalid wallet statement content');
      const content = Object.freeze({ content_type: c.content_type, post_id: parsePositiveWalletInteger(c.post_id).toString(), title: reasonText(c.title) });
      if (r.perspective === 'spend' && r.unit === 'SG') return Object.freeze({ ...common, operation, perspective: 'spend', unit: 'SG', content });
      if (r.perspective === 'received' && r.unit === 'SG_BOUND') return Object.freeze({ ...common, operation, perspective: 'received', unit: 'SG_BOUND', content });
      break;
    }
    case 'conversion': {
      exactFields(raw, [...base, 'received_quantity']);
      const received = parsePositiveWalletInteger(r.received_quantity);
      if (operation.kind !== 'conversion' || r.unit !== 'SG_BOUND' || received !== convertBoundShangong(quantity)) throw new TypeError('Inconsistent wallet conversion statement');
      return Object.freeze({ ...common, operation, perspective: 'conversion', unit: 'SG_BOUND', received_quantity: received.toString() });
    }
  }
  throw new TypeError('Invalid wallet statement perspective');
}

function statementItems(raw: unknown): readonly WalletTransaction[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > 100
    || Reflect.ownKeys(raw).length !== raw.length + 1) throw new TypeError('Invalid wallet statement items');
  const result: WalletTransaction[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const field = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!field?.enumerable || !('value' in field)) throw new TypeError('Invalid wallet statement item');
    result.push(parseWalletTransaction(field.value));
  }
  return Object.freeze(result);
}

export function parseWalletTransactionPage(raw: unknown): WalletTransactionPage {
  const r = objectFields(raw, ['items', 'next_cursor', 'watermark']);
  const items = statementItems(r.items);
  const watermark = parseWalletInteger(r.watermark);
  const seen = new Set<string>();
  let previous = watermark;
  items.forEach((item, index) => {
    const sequence = parsePositiveWalletInteger(item.sequence);
    if (sequence > previous || (index > 0 && sequence === previous) || seen.has(item.operation.operation_id)) throw new TypeError('Inconsistent wallet statement ordering');
    previous = sequence;
    seen.add(item.operation.operation_id);
  });
  if (Object.hasOwn(r, 'next_cursor')) {
    if (typeof r.next_cursor !== 'string' || !/^[A-Za-z0-9_-]{16,2048}$/.test(r.next_cursor) || items.length === 0) throw new TypeError('Invalid wallet statement cursor');
    // Format only; the query service must verify signature, UID and filters.
    return Object.freeze({ items, next_cursor: r.next_cursor, watermark: watermark.toString() });
  }
  return Object.freeze({ items, watermark: watermark.toString() });
}

function safeCount(raw: unknown, maximum: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > maximum) throw new TypeError('Invalid wallet archive count');
  return raw;
}

function archivePages(raw: unknown): readonly WalletTransactionPage[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length === 0 || raw.length > 10
    || Reflect.ownKeys(raw).length !== raw.length + 1) throw new TypeError('Invalid wallet archive pages');
  const result: WalletTransactionPage[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const field = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!field?.enumerable || !('value' in field)) throw new TypeError('Invalid wallet archive page');
    result.push(parseWalletTransactionPage(field.value));
  }
  return Object.freeze(result);
}

export function parseWalletTransactionArchive(raw: unknown): WalletTransactionArchive {
  const r = objectFields(raw, ['pages', 'exported_pages', 'exported_items', 'truncated', 'next_cursor', 'watermark']);
  const pages = archivePages(r.pages);
  const watermark = parseWalletInteger(r.watermark).toString();
  const exported_pages = safeCount(r.exported_pages, 10);
  const exported_items = safeCount(r.exported_items, 1000);
  if (exported_pages !== pages.length || typeof r.truncated !== 'boolean') throw new TypeError('Invalid wallet archive');
  let count = 0;
  let previous = BigInt(watermark);
  let haveItem = false;
  const seen = new Set<string>();
  pages.forEach((page, index) => {
    if (page.watermark !== watermark || (index < pages.length - 1 && !page.next_cursor)) throw new TypeError('Invalid wallet archive page order');
    page.items.forEach(item => {
      const sequence = BigInt(item.sequence);
      if (sequence > previous || (haveItem && sequence >= previous) || seen.has(item.operation.operation_id)) throw new TypeError('Invalid wallet archive ordering');
      previous = sequence;
      haveItem = true;
      seen.add(item.operation.operation_id);
      count += 1;
    });
  });
  if (count !== exported_items) throw new TypeError('Invalid wallet archive count');
  const last = pages[pages.length - 1];
  if (r.truncated) {
    if (typeof r.next_cursor !== 'string' || r.next_cursor !== last.next_cursor) throw new TypeError('Invalid wallet archive cursor');
    return Object.freeze({ pages, exported_pages, exported_items, truncated: true, next_cursor: r.next_cursor, watermark });
  }
  if (Object.hasOwn(r, 'next_cursor') || last.next_cursor) throw new TypeError('Invalid wallet archive cursor');
  return Object.freeze({ pages, exported_pages, exported_items, truncated: false, watermark });
}
