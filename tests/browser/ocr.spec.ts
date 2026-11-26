import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import path from 'node:path';
declare global {interface Window {ocrAcceptance:{done:number[];starts:number[];cancelled:string[];generation:number};}}
async function fixture(page:Page){
 await page.route(/\/src\/main\.tsx(?:\?|$)/,async route=>{const response=await route.fetch();await route.fulfill({response,body:`
 import {createServices as ocrServices} from '/src/services/index.ts';
 const service=ocrServices(),h=window.ocrAcceptance={done:[],starts:[],cancelled:[],generation:0};service.capabilities.ocr=true;service.capabilities.nativeText=true;
 const hash='a'.repeat(64),profile={fingerprint:hash,modelHash:hash,modelTier:'Small',backend:'Cpu',engineVersion:'fixture',preprocessing:'fixture'};
 const pageInfo=page=>({page,pageBox:[0,0,595.08,842.04],width:595.08,height:842.04,rotate:0,userUnit:1});
 const g=(text,x,id)=>({id,text,quad:[x,700,x+10,700,x+10,715,x,715],baseline:[x,700,x+10,700],source:'ocr'});
 service.text.getNative=async(docId,page)=>({docId,jobId:crypto.randomUUID(),contentRevision:hash,pageGeneration:0,status:'unreliable',pageInfo:pageInfo(page),glyphs:[],profileFingerprint:hash,hasImages:true});
 const tickets=new Map(),glyphs=new Map();
 service.ocr.start=async r=>{h.starts.push(r.page);const handle=(await import('/src/state/appStore.ts')).appStore.getState().tabs.find(t=>t.docId===r.docId);const t={docId:r.docId,jobId:crypto.randomUUID(),subscriptionId:crypto.randomUUID(),page:r.page,contentRevision:handle.docHash,pageGeneration:++h.generation,profile,needsRaster:false};tickets.set(t.jobId,r.raster);glyphs.set(t.jobId,[g('assistant',50,crypto.randomUUID())]);return t;};
 service.ocr.status=async t=>({...t,phase:h.cancelled.includes(t.subscriptionId)?'cancelled':h.done.includes(t.page)?'completed':'running',nativeRunning:!h.done.includes(t.page),completedPages:h.done.includes(t.page)?1:0,totalPages:1});
 service.ocr.result=async t=>({docId:t.docId,jobId:t.jobId,contentRevision:t.contentRevision,pageGeneration:t.pageGeneration,profile,raster:tickets.get(t.jobId),lines:t.page===3?[]:[{text:'assistant',glyphs:glyphs.get(t.jobId)}],empty:t.page===3,device:'固定测试样本',fallback:false,cached:true,elapsedMs:1});
 service.ocr.unsubscribe=async t=>{h.cancelled.push(t.subscriptionId);};
 `+await response.text()});});
 await page.goto('/');await page.getByTestId('file-input').setInputFiles(path.resolve('docs/fixtures/generated/ocr-reading.pdf'));await expect(page.locator('[data-page="1"] canvas[data-rendered]')).toBeVisible();await page.getByRole('button',{name:'适合整页',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.ocrAcceptance.starts.includes(1))).toBe(true);
}
test('OCR completion incrementally refreshes search coverage; explicit whole document work reaches empty page once',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'查找',exact:true}).click();await page.getByPlaceholder('在文档中查找...').fill('assistant');await expect(page.getByTestId('search-coverage')).toContainText('已搜索 0/3');
 await page.evaluate(()=>window.ocrAcceptance.done.push(1));await expect(page.getByTestId('search-coverage')).toContainText('已搜索 1/3');await expect(page.getByText('1 / 1',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'识别全文',exact:true}).click();await page.evaluate(()=>window.ocrAcceptance.done.push(2,3));await expect(page.getByTestId('search-coverage')).toContainText('已搜索 3/3');await expect(page.getByTestId('ocr-coverage')).toContainText('文字就绪 3/3');await expect(page.getByText('1 / 2',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'识别全文',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.ocrAcceptance.starts.filter(p=>p===3).length)).toBe(1);
});
test('cancel updates immediately and late OCR never fills the cancelled selection model; retry is explicit',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'取消识别等待',exact:true}).click();await expect(page.getByText('已取消等待',{exact:true})).toBeVisible({timeout:100});await page.evaluate(()=>window.ocrAcceptance.done.push(1));
 await page.getByRole('button',{name:'查找',exact:true}).click();await page.getByPlaceholder('在文档中查找...').fill('assistant');await expect(page.getByTestId('search-coverage')).toContainText('已搜索 0/3');
 await page.getByRole('button',{name:'重新识别本页',exact:true}).click();await expect(page.getByTestId('search-coverage')).toContainText('已搜索 1/3');expect(await page.evaluate(()=>window.ocrAcceptance.generation)).toBeGreaterThan(1);
});
test('closing during OCR discards late completion and reopens a fresh usable reader',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await page.getByTitle('关闭标签页 (Ctrl+W)').click();await expect(page.locator('[data-reader]')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.ocrAcceptance.cancelled.length)).toBeGreaterThan(0);await page.evaluate(()=>window.ocrAcceptance.done.push(1));await page.waitForTimeout(250);await expect(page.locator('[data-reader]')).toHaveCount(0);await page.getByRole('button',{name:'ocr-reading.pdf',exact:true}).click();await expect(page.getByLabel('文字识别控制')).toContainText('文字来源：OCR');expect(errors).toEqual([]);
});
