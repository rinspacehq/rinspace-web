import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  AnimateCircleAlert, AnimateHistory, AnimateHeartHandshake,
  AnimateLayoutDashboard, AnimateRefresh,
  AnimateSidebar, AnimateSidebarContent, AnimateSidebarHeader, AnimateSidebarInset,
  AnimateSidebarMenu, AnimateSidebarMenuButton, AnimateSidebarMenuItem,
  AnimateSidebarProvider, AnimateSidebarTrigger, Button,
  Menu, MenuContent, MenuItem, MenuTrigger, useAnimateSidebar,
} from 'components/ui';
import { FileDown } from 'lucide-react';
import SiteTopbar from '@/components/SiteTopbarShell';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { requestAuthDialog } from '@/utils/authDialog';
import { appealWalletCase, cancelWalletRefund, createWalletPaymentSession, createWalletRecharge, exportWalletStatementArchive, exportWalletStatements, loadWalletCases, loadWalletOperation, loadWalletPolicy, loadWalletStatements, loadWalletSummary, requestWalletRefund, statementTypes, WalletCommandError, WalletReadError, type StatementType } from '@/features/wallet/api';
import { formatFenAsYuan, parseYuanToFen } from '@/features/wallet/amount';
import { useWalletSession } from '@/features/wallet/useWalletSession';
import type { WalletBalance, WalletCasePage, WalletCaseSummary, WalletSummary } from '@/features/wallet/response';
import type { WalletTransaction, WalletTransactionArchive, WalletTransactionPage } from '@/features/wallet/statementResponse';
import type { WalletPublicPolicy } from '@/features/wallet/publicPolicy';
import WalletConversion from './Conversion';
import TipForm from '@/features/wallet/TipForm';
import './wallet.css';

const views = ['overview', 'recharge', 'statements', 'conversion', 'appeals'] as const;
type View = typeof views[number];
type ReadState<T> = { key: string; status: 'loading' } | { key: string; status: 'error'; error: unknown } | { key: string; status: 'ready'; data: T };
type ArchiveBundleSegment = Readonly<{ cursor: string; archive: WalletTransactionArchive }>;

function WalletTrigger() {
  const { t } = useFeatureTranslation('wallet');
  const { isMobile, collapsed } = useAnimateSidebar();
  const label = t(isMobile ? 'openNavigation' : collapsed ? 'expandNavigation' : 'collapseNavigation');
  return <AnimateSidebarTrigger aria-label={label} title={label} />;
}

function Balance({ name, unit, value, action }: { name: string; unit: 'ordinary' | 'bound'; value: WalletBalance; action?: ReactNode }) {
  const { t } = useFeatureTranslation('wallet');
  return <section className="wallet-balance" data-wallet-unit={unit} aria-label={name}>
    <div className="wallet-balance-heading"><h2>{name}</h2>{action}</div><p className="wallet-amount">{value.available}</p>
    <dl>{(['total', 'reserved', 'restricted'] as const).map(key => <div key={key}><dt>{t(key)}</dt><dd>{value[key]}</dd></div>)}</dl>
  </section>;
}

function ReadFailure({ error, retry }: { error: unknown; retry(): void }) {
  const { t } = useFeatureTranslation('wallet');
  const session = error instanceof WalletReadError && error.kind === 'session';
  return <section role="alert" className="wallet-notice"><h2>{t(session ? 'signInRequired' : 'unavailable')}</h2>
    <p>{t(session ? 'signInHelp' : 'unavailableHelp')}</p>
    <Button onClick={session ? requestAuthDialog : retry}>{t(session ? 'signIn' : 'retry')}</Button>
  </section>;
}

function Overview({ uid }: { uid: string }) {
  const { t } = useFeatureTranslation('wallet');
  const [revision, setRevision] = useState(0);
  const key = `${uid}:${revision}`;
  const [state, setState] = useState<ReadState<WalletSummary>>({ key: '', status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    void loadWalletSummary(controller.signal).then(data => {
      if (active) setState({ key, status: 'ready', data });
    }).catch((error: unknown) => { if (active) setState({ key, status: 'error', error }); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [key]);
  if (state.key !== key || state.status === 'loading') return <p role="status">{t('loading')}</p>;
  if (state.status === 'error') return <ReadFailure error={state.error} retry={() => setRevision(v => v + 1)} />;
  return <section className="wallet-overview">
    <div className="wallet-balances"><Balance name={t('ordinary')} unit="ordinary" value={state.data.ordinary} /><Balance name={t('bound')} unit="bound" value={state.data.bound} action={<Button className="wallet-withdrawal" variant="ghost" disabled>{t('withdrawal')}</Button>} /></div>
  </section>;
}

function submitWalletPayHTML(payHTML:string){const next=window.open('','_self');const target=next?.document||document;target.open();target.write(payHTML);target.close();}

type RechargeAttempt={signature:string;rechargeKey:string;sessionKey:string;operationID?:string;yuan:string;createdAt:number};
const rechargeAttemptStorageKey='rinspace.wallet.recharge-attempt.v1';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validRechargeAttempt(value:unknown):value is RechargeAttempt{
  if(!value||typeof value!=='object')return false;const item=value as Record<string,unknown>;
  return typeof item.signature==='string'&&item.signature.length<=256&&uuidPattern.test(String(item.rechargeKey||''))&&uuidPattern.test(String(item.sessionKey||''))&&
    (item.operationID===undefined||uuidPattern.test(String(item.operationID)))&&typeof item.yuan==='string'&&/^\d{1,7}(?:\.\d{1,2})?$/.test(item.yuan)&&
    typeof item.createdAt==='number'&&Number.isSafeInteger(item.createdAt)&&item.createdAt<=Date.now()+300000&&item.createdAt>=Date.now()-86400000;
}
function loadRechargeAttempt(uid:string):RechargeAttempt|null{try{const raw=sessionStorage.getItem(rechargeAttemptStorageKey);if(!raw)return null;const stored=JSON.parse(raw) as {uid?:unknown;attempt?:unknown};if(stored.uid!==uid||!validRechargeAttempt(stored.attempt)){sessionStorage.removeItem(rechargeAttemptStorageKey);return null}return stored.attempt;}catch{try{sessionStorage.removeItem(rechargeAttemptStorageKey);}catch{return null}return null}}
function saveRechargeAttempt(uid:string,attempt:RechargeAttempt){try{sessionStorage.setItem(rechargeAttemptStorageKey,JSON.stringify({uid,attempt}));}catch{/* A denied/full store keeps the in-memory idempotency boundary. */}}

function Recharge({uid,returnedOperation}:{uid:string;returnedOperation:string}) {
  const { t } = useFeatureTranslation('wallet');
  const [revision,setRevision]=useState(0);const key=`${uid}:${revision}`;
  const [state,setState]=useState<ReadState<{policy:WalletPublicPolicy;summary:WalletSummary}>>({key:'',status:'loading'});
  const restored=useRef(loadRechargeAttempt(uid));
  const [yuan,setYuan]=useState(restored.current?.yuan||'');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const attempt=useRef<RechargeAttempt|null>(restored.current);
  useEffect(()=>{const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),15000);let active=true;void Promise.all([loadWalletPolicy(controller.signal),loadWalletSummary(controller.signal)]).then(([policy,summary])=>{if(active)setState({key,status:'ready',data:{policy,summary}})}).catch((error:unknown)=>{if(active)setState({key,status:'error',error})});return()=>{active=false;clearTimeout(timeout);controller.abort()};},[key]);
  const ready=state.key===key&&state.status==='ready'?state.data:null;
  const submit=async()=>{if(!ready||busy)return;setNotice('');let fen:bigint;try{fen=parseYuanToFen(yuan);const minimum=BigInt(ready.policy.recharge.minimum_fen||'0'),step=BigInt(ready.policy.recharge.step_fen||'0'),remaining=BigInt(ready.summary.quota.remaining_fen);if(!ready.policy.recharge.enabled||fen<minimum||step<=0n||(fen-minimum)%step!==0n||fen>remaining)throw new Error();}catch{setNotice(t('rechargeInvalid'));return}const agreement=ready.policy.recharge.agreement_version;if(!agreement){setNotice(t('rechargeFailed'));return}const signature=JSON.stringify([fen.toString(),ready.policy.policy_version,agreement]);if(attempt.current?.signature!==signature)attempt.current={signature,rechargeKey:crypto.randomUUID(),sessionKey:crypto.randomUUID(),yuan,createdAt:Date.now()};saveRechargeAttempt(uid,attempt.current);setBusy(true);const controller=new AbortController();try{const operation=attempt.current.operationID?{operation_id:attempt.current.operationID}:await createWalletRecharge(uid,attempt.current.rechargeKey,fen.toString(),ready.policy.policy_version,agreement,controller.signal);attempt.current.operationID=operation.operation_id;saveRechargeAttempt(uid,attempt.current);const payment=await createWalletPaymentSession(uid,attempt.current.sessionKey,operation.operation_id,controller.signal);setNotice(t('rechargeRedirect'));submitWalletPayHTML(payment.pay_html);}catch(error:unknown){setNotice(t(error instanceof WalletCommandError&&error.code==='RESULT_UNKNOWN'?'rechargeUnknown':'rechargeFailed'));}finally{setBusy(false)}};
  return <section className="wallet-recharge-stage">
    {state.key!==key||state.status==='loading'?<section className="wallet-notice"><p role="status">{t('loading')}</p></section>:state.status==='error'?<ReadFailure error={state.error} retry={()=>setRevision(value=>value+1)}/>:!ready?.policy.recharge.enabled?<section className="wallet-notice"><h2>{t('notOpen')}</h2><p>{t('rechargeUnavailableHelp')}</p><Button disabled>{t('views.recharge')}</Button></section>:<section className="wallet-notice wallet-recharge-form"><h2>{t('rechargeTitle')}</h2>
      {returnedOperation?<div className="wallet-return-notice" role="status"><strong>{t('rechargeReturnTitle')}</strong><p>{t('rechargeReturnHelp')}</p><Link to="/wallet?view=statements">{t('views.statements')}</Link></div>:null}
      <label>{t('rechargeAmount')}<span className="wallet-money-input"><b>¥</b><input inputMode="decimal" autoComplete="off" value={yuan} onChange={event=>setYuan(event.target.value)} disabled={busy}/></span></label>
      <p>{t('rechargeDailyRemaining',{amount:formatFenAsYuan(BigInt(ready.summary.quota.remaining_fen))})}</p><p>{t('rechargeAgreement')}</p>
      <Button onClick={()=>void submit()} disabled={busy||!yuan}>{busy?t('rechargeSubmitting'):t('rechargeSubmit')}</Button>{notice?<p role="status">{notice}</p>:null}
    </section>}
  </section>;
}

function RefundRequest({uid,operationID,maximumFen,onSubmitted}:{uid:string;operationID:string;maximumFen:string;onSubmitted():void}){
  const {t}=useFeatureTranslation('wallet');const [open,setOpen]=useState(false);const [yuan,setYuan]=useState(formatFenAsYuan(BigInt(maximumFen)));const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const attempt=useRef<{signature:string;key:string}|null>(null);
  const submit=async()=>{setNotice('');let fen:bigint;try{fen=parseYuanToFen(yuan);if(fen<=0n||fen>BigInt(maximumFen)||fen%10n!==0n)throw new Error();}catch{setNotice(t('refundInvalid'));return}setBusy(true);const controller=new AbortController();
    try{const policy=await loadWalletPolicy(controller.signal);const signature=JSON.stringify([operationID,fen.toString(),reason,policy.policy_version]);if(attempt.current?.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};const result=await requestWalletRefund(uid,attempt.current.key,operationID,fen.toString(),reason,policy.policy_version,controller.signal);setNotice(t('refundRequested',{state:t(`states.${result.state}`)}));setOpen(false);attempt.current=null;onSubmitted();}
    catch(error:unknown){setNotice(t(error instanceof WalletCommandError&&error.code==='RESULT_UNKNOWN'?'refundUnknown':'refundFailed'));}finally{setBusy(false)}
  };
  return <div className="wallet-refund-request"><Button onClick={()=>setOpen(value=>!value)} disabled={busy}>{t('refundRequest')}</Button>{open?<div className="wallet-refund-form"><label>{t('refundAmount')}<input inputMode="decimal" value={yuan} onChange={event=>setYuan(event.target.value)}/></label><label>{t('refundReason')}<input value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label><Button onClick={()=>void submit()} disabled={busy||!reason.trim()}>{t('refundSubmit')}</Button></div>:null}{notice?<p role="status">{notice}</p>:null}</div>;
}

function Receipt({operationID}:{operationID:string}) {
  const {t}=useFeatureTranslation('wallet');
  const [open,setOpen]=useState(false);
  const [state,setState]=useState<ReadState<WalletTransaction>|null>(null);
  const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
  const toggle=(value:string)=>{const nextOpen=value==='receipt';setOpen(nextOpen);if(!nextOpen||state)return;controller.current=new AbortController();const key=operationID;setState({key,status:'loading'});void loadWalletOperation(operationID,controller.current.signal).then(data=>setState({key,status:'ready',data})).catch((error:unknown)=>setState({key,status:'error',error}));};
  const receipt=state?.status==='ready'?state.data:null;
  return <Accordion className="wallet-receipt" type="single" collapsible value={open?'receipt':''} onValueChange={toggle}><AccordionItem value="receipt"><AccordionTrigger>{t(open?'receiptClose':'receiptOpen')}</AccordionTrigger><AccordionContent><div className="wallet-receipt-body">
    {state?.status==='loading'?<p role="status">{t('loading')}</p>:state?.status==='error'?<p role="alert">{t('receiptFailed')}</p>:receipt?<dl>
      <div><dt>{t('reference')}</dt><dd><code>{receipt.operation.operation_id}</code></dd></div><div><dt>{t('receiptSequence')}</dt><dd>{receipt.sequence}</dd></div><div><dt>{t('receiptState')}</dt><dd>{t(`states.${receipt.operation.state}`)}</dd></div><div><dt>{t('receiptQuantity')}</dt><dd>{receipt.quantity}</dd></div>
      {'original_operation_id'in receipt?<div><dt>{t('original')}</dt><dd><code>{receipt.original_operation_id}</code></dd></div>:null}{'content'in receipt?<div><dt>{t('receiptContent')}</dt><dd>{receipt.content.title}</dd></div>:null}
    </dl>:null}
  </div></AccordionContent></AccordionItem></Accordion>;
}

function RefundCancel({uid,operationID,version}:{uid:string;operationID:string;version:string}) {
  const {t}=useFeatureTranslation('wallet');const [open,setOpen]=useState(false);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const attempt=useRef<{signature:string;key:string}|null>(null);
  const submit=async()=>{if(!reason.trim()||busy)return;setBusy(true);setNotice('');const signature=JSON.stringify([operationID,version,reason]);if(attempt.current?.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    try{const result=await cancelWalletRefund(uid,attempt.current.key,operationID,version,reason,new AbortController().signal);setNotice(t('refundCancelled',{state:t(`states.${result.state}`)}));setOpen(false);attempt.current=null;}
    catch(error:unknown){setNotice(t(error instanceof WalletCommandError&&error.code==='RESULT_UNKNOWN'?'refundCancelUnknown':'refundCancelFailed'));}finally{setBusy(false);}
  };
  return <div className="wallet-refund-request"><Button onClick={()=>setOpen(value=>!value)} disabled={busy}>{t('refundCancel')}</Button>{open?<div className="wallet-refund-form"><label>{t('refundCancelReason')}<input value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label><Button onClick={()=>void submit()} disabled={busy||!reason.trim()}>{t('refundCancelSubmit')}</Button></div>:null}{notice?<p role="status">{notice}</p>:null}</div>;
}

function Statements({ uid }: { uid: string }) {
  const { t, i18n } = useFeatureTranslation('wallet');
  const [type, setType] = useState<StatementType>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursors, setCursors] = useState<string[]>(['']);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ReadState<WalletTransactionPage>>({ key: '', status: 'loading' });
  const [exporting, setExporting] = useState<'page' | 'archive' | ''>('');
  const [exportNotice, setExportNotice] = useState('');
  const archiveCursor = useRef('');
  const [archiveSegments, setArchiveSegments] = useState<ArchiveBundleSegment[]>([]);
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify([uid, type, from, to, cursor, revision]);
  const invalidRange = Boolean(from && to && from > to);
  useEffect(() => {
    if (invalidRange) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    void loadWalletStatements(type, from, to, cursor, controller.signal).then(data => {
      if (active) setState({ key, status: 'ready', data });
    }).catch((error: unknown) => { if (active) setState({ key, status: 'error', error }); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [key, type, from, to, cursor, invalidRange]);
  const ready = state.key === key && state.status === 'ready' ? state.data : null;
  const clearArchive = () => { archiveCursor.current = ''; setArchiveSegments([]); setExportNotice(''); };
  const reset = () => { setCursors(['']); clearArchive(); setRevision(v => v + 1); };
  const saveDownload = (filename: string, blob: Blob) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };
  const downloadCurrentPage = async () => {
    if (invalidRange || !ready || exporting) return;
    setExportNotice('');
    setExporting('page');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const result = await exportWalletStatements(type, from, to, cursor, controller.signal);
      saveDownload(result.filename, result.blob);
      setExportNotice(t('exportReady', { count: result.page.items.length }));
    } catch {
      setExportNotice(t('exportFailed'));
    } finally {
      clearTimeout(timeout);
      setExporting('');
    }
  };
  const downloadArchiveSegment = async () => {
    if (invalidRange || !ready || exporting) return;
    setExportNotice('');
    setExporting('archive');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const segmentCursor = archiveCursor.current || cursor;
      const result = await exportWalletStatementArchive(type, from, to, segmentCursor, controller.signal);
      saveDownload(result.filename, result.blob);
      setArchiveSegments(values => [...values, { cursor: segmentCursor, archive: result.archive }]);
      archiveCursor.current = result.archive.truncated ? result.archive.next_cursor || '' : '';
      setExportNotice(t('exportReady', { count: result.archive.exported_items }));
    } catch {
      setExportNotice(t('exportFailed'));
    } finally {
      clearTimeout(timeout);
      setExporting('');
    }
  };
  const downloadArchiveBundle = () => {
    if (exporting || archiveSegments.length === 0) return;
    const exported_items = archiveSegments.reduce((count, segment) => count + segment.archive.exported_items, 0);
    const bundle = Object.freeze({
      kind: 'rinspace.wallet.transactions_archive_bundle.v1',
      filters: Object.freeze({ type, from, to, start_cursor: cursor }),
      created_at: new Date().toISOString(),
      exported_segments: archiveSegments.length,
      exported_items,
      segments: archiveSegments.map((segment, index) => Object.freeze({ index: index + 1, cursor: segment.cursor, archive: segment.archive })),
    });
    saveDownload('rinspace-wallet-transactions-archive-bundle.json', new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    setExportNotice(t('exportReady', { count: exported_items }));
  };
  return <>
    <div className="wallet-statement-toolbar">
      <div className="wallet-filters">
      <label>{t('filter')}<select aria-label={t('filter')} value={type} onChange={e => { const value = statementTypes.find(item => item === e.target.value); if (value) { setType(value); setCursors(['']); clearArchive(); } }}>{statementTypes.map(value => <option key={value} value={value}>{t(`types.${value}`)}</option>)}</select></label>
      <label>{t('from')}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setCursors(['']); clearArchive(); }} /></label>
      <label>{t('to')}<input type="date" value={to} onChange={e => { setTo(e.target.value); setCursors(['']); clearArchive(); }} /></label>
      </div>
      <Menu><MenuTrigger asChild><Button className="wallet-export-trigger" disabled={!ready || invalidRange}><FileDown size={16} aria-hidden="true" />{exporting ? t('exporting') : t('export')}</Button></MenuTrigger>
        <MenuContent align="end" aria-label={t('export')}>
          <MenuItem onSelect={() => void downloadCurrentPage()} disabled={!ready || invalidRange || Boolean(exporting)}>{t('exportCurrentPage')}</MenuItem>
          <MenuItem onSelect={() => void downloadArchiveSegment()} disabled={!ready || invalidRange || Boolean(exporting)}>{t('exportArchiveSegment')}</MenuItem>
          <MenuItem onSelect={downloadArchiveBundle} disabled={archiveSegments.length === 0 || Boolean(exporting)}>{t('exportArchiveBundle')}</MenuItem>
        </MenuContent>
      </Menu>
    </div>
    {exportNotice ? <p role="status" className="wallet-export-status">{exportNotice}</p> : null}
    {invalidRange ? <p role="alert">{t('invalidRange')}</p> : state.key !== key || state.status === 'loading' ? <p role="status">{t('loading')}</p> : state.status === 'error' ? <ReadFailure error={state.error} retry={reset} /> : null}
    {ready && !invalidRange && <>
      {ready.items.length === 0 ? <p role="status" className="wallet-notice">{t('empty')}</p> : <ol className="wallet-transactions">{ready.items.map(item => <li key={item.operation.operation_id} data-perspective={item.perspective}>
        <div className="wallet-transaction-copy"><div className="wallet-transaction-meta"><span>{t(`types.${item.perspective}`)}</span><span className="wallet-state">{t(`states.${item.operation.state}`)}</span></div><h3>{'content' in item ? item.content.title : t(`types.${item.perspective}`)}</h3>
          <time dateTime={item.operation.created_at}>{new Intl.DateTimeFormat(i18n.resolvedLanguage || 'zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(item.operation.created_at))}</time>
          <Receipt operationID={item.operation.operation_id}/>
        </div>
        <div className="wallet-transaction-value"><strong><span aria-hidden="true">{item.perspective === 'recharge' || item.perspective === 'received' ? '+' : '−'}</span>{item.quantity} <small>{t(item.unit === 'SG' ? 'ordinary' : 'bound')}</small></strong>
          {item.perspective === 'conversion' && <span>→ {item.received_quantity} {t('ordinary')}</span>}
          {item.perspective==='recharge'&&item.operation.state==='CREDIT_POSTED'&&BigInt(item.refundable_fen)>0n?<RefundRequest uid={uid} operationID={item.operation.operation_id} maximumFen={item.refundable_fen} onSubmitted={reset}/>:null}
          {item.perspective==='refund'&&item.operation.state==='REQUESTED_RESERVED'?<RefundCancel uid={uid} operationID={item.operation.operation_id} version={item.operation.version}/>:null}
        </div>
      </li>)}</ol>}
      <nav className="wallet-pagination" aria-label={t('pagination')}><Button disabled={cursors.length === 1} onClick={() => { clearArchive(); setCursors(values => values.slice(0, -1)); }}>{t('previous')}</Button>
        <Button disabled={!ready.next_cursor} onClick={() => { const next = ready.next_cursor; if (next) { clearArchive(); setCursors(values => [...values, next]); } }}>{t('next')}</Button></nav>
    </>}
  </>;
}

function CaseAppeal({uid,item,onUpdated}:{uid:string;item:WalletCaseSummary;onUpdated():void}) {
  const {t}=useFeatureTranslation('wallet');const [open,setOpen]=useState(false);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const attempt=useRef<{signature:string;key:string}|null>(null);
  const submit=async()=>{if(!reason.trim()||busy)return;setBusy(true);setNotice('');const signature=JSON.stringify([item.case_id,item.version,reason]);if(attempt.current?.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    try{await appealWalletCase(uid,attempt.current.key,item.case_id,item.version,reason,new AbortController().signal);attempt.current=null;setOpen(false);setReason('');onUpdated();}
    catch(error:unknown){setNotice(t(error instanceof WalletCommandError&&error.code==='RESULT_UNKNOWN'?'appealUnknown':'appealFailed'));}finally{setBusy(false)}
  };
  return <div className="wallet-appeal-action"><Button onClick={()=>setOpen(value=>!value)} disabled={busy}>{t('appeal')}</Button>{open?<div className="wallet-appeal-form"><label>{t('appealReason')}<input value={reason} maxLength={1000} onChange={event=>{setReason(event.target.value);setNotice('')}}/></label><Button onClick={()=>void submit()} disabled={busy||!reason.trim()}>{t('appealSubmit')}</Button></div>:null}{notice?<p role="status">{notice}</p>:null}</div>;
}

function Appeals({uid}:{uid:string}) {
  const {t,i18n}=useFeatureTranslation('wallet');const [revision,setRevision]=useState(0);const [notice,setNotice]=useState('');const key=`${uid}:${revision}`;const [state,setState]=useState<ReadState<WalletCasePage>>({key:'',status:'loading'});
  useEffect(()=>{const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),15000);let active=true;void loadWalletCases(controller.signal).then(data=>{if(active)setState({key,status:'ready',data})}).catch((error:unknown)=>{if(active)setState({key,status:'error',error})});return()=>{active=false;clearTimeout(timeout);controller.abort()};},[key]);
  if(state.key!==key||state.status==='loading')return <p role="status">{t('loading')}</p>;if(state.status==='error')return <ReadFailure error={state.error} retry={()=>setRevision(value=>value+1)}/>;
  if(!state.data.items.length)return <p role="status" className="wallet-notice">{t('appealEmpty')}</p>;
  return <>{notice?<p role="status" className="wallet-notice">{notice}</p>:null}<ol className="wallet-cases">{state.data.items.map(item=><li key={item.case_id}><div><span className="wallet-state">{t(`caseStates.${item.state}`)}</span><time dateTime={item.created_at}>{new Intl.DateTimeFormat(i18n.resolvedLanguage||'zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(item.created_at))}</time><code>{item.case_id}</code></div><dl><div><dt>{t('ordinary')}</dt><dd>{item.ordinary_restricted}</dd></div><div><dt>{t('bound')}</dt><dd>{item.bound_restricted}</dd></div></dl><CaseAppeal uid={uid} item={item} onUpdated={()=>{setNotice(t('appealSubmitted'));setRevision(value=>value+1)}}/></li>)}</ol></>;
}

export default function WalletPage() {
  const { t, ready } = useFeatureTranslation('wallet');
  const { session, retry } = useWalletSession();
  const [params] = useSearchParams();
  const view: View = views.find(value => value === params.get('view')) || 'overview';
  const icons = [AnimateLayoutDashboard, AnimateHeartHandshake, AnimateHistory, AnimateRefresh, AnimateCircleAlert];
  return <><Helmet title={t('title')} /><SiteTopbar /><div className="wallet-workspace">
    {!ready ? <p role="status">…</p> : <AnimateSidebarProvider navigationName={t('title')} storageKey="rinspace-wallet-sidebar-open">
      <AnimateSidebar label={t('navigation')} description={t('navigation')}><AnimateSidebarHeader><span className="wallet-sidebar-mark" aria-hidden="true">SG</span><div><h2>{t('title')}</h2></div></AnimateSidebarHeader>
        <AnimateSidebarContent><AnimateSidebarMenu>{views.map((value, index) => { const Icon = icons[index]; return <AnimateSidebarMenuItem key={value}><AnimateSidebarMenuButton asChild isActive={view === value} title={t(`views.${value}`)}><Link to={value === 'overview' ? '/wallet' : `/wallet?view=${value}`}><Icon size={18} aria-hidden="true" /><span>{t(`views.${value}`)}</span></Link></AnimateSidebarMenuButton></AnimateSidebarMenuItem>; })}</AnimateSidebarMenu></AnimateSidebarContent>
      </AnimateSidebar>
      <AnimateSidebarInset><div className="wallet-navigation-trigger"><WalletTrigger /></div><h1 className="rin-visually-hidden">{t(`views.${view}`)}</h1>
        {session.status === 'loading' ? <p role="status">{t('loading')}</p> : session.status === 'anonymous' ? <ReadFailure error={new WalletReadError('session')} retry={retry} /> : session.status === 'error' ? <ReadFailure error={null} retry={retry} /> : <div key={session.uid}>
          {view === 'overview' ? <Overview uid={session.uid} /> : view === 'statements' ? <Statements uid={session.uid} /> : view === 'conversion' ? <WalletConversion uid={session.uid} /> : view === 'appeals' ? <Appeals uid={session.uid}/> : <Recharge uid={session.uid} returnedOperation={params.get('operation')||''} />}
          <TipForm uid={session.uid} />
        </div>}
      </AnimateSidebarInset>
    </AnimateSidebarProvider>}
  </div></>;
}
