// Local UI acceptance using synthetic HTTP fixtures. This is NOT payment,
// production Identity, or full PostgreSQL/browser end-to-end acceptance.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = process.env.RINSPACE_WALLET_BROWSER_BASE || 'http://127.0.0.1:5198/rinspace';
const browser = await chromium.launch({ headless: true });
const summary = {ordinary:{total:'9007199254740993',available:'9007199254740993',reserved:'0',restricted:'0'},bound:{total:'23',available:'23',reserved:'0',restricted:'0'},quota:{date:'2026-09-20',limit_fen:'100000',confirmed_fen:'0',unresolved_fen:'0',remaining_fen:'100000'},policy_version:'1',watermark:'2'};
const operation = (id,state='COMPLETED')=>({operation_id:`12345678-1234-4234-8234-${id}`,kind:'tip',state,version:'1',created_at:'2026-09-19T16:00:00Z'});
const waitUntil = async (predicate, message) => {
 const deadline = Date.now() + 5000;
 while (!predicate()) {
  if (Date.now() > deadline) throw new Error(message);
  await new Promise(resolve => setTimeout(resolve, 50));
 }
};
try {
 for (const locale of ['zh-CN','en']) for (const width of [1440,320]) {
  const context = await browser.newContext({viewport:{width,height:900},locale,colorScheme:width===320?'dark':'light',reducedMotion:'reduce'});
  await context.addInitScript(locale=>{localStorage.setItem('rinspace-language-preference-v1',JSON.stringify({preference:locale}));},locale);
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let unavailable=false;let anonymous=false;let appealRequests=0;const queries=[];const exportQueries=[];const archiveQueries=[];
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   assert.equal(url.hostname,'127.0.0.1');
   if(url.pathname.endsWith('/identity/v1/session')) return route.fulfill({json:anonymous?{status:'anonymous'}:{status:'authenticated',csrfToken:'synthetic-test-only',user:{id:'wallet-browser',username:'wallet-reader'},currentSession:{sid:'synthetic-browser-session',version:1},expiresAt:'2099-01-01T00:00:00Z'}});
   if(url.pathname.includes('/wallet/v1/')) {
    assert.equal(route.request().headers().authorization,undefined);assert.equal(url.searchParams.has('uid'),false);
    if(url.pathname.endsWith('/cases/12345678-1234-4234-8234-123456789abc/appeals')) {
     appealRequests+=1;assert.equal(route.request().method(),'POST');assert.equal(route.request().headers()['x-rinspace-csrf'],'synthetic-test-only');assert.equal(route.request().headers()['x-rinspace-step-up'],undefined);assert.deepEqual(JSON.parse(route.request().postData()||'{}'),{expected_version:'3',reason:locale==='en'?'Please review':'申请复核'});
     return route.fulfill({status:201,json:{case_id:'12345678-1234-4234-8234-123456789abc',appeal_id:'22345678-1234-4234-8234-123456789abc',state:'UNDER_REVIEW',version:'4',created_at:'2026-09-20T08:01:00Z'}});
    }
    assert.equal(route.request().method(),'GET');
    if(unavailable) return route.fulfill({status:503,json:{error:{code:'SERVICE_PAUSED'}}});
    if(url.pathname.endsWith('/summary')) return route.fulfill({json:summary});
    if(url.pathname.endsWith('/cases')) return route.fulfill({json:{items:[{case_id:'12345678-1234-4234-8234-123456789abc',state:'UNDER_REVIEW',version:'3',ordinary_restricted:'7',bound_restricted:'11',created_at:'2026-09-20T08:00:00Z'}]}});
    if(url.pathname.includes('/operations/')) return route.fulfill({json:{sequence:'2',operation:operation('123456789abc'),perspective:'spend',unit:'SG',quantity:'10',content:{content_type:'book',post_id:'1',title:'Synthetic original book'}}});
    if(url.pathname.endsWith('/transactions/archive')) {
     archiveQueries.push(url.search);
     const received=url.searchParams.get('type')==='received';const next=url.searchParams.has('cursor');
     const pageItem={sequence:next?'1':'2',operation:operation(next?'123456789abe':'123456789abc'),perspective:received?'received':'spend',unit:received?'SG_BOUND':'SG',quantity:'10',content:{content_type:'book',post_id:'1',title:next?'Synthetic archive final book':'Synthetic original book'}};
     const page={items:[pageItem],watermark:'2',...(next?{}:{next_cursor:'synthetic_cursor_12345678'})};
     return route.fulfill({headers:{'Content-Disposition':'attachment; filename="rinspace-wallet-transactions-archive.json"','X-Content-Type-Options':'nosniff'},json:{pages:[page],exported_pages:1,exported_items:1,truncated:!next,...(next?{}:{next_cursor:'synthetic_cursor_12345678'}),watermark:'2'}});
    }
    if(url.pathname.endsWith('/transactions/export')) {
     exportQueries.push(url.search);
     const received=url.searchParams.get('type')==='received';const next=url.searchParams.has('cursor');
     return route.fulfill({headers:{'Content-Disposition':'attachment; filename="rinspace-wallet-transactions.json"','X-Content-Type-Options':'nosniff'},json:{items:[{sequence:next?'1':'2',operation:operation(next?'123456789abd':'123456789abc'),perspective:received?'received':'spend',unit:received?'SG_BOUND':'SG',quantity:'10',content:{content_type:'book',post_id:'1',title:next?'Synthetic second book':'Synthetic original book'}}],watermark:'2',...(next?{}:{next_cursor:'synthetic_cursor_12345678'})}});
    }
    queries.push(url.search);
    const received=url.searchParams.get('type')==='received';const next=url.searchParams.has('cursor');
    return route.fulfill({json:{items:[{sequence:next?'1':'2',operation:operation(next?'123456789abd':'123456789abc'),perspective:received?'received':'spend',unit:received?'SG_BOUND':'SG',quantity:'10',content:{content_type:'book',post_id:'1',title:next?'Synthetic second book':'Synthetic original book'}}],watermark:'2',...(next?{}:{next_cursor:'synthetic_cursor_12345678'})}});
   }
   return route.fulfill({json:{data:[],items:[],count:0}});
  });
  await page.goto(`${base}/wallet`);
  try { await page.locator('.wallet-amount').first().waitFor(); } catch (error) { console.error(await page.locator('body').innerText()); console.error(errors); throw error; }assert.equal(await page.locator('.wallet-amount').first().innerText(),'9007199254740993');
  await page.screenshot({path:`/tmp/wallet-overview-${locale}-${width}.png`,fullPage:true});
  const toggle=locale==='en'?'Open wallet navigation':'打开钱包导航';
  const navigationTrigger=page.locator('.wallet-navigation-trigger .rin-animate-sidebar-trigger');
  if(width===320) {
   await navigationTrigger.waitFor();assert.equal(await navigationTrigger.getAttribute('aria-label'),toggle);
   assert.equal(await navigationTrigger.getAttribute('aria-expanded'),'false');
   await navigationTrigger.focus();await page.keyboard.press('Enter');
   assert.equal(await navigationTrigger.getAttribute('aria-expanded'),'true');
   const controlled=await navigationTrigger.getAttribute('aria-controls');assert(controlled);assert(await page.evaluate(id=>Boolean(document.getElementById(id)),controlled));
   await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(await navigationTrigger.getAttribute('aria-expanded'),'false');assert.equal(await navigationTrigger.evaluate(node=>document.activeElement===node),true);
   await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
  }
  const statementLink=width===320?page.getByRole('dialog').locator('a[href$="?view=statements"]'):page.locator('a[href$="?view=statements"]').first();
  await statementLink.click();
  await page.getByText('Synthetic original book',{exact:true}).waitFor();
  await page.screenshot({path:`/tmp/wallet-statements-${locale}-${width}.png`,fullPage:true});
  const exportButton=page.getByRole('button',{name:locale==='en'?'Export':'导出',exact:true});
  await exportButton.click();await page.getByRole('menuitem',{name:locale==='en'?'Download current page':'下载当前页',exact:true}).click();
  await waitUntil(()=>exportQueries.length===1,'wallet statement export did not request the current first page');
  assert(exportQueries[0].includes('type=all'));assert(exportQueries[0].includes('limit=20'));assert.equal(exportQueries[0].includes('cursor='),false);
  await page.getByText(locale==='en'?'Downloaded 1 records.':'已下载 1 条。',{exact:true}).waitFor();
  await exportButton.click();await page.getByRole('menuitem',{name:locale==='en'?'Archive segment':'归档段',exact:true}).click();
  await waitUntil(()=>archiveQueries.length===1,'wallet statement archive did not request the bounded first segment');
  assert(archiveQueries[0].includes('type=all'));assert(archiveQueries[0].includes('limit=100'));assert(archiveQueries[0].includes('pages=10'));assert.equal(archiveQueries[0].includes('cursor='),false);
  await page.getByText(locale==='en'?'Downloaded 1 records.':'已下载 1 条。',{exact:true}).waitFor();
  await exportButton.click();await page.getByRole('menuitem',{name:locale==='en'?'Archive segment':'归档段',exact:true}).click();
  await waitUntil(()=>archiveQueries.length===2,'wallet statement archive did not request the next bounded segment');
  assert(archiveQueries[1].includes('cursor=synthetic_cursor_12345678'));
  await exportButton.click();await page.getByRole('menuitem',{name:locale==='en'?'Archive segment':'归档段',exact:true}).waitFor();
  await page.getByRole('menuitem',{name:locale==='en'?'Bundle':'打包',exact:true}).click();
  await page.getByText(locale==='en'?'Downloaded 2 records.':'已下载 2 条。',{exact:true}).waitFor();
  await page.getByRole('button',{name:locale==='en'?'View receipt':'查看凭证',exact:true}).click();
  await page.getByText(locale==='en'?'Account sequence':'账户流水序号',{exact:true}).waitFor();
  await page.getByRole('button',{name:locale==='en'?'Next':'下一页',exact:true}).click();await page.getByText('Synthetic second book',{exact:true}).waitFor();
  assert(queries.some(q=>q.includes('cursor=synthetic_cursor_12345678')));
  await exportButton.click();await page.getByRole('menuitem',{name:locale==='en'?'Download current page':'下载当前页',exact:true}).click();
  await waitUntil(()=>exportQueries.length===2,'wallet statement export did not request the current cursor page');
  assert(exportQueries[1].includes('cursor=synthetic_cursor_12345678'));
  await page.getByLabel(locale==='en'?'Transaction type':'记录类型',{exact:true}).selectOption('received');await page.getByText('Synthetic original book',{exact:true}).waitFor();
  assert.equal(await page.locator('.wallet-transactions').innerText().then(t=>/CNY|人民币|￥|¥/.test(t)),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(`${base}/wallet?view=appeals`);await page.getByText(locale==='en'?'Under review':'复核中',{exact:true}).waitFor();
  assert.equal(await page.locator('.wallet-cases').innerText().then(t=>/CNY|人民币|￥|¥|alipay|支付宝/i.test(t)),false);
  await page.getByRole('button',{name:locale==='en'?'Appeal':'申诉',exact:true}).click();await page.getByRole('textbox',{name:locale==='en'?'Reason':'申诉理由',exact:true}).fill(locale==='en'?'Please review':'申请复核');await page.getByRole('button',{name:locale==='en'?'Submit appeal':'提交申诉',exact:true}).click();await page.getByText(locale==='en'?'Appeal submitted.':'申诉已提交。',{exact:true}).waitFor();assert.equal(appealRequests,1);
  await page.screenshot({path:`/tmp/wallet-${locale}-${width}.png`,fullPage:true});
  await page.goto(`${base}/wallet?view=statements`);await page.getByText('Synthetic original book',{exact:true}).waitFor();unavailable=true;await page.getByLabel(locale==='en'?'Transaction type':'记录类型',{exact:true}).selectOption('received');await page.getByRole('alert').waitFor();assert.equal(await page.locator('.wallet-transactions').count(),0);
  anonymous=true;await page.reload();await page.getByRole('heading',{name:locale==='en'?'Sign in to continue':'请先登录',exact:true}).waitFor();assert.equal(await page.locator('.wallet-amount').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({locale,width,result:'PASS',checks:['exact balance','keyboard sidebar','focus return','filter','next page','current page export','archive segment export','no CNY tips','no overflow','error not empty','anonymous','no page errors']}));
  await context.close();
 }
} finally { await browser.close(); }
