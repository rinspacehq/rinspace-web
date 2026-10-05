import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportWalletStatementArchive, exportWalletStatements, loadWalletStatements, loadWalletSummary, loadWalletTipperCount, WalletReadError } from './api';
afterEach(()=>vi.unstubAllGlobals());
describe('wallet read transport',()=>{
 it('uses only managed cookies, no-store, scoped routes and lossless validators',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],watermark:'9007199254740993'}),{status:200}));vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();const value=await loadWalletStatements('received','2026-09-20','','',controller.signal);
  expect(value.watermark).toBe('9007199254740993');expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('transactions?type=received&limit=20&from=2026-09-20'),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
 });
 it('exports only the bounded current statement page after validating the DTO',async()=>{
  const response={items:[],watermark:'4'};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{status:200}));vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();const result=await exportWalletStatements('refund','','2026-09-30','cursor-token',controller.signal);
  expect(result.filename).toBe('rinspace-wallet-transactions.json');expect(result.page).toEqual(response);expect(result.blob.type).toBe('application/json');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('transactions/export?type=refund&limit=20&to=2026-09-30&cursor=cursor-token'),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
 });
 it('exports a bounded statement archive segment through the archive endpoint',async()=>{
  const response={pages:[{items:[],watermark:'4'}],exported_pages:1,exported_items:0,truncated:false,watermark:'4'};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{status:200}));vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();const result=await exportWalletStatementArchive('all','2026-09-01','','',controller.signal);
  expect(result.filename).toBe('rinspace-wallet-transactions-archive.json');expect(result.archive).toEqual(response);expect(result.blob.type).toBe('application/json');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('transactions/archive?type=all&limit=100&from=2026-09-01&pages=10'),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
 });
 it('does not accept missing financial data or leak backend errors',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
  await expect(loadWalletSummary(new AbortController().signal)).rejects.toThrow();
  fetcher.mockResolvedValue(new Response('SQL private credentials',{status:503}));await expect(loadWalletSummary(new AbortController().signal)).rejects.toEqual(new WalletReadError('unavailable'));
  fetcher.mockResolvedValue(new Response('{}',{status:401}));await expect(loadWalletSummary(new AbortController().signal)).rejects.toEqual(new WalletReadError('session'));
 });
 it('reads only the public aggregate tipper count for a numeric content id',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{"count":12}',{status:200}));vi.stubGlobal('fetch',fetcher);
  const signal=new AbortController().signal;
  await expect(loadWalletTipperCount('book','42',signal)).resolves.toBe(12);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('tips/count?content_type=book&post_id=42'),{credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json'}});
  fetcher.mockResolvedValue(new Response('{"count":-1}',{status:200}));
  await expect(loadWalletTipperCount('book','42',signal)).rejects.toEqual(new WalletReadError('unavailable'));
  await expect(loadWalletTipperCount('blog','slug',signal)).rejects.toEqual(new WalletReadError('invalid'));
 });
});
