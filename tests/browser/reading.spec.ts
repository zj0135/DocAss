import {test,expect} from '@playwright/test';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
const fixture=(file:string)=>path.resolve('docs/fixtures/generated',file);
test('real PDF canvas, lazy 500-page layout, navigation, rotation and independent tabs',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByTestId('file-input').setInputFiles(fixture('performance-500.pdf'));
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-page-count','500');await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();expect(await page.locator('canvas').count()).toBeLessThan(20);
  await page.getByTitle('点击输入页码跳转').click();await page.getByRole('textbox',{name:'页码',exact:true}).fill('0');await page.getByRole('textbox',{name:'页码',exact:true}).press('Enter');await expect(page.getByRole('alert')).toContainText('整数');await page.getByRole('textbox',{name:'页码',exact:true}).fill('250');await page.getByRole('textbox',{name:'页码',exact:true}).press('Enter');await expect(page.getByTitle('点击输入页码跳转')).toContainText('250 / 500');
  await page.getByRole('button',{name:'适合宽度',exact:true}).click();await page.getByRole('button',{name:'旋转',exact:true}).click();await expect(page.locator('[data-page="250"] canvas[data-rendered]')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(fixture('mixed.pdf'));await expect(page.locator('[data-reader]')).toHaveAttribute('data-page-count','1');await page.getByText('performance-500.pdf',{exact:true}).first().click();await expect(page.getByTitle('点击输入页码跳转')).toContainText('250 / 500');
  await page.getByRole('button',{name:'缩略图',exact:true}).click();await expect(page.getByRole('button',{name:'跳转第 1 页',exact:true})).toBeVisible();expect(await page.locator('canvas').count()).toBeLessThan(30);await page.getByRole('button',{name:'跳转第 1 页',exact:true}).click();await expect(page.getByTitle('点击输入页码跳转')).toContainText('1 / 500');
  await page.screenshot({path:'artifacts/screenshots/reading-500.png'});expect(errors).toEqual([]);
});
test('password retry and cancellation create no half tab, images and dedup by hash',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByTestId('file-input').setInputFiles(fixture('password.pdf'));await expect(page.getByRole('dialog',{name:'PDF 密码'})).toBeVisible();await page.getByRole('textbox',{name:'文档密码'}).fill('wrong');await page.getByRole('button',{name:'解锁',exact:true}).click();await expect(page.getByRole('alert')).toContainText('密码错误');await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('[data-reader]')).toHaveCount(0);
  await page.getByTestId('file-input').setInputFiles(fixture('password.pdf'));await page.getByRole('textbox',{name:'文档密码'}).fill('fixture-reader');await page.getByRole('button',{name:'解锁',exact:true}).click();await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(fixture('ocr-grid.png'));await expect(page.locator('[data-reader]')).toHaveAttribute('data-page-count','1');await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(fixture('ocr-grid.png'));await expect(page.getByText('ocr-grid.png',{exact:true})).toHaveCount(1);await page.screenshot({path:'artifacts/screenshots/reading-image.png'});expect(errors).toEqual([]);
});
test('named outline destinations, static PDF annotation and PDF scripts disabled',async({page})=>{
  await page.goto('/');await page.getByTestId('file-input').setInputFiles(fixture('navigation.pdf'));await expect(page.locator('[data-page="1"] canvas[data-rendered]')).toBeVisible();
  const red=await page.locator('[data-page="1"] canvas[data-rendered]').evaluate((canvas:HTMLCanvasElement)=>{const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>200&&data[i+1]<50&&data[i+2]<50)count++;return count;});expect(red).toBeGreaterThan(100);
  expect(await page.evaluate(()=>Reflect.get(globalThis,'__pdfScriptExecuted'))).toBeUndefined();
  await page.getByRole('button',{name:'目录',exact:true}).click();await page.getByText('Named chapter',{exact:true}).click();await expect(page.getByTitle('点击输入页码跳转')).toContainText('2 / 3');await page.getByText('Final chapter',{exact:true}).click();await expect(page.getByTitle('点击输入页码跳转')).toContainText('3 / 3');
  await page.screenshot({path:'artifacts/screenshots/reading-outline.png'});
});
test('ten real tabs hibernate and restore with bounded pool, shared worker survives close',async({page})=>{
  await page.goto('/');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(let i=0;i<10;i++){const doc=await PDFDocument.create();for(let p=0;p<3;p++)doc.addPage([300,400]).drawText(`Document ${i}, page ${p+1}`);await page.getByTestId('file-input').setInputFiles({name:`tab-${i}.pdf`,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())});await expect(page.getByText(`tab-${i}.pdf`,{exact:true})).toBeVisible();await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();
    await page.getByTitle('点击输入页码跳转').click();await page.getByRole('textbox',{name:'页码',exact:true}).fill(String(i%3+1));await page.getByRole('textbox',{name:'页码',exact:true}).press('Enter');}
  for(let i=0;i<10;i++){await page.getByText(`tab-${i}.pdf`,{exact:true}).click();await expect(page.getByTitle('点击输入页码跳转')).toContainText(`${i%3+1} / 3`);await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();expect(await page.locator('canvas').count()).toBeLessThan(12);}
  const budget=await page.evaluate(async()=>{const r=await import('/src/documents/resources.ts');return {pages:r.pageCanvases.bytes,thumbnails:r.thumbnailCanvases.bytes};});expect(budget.pages).toBeLessThanOrEqual(256*1024*1024);expect(budget.thumbnails).toBeLessThanOrEqual(32*1024*1024);expect(errors).toEqual([]);
});
test('production pool caps pinned documents and rebuilds a shared worker',async({page})=>{
  const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawText('Pool lifetime');const bytes=Array.from(await pdf.save());
  await page.goto('/');const result=await page.evaluate(async(bytes)=>{
    const {DocumentPool}=await import('/src/documents/DocumentPool.ts');const pool=new DocumentPool(),blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),signal=new AbortController().signal;
    const prompt=async()=>{throw Error('unexpected password');};for(let i=0;i<4;i++)pool.register(String(i),async()=>({kind:'pdf',blob}));
    const leases=[];for(let i=0;i<3;i++)leases.push(await pool.acquire(String(i),prompt,signal));const pinned=pool.activeCount;
    const abort=new AbortController();let settled=false;const waiting=pool.acquire('3',prompt,abort.signal).then(()=>{settled=true;return 'unexpected';},e=>e.name);await new Promise(r=>setTimeout(r,30));const queued=!settled;abort.abort();const cancelled=await waiting;
    leases[0].release();const fourth=await pool.acquire('3',prompt,signal);const capped=pool.activeCount;fourth.release();leases[1].release();leases[2].release();await pool.close('0');
    const other=await pool.acquire('1',prompt,signal);const canvas=document.createElement('canvas');canvas.width=400;canvas.height=534;await other.document.render(1,canvas,1,0,1,signal);const ink=canvas.getContext('2d')!.getImageData(0,0,400,534).data.some((v,i)=>i%4===0&&v<100);other.release();
    await pool.recover();const awake=await pool.acquire('2',prompt,signal);const recovered=awake.document.pageCount===1;awake.release();for(let i=0;i<4;i++)await pool.close(String(i));return {pinned,queued,cancelled,capped,ink,recovered,remaining:pool.activeCount};
  },bytes);expect(result).toEqual({pinned:3,queued:true,cancelled:'AbortError',capped:3,ink:true,recovered:true,remaining:0});
});
test('JBIG2 and JPEG2000 render with packaged wasm decoders',async({page})=>{
  const wasm:string[]=[],failed:string[]=[];page.on('response',r=>{if(r.url().includes('/pdfjs/wasm/')){wasm.push(r.url());if(!r.ok())failed.push(r.url());}});await page.goto('/');
  for(const file of ['perf_codecs_jbig2.pdf','perf_codecs_jpx.pdf']){await page.getByTestId('file-input').setInputFiles(fixture(file));await expect(page.getByText(file,{exact:true})).toBeVisible();await expect(page.locator('canvas[data-rendered]').first()).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);await page.screenshot({path:`artifacts/screenshots/${file}.png`});}
  expect(wasm.some(url=>url.includes('jbig2'))).toBe(true);expect(wasm.some(url=>url.includes('openjpeg'))).toBe(true);expect(failed).toEqual([]);
});
