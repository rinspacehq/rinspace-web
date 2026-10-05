import { publicEnv } from '@/app/config/env';
import { parseWalletAppealResult, parseWalletCasePage, parseWalletSummary, parseWalletTipPreview, parseWalletConversionPreview, parseWalletOperation, parseWalletProblem } from '@/features/wallet/response';
import { parseWalletTransaction, parseWalletTransactionArchive, parseWalletTransactionPage } from '@/features/wallet/statementResponse';
import { parseWalletPublicPolicy } from '@/features/wallet/publicPolicy';
import { createWalletRequest } from '@/features/wallet/request';
import { walletUUID } from '@/features/wallet/validation';
import { authHeaders, getCurrentAuthUser } from '@/services/phoneAuth';

export class WalletReadError extends Error {
  constructor(readonly kind: 'session' | 'unavailable' | 'invalid') { super(kind); }
}

async function read(path: string, signal: AbortSignal): Promise<unknown> {
  // The existing managed HttpOnly cookie is the only credential. Never add a
  // legacy bearer token, UID query parameter, or browser wallet cache.
  const response = await fetch(`${publicEnv.publicBasePath || ''}/api/wallet/v1/${path}`, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) throw new WalletReadError('session');
  if (!response.ok) throw new WalletReadError(response.status === 400 ? 'invalid' : 'unavailable');
  try { return await response.json() as unknown; }
  catch { throw new WalletReadError('unavailable'); }
}

export async function loadWalletSummary(signal: AbortSignal) {
  return parseWalletSummary(await read('summary', signal));
}

export async function loadWalletPolicy(signal: AbortSignal) {
  return parseWalletPublicPolicy(await read('policy', signal));
}

export async function loadWalletTipperCount(contentType: 'blog' | 'book', postID: string, signal: AbortSignal) {
  if (!/^[1-9][0-9]*$/.test(postID)) throw new WalletReadError('invalid');
  const params = new URLSearchParams({ content_type: contentType, post_id: postID });
  const value = await read(`tips/count?${params}`, signal);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WalletReadError('unavailable');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.count !== 'number' || !Number.isSafeInteger(record.count) || record.count < 0) {
    throw new WalletReadError('unavailable');
  }
  return record.count;
}

export async function loadWalletCases(signal: AbortSignal) {
  return parseWalletCasePage(await read('cases', signal));
}

export class WalletCommandError extends Error {
  constructor(readonly code: string) { super(code); }
}
const commandPaths = { 'recharge.create': 'recharges', 'conversion.preview': 'conversion-previews', 'conversion.create': 'conversions', 'tip.preview': 'tip-previews', 'tip.create': 'tips' } as const;
async function walletCommand(uid: string, key: string, action: keyof typeof commandPaths, raw: unknown, signal: AbortSignal): Promise<unknown> {
  walletUUID(key);
  const body = JSON.stringify(createWalletRequest(action, raw));
  const user = await getCurrentAuthUser();
  const csrf = authHeaders()['X-Rinspace-CSRF'];
  if (user?.id !== uid || !csrf) throw new WalletCommandError('UNAUTHENTICATED');
  try {
    const response = await fetch(`${publicEnv.publicBasePath || ''}/api/wallet/v1/${commandPaths[action]}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rinspace-CSRF': csrf, 'Idempotency-Key': key }, body,
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new WalletCommandError(parseWalletProblem(value, response.status).error.code);
    if (response.status !== 200 && response.status !== 201) throw new WalletCommandError('RESULT_UNKNOWN');
    return value;
  } catch (error: unknown) {
    if (error instanceof WalletCommandError) throw error;
    // Aborted, lost or invalid responses never prove that the command failed.
    throw new WalletCommandError('RESULT_UNKNOWN');
  }
}
export async function createWalletRecharge(uid:string,key:string,amountFen:string,policyVersion:string,agreementVersion:string,signal:AbortSignal){
  const operation=parseWalletOperation(await walletCommand(uid,key,'recharge.create',{amount_fen:amountFen,policy_version:policyVersion,agreement_version:agreementVersion},signal));
  if(operation.kind!=='recharge'||operation.state!=='RESERVED')throw new WalletCommandError('RESULT_UNKNOWN');return operation;
}
export interface WalletPaymentSession { readonly operation: ReturnType<typeof parseWalletOperation>; readonly payment_deadline:string; readonly pay_html:string }
export async function createWalletPaymentSession(uid:string,key:string,operationID:string,signal:AbortSignal):Promise<WalletPaymentSession>{
  walletUUID(key);walletUUID(operationID);const user=await getCurrentAuthUser();const csrf=authHeaders()['X-Rinspace-CSRF'];if(user?.id!==uid||!csrf)throw new WalletCommandError('UNAUTHENTICATED');
  const body=JSON.stringify(createWalletRequest('recharge.payment_session',{}));
  try{const response=await fetch(`${publicEnv.publicBasePath||''}/api/wallet/v1/recharges/${encodeURIComponent(operationID)}/payment-session`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json','Content-Type':'application/json','X-Rinspace-CSRF':csrf,'Idempotency-Key':key},body});const value:unknown=await response.json();if(!response.ok)throw new WalletCommandError(parseWalletProblem(value,response.status).error.code);
    if(response.status!==200||typeof value!=='object'||value===null)throw new WalletCommandError('RESULT_UNKNOWN');const raw=value as Record<string,unknown>;if(Object.keys(raw).sort().join(',')!=='operation,pay_html,payment_deadline'||typeof raw.pay_html!=='string'||raw.pay_html.length===0||raw.pay_html.length>32768||typeof raw.payment_deadline!=='string'||Number.isNaN(Date.parse(raw.payment_deadline)))throw new WalletCommandError('RESULT_UNKNOWN');const operation=parseWalletOperation(raw.operation);if(operation.operation_id!==operationID||operation.kind!=='recharge'||operation.state!=='PAYABLE'||!raw.pay_html.includes('id="alipay-page-pay"'))throw new WalletCommandError('RESULT_UNKNOWN');return Object.freeze({operation,payment_deadline:raw.payment_deadline,pay_html:raw.pay_html});}
  catch(error:unknown){if(error instanceof WalletCommandError)throw error;throw new WalletCommandError('RESULT_UNKNOWN');}
}
export async function previewWalletConversion(uid: string, key: string, quantity: string, signal: AbortSignal) {
  const preview = parseWalletConversionPreview(await walletCommand(uid, key, 'conversion.preview', { bound_quantity: quantity }, signal));
  if (preview.bound_quantity !== quantity) throw new WalletCommandError('RESULT_UNKNOWN');
  return preview;
}
export async function createWalletConversion(uid: string, key: string, preview: string, signal: AbortSignal) {
  const operation = parseWalletOperation(await walletCommand(uid, key, 'conversion.create', { preview_id: preview }, signal));
  if (operation.kind !== 'conversion' || operation.state !== 'COMPLETED') throw new WalletCommandError('RESULT_UNKNOWN');
  return operation;
}
export async function previewWalletTip(uid: string, key: string, contentType: 'blog' | 'book', postID: string, quantity: string, signal: AbortSignal) {
  const preview = parseWalletTipPreview(await walletCommand(uid, key, 'tip.preview', { content_type: contentType, post_id: postID, quantity }, signal));
  if (preview.quantity !== quantity || preview.content.post_id !== postID || preview.content.content_type !== contentType || preview.recipient.uid === uid) throw new WalletCommandError('RESULT_UNKNOWN');
  return preview;
}
export async function createWalletTip(uid: string, key: string, preview: string, signal: AbortSignal) {
  const operation = parseWalletOperation(await walletCommand(uid, key, 'tip.create', { preview_id: preview }, signal));
  if (operation.kind !== 'tip' || operation.state !== 'COMPLETED') throw new WalletCommandError('RESULT_UNKNOWN');
  return operation;
}
export async function requestWalletRefund(uid:string,key:string,rechargeID:string,amountFen:string,reason:string,policyVersion:string,signal:AbortSignal){
  walletUUID(key);walletUUID(rechargeID);
  const user=await getCurrentAuthUser();const csrf=authHeaders()['X-Rinspace-CSRF'];if(user?.id!==uid||!csrf)throw new WalletCommandError('UNAUTHENTICATED');
  const body=JSON.stringify(createWalletRequest('refund.request',{amount_fen:amountFen,reason,policy_version:policyVersion}));
  try{const response=await fetch(`${publicEnv.publicBasePath||''}/api/wallet/v1/recharges/${encodeURIComponent(rechargeID)}/refunds`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json','Content-Type':'application/json','X-Rinspace-CSRF':csrf,'Idempotency-Key':key},body});const value:unknown=await response.json();if(!response.ok)throw new WalletCommandError(parseWalletProblem(value,response.status).error.code);return parseWalletOperation(value);}
  catch(error:unknown){if(error instanceof WalletCommandError)throw error;throw new WalletCommandError('RESULT_UNKNOWN');}
}
export async function cancelWalletRefund(uid:string,key:string,refundID:string,version:string,reason:string,signal:AbortSignal){
  walletUUID(key);walletUUID(refundID);const user=await getCurrentAuthUser();const csrf=authHeaders()['X-Rinspace-CSRF'];if(user?.id!==uid||!csrf)throw new WalletCommandError('UNAUTHENTICATED');
  const body=JSON.stringify(createWalletRequest('refund.cancel',{expected_version:version,reason}));
  try{const response=await fetch(`${publicEnv.publicBasePath||''}/api/wallet/v1/refunds/${encodeURIComponent(refundID)}/cancel`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json','Content-Type':'application/json','X-Rinspace-CSRF':csrf,'Idempotency-Key':key},body});const value:unknown=await response.json();if(!response.ok)throw new WalletCommandError(parseWalletProblem(value,response.status).error.code);return parseWalletOperation(value);}
  catch(error:unknown){if(error instanceof WalletCommandError)throw error;throw new WalletCommandError('RESULT_UNKNOWN');}
}
export async function appealWalletCase(uid:string,key:string,caseID:string,version:string,reason:string,signal:AbortSignal){
  walletUUID(key);walletUUID(caseID);const user=await getCurrentAuthUser();const csrf=authHeaders()['X-Rinspace-CSRF'];if(user?.id!==uid||!csrf)throw new WalletCommandError('UNAUTHENTICATED');
  const body=JSON.stringify(createWalletRequest('case.appeal',{expected_version:version,reason}));
  try{const response=await fetch(`${publicEnv.publicBasePath||''}/api/wallet/v1/cases/${encodeURIComponent(caseID)}/appeals`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json','Content-Type':'application/json','X-Rinspace-CSRF':csrf,'Idempotency-Key':key},body});const value:unknown=await response.json();if(!response.ok)throw new WalletCommandError(parseWalletProblem(value,response.status).error.code);if(response.status!==200&&response.status!==201)throw new WalletCommandError('RESULT_UNKNOWN');const result=parseWalletAppealResult(value);if(result.case_id!==caseID||BigInt(result.version)<=BigInt(version))throw new WalletCommandError('RESULT_UNKNOWN');return result;}
  catch(error:unknown){if(error instanceof WalletCommandError)throw error;throw new WalletCommandError('RESULT_UNKNOWN');}
}
export const statementTypes = ['all', 'recharge', 'spend', 'received', 'conversion', 'refund'] as const;
export type StatementType = typeof statementTypes[number];
function statementParams(type: StatementType, from: string, to: string, cursor: string, limit = '20') {
  const params = new URLSearchParams({ type, limit });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cursor) params.set('cursor', cursor);
  return params;
}
export async function loadWalletStatements(type: StatementType, from: string, to: string, cursor: string, signal: AbortSignal) {
  const params = statementParams(type, from, to, cursor);
  return parseWalletTransactionPage(await read(`transactions?${params}`, signal));
}
export async function exportWalletStatements(type: StatementType, from: string, to: string, cursor: string, signal: AbortSignal) {
  const params = statementParams(type, from, to, cursor);
  const page = parseWalletTransactionPage(await read(`transactions/export?${params}`, signal));
  const blob = new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' });
  return Object.freeze({ filename: 'rinspace-wallet-transactions.json', blob, page });
}
export async function exportWalletStatementArchive(type: StatementType, from: string, to: string, cursor: string, signal: AbortSignal) {
  const params = statementParams(type, from, to, cursor, '100');
  params.set('pages', '10');
  const archive = parseWalletTransactionArchive(await read(`transactions/archive?${params}`, signal));
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  return Object.freeze({ filename: 'rinspace-wallet-transactions-archive.json', blob, archive });
}
export async function loadWalletOperation(operationID: string, signal: AbortSignal) {
  walletUUID(operationID);
  return parseWalletTransaction(await read(`operations/${encodeURIComponent(operationID)}`, signal));
}
