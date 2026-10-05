import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authHeaders, getCurrentAuthUser } from '@/services/phoneAuth';
import { appealWalletCase, loadWalletCases } from './wallet';

vi.mock('@/services/phoneAuth',()=>({authHeaders:vi.fn(),getCurrentAuthUser:vi.fn()}));
const caseID='12345678-1234-4234-8234-123456789abc';
beforeEach(()=>{vi.mocked(getCurrentAuthUser).mockResolvedValue({id:'user-a'});vi.mocked(authHeaders).mockReturnValue({'X-Rinspace-CSRF':'csrf',Authorization:'never-forward'});});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

it('reads minimized cases with cookie credentials only',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[{case_id:caseID,state:'OPEN',version:'1',ordinary_restricted:'0',bound_restricted:'0',created_at:'2026-09-20T08:00:00Z'}]}),{status:200}));vi.stubGlobal('fetch',fetcher);
  await expect(loadWalletCases(new AbortController().signal)).resolves.toMatchObject({items:[{case_id:caseID}]});
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/wallet/v1/cases'),expect.objectContaining({credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}));
});

it('submits an exact versioned appeal without step-up or money fields',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({case_id:caseID,appeal_id:'22345678-1234-4234-8234-123456789abc',state:'UNDER_REVIEW',version:'4',created_at:'2026-09-20T08:01:00Z'}),{status:201}));vi.stubGlobal('fetch',fetcher);
  await appealWalletCase('user-a','32345678-1234-4234-8234-123456789abc',caseID,'3','申请复核',new AbortController().signal);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/api/wallet/v1/cases/${caseID}/appeals`),expect.objectContaining({method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json','X-Rinspace-CSRF':'csrf','Idempotency-Key':'32345678-1234-4234-8234-123456789abc'},body:JSON.stringify({expected_version:'3',reason:'申请复核'})}));
  expect(fetcher.mock.calls[0]?.[1]?.body).not.toMatch(/amount|uid|channel|step/i);
});
