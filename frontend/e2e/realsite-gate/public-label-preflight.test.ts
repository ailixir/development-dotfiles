import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Page} from '@playwright/test';
import {applyHnAmendment,captureHnAmendment,hnAmendmentProblems,resolveHnAmendment} from './public-label-preflight.ts';
import {loadTable} from './common.ts';
import type {HnPublicCapture} from './public-label-preflight.ts';
const capture=():HnPublicCapture=>({url:'https://news.ycombinator.com/show',capturedAt:'2026-10-28T12:00:00Z',storyId:'123',itemUrl:'https://news.ycombinator.com/item?id=123',title:'Show HN: A bounded public story',author:'publicAuthor',comments:'7 comments',commentsGloballyUnique:true,commentsMatchCount:1});
test('first visible story labels remain frozen through copied-title masking',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hn-preflight-')),model={first:capture(),pages:0};
  const metadata={locator:(selector:string)=>selector==='a.hnuser'?{count:async()=>1,innerText:async()=>model.first.author}:{last:()=>({innerText:async()=>model.first.comments})}};
  const row={getAttribute:async()=>model.first.storyId,locator:(selector:string)=>selector==='.titleline > a'?{first:()=>({innerText:async()=>model.first.title})}:metadata};
  const tab={goto:async(url:string)=>assert.equal(url,'https://news.ycombinator.com/show'),close:async()=>undefined,locator:(selector:string)=>selector==='tr.athing:visible'?{first:()=>row}:{evaluateAll:async(fn:(nodes:{textContent:string}[],label:string)=>number,label:string)=>fn([{textContent:model.first.comments}],label)}};
  const page={context:()=>({newPage:async()=>{model.pages+=1;return tab;}})} as unknown as Page;
  try{
    const frozen=await captureHnAmendment(page,'dry-20261028-1',dir);assert.equal(frozen.storyId,'123');assert.equal(frozen.author,'publicAuthor');assert.equal(frozen.replacement[1],'Click the "7 comments" link');assert.ok(!frozen.replacement.slice(1).some((step)=>step.includes(frozen.title)));assert.ok(frozen.replacement[2]?.includes('publicAuthor'));assert.ok(frozen.replacement[2]?.includes('copied title'));
    model.first.title='[withheld]';model.first.comments='8 comments';model.first.author='anotherAuthor';await assert.rejects(()=>captureHnAmendment(page,'dry-20261028-1',dir),/create-once/);assert.equal(model.pages,1);assert.deepEqual(JSON.parse(readFileSync(join(dir,'hn-amendment.json'),'utf8')),frozen);
    // This tests actual preflight immutability. Production withholding/native SAME-node proof is separately required by WI6.
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('HN first-story source and three authorized replacements are exact run/day/association bound',()=>{
  const c=capture(),a=resolveHnAmendment(c,'rg-20261028-1');assert.deepEqual(hnAmendmentProblems(a,a.runId,c.capturedAt),[]);const table=loadTable(),before=table.tests.find((t)=>t.key==='hackernews')!.steps!.slice(0,3);applyHnAmendment(table,a,a.runId,c.capturedAt);assert.deepEqual(table.tests.find((t)=>t.key==='hackernews')!.steps!.slice(0,3),before);assert.ok(hnAmendmentProblems({...a,author:'anotherAuthor'},a.runId,c.capturedAt).length>0);assert.ok(hnAmendmentProblems(a,'rg-20261029-1',c.capturedAt).length>0);assert.ok(hnAmendmentProblems(a,a.runId,'2026-10-29T12:00:00Z').length>0);
});
test('duplicate labels retain the first-story association requirement without an easier story or claimed native support',()=>{
  const c=capture();c.commentsGloballyUnique=false;c.commentsMatchCount=2;const a=resolveHnAmendment(c,'dry-20261028-1');assert.equal(a.storyId,c.storyId);assert.equal(a.replacement[1],'Click the "7 comments" link near "publicAuthor"');assert.ok(!a.replacement[1]!.includes(c.title));assert.match(a.reason,/REQUIRE.*native unique\+SAME/);assert.throws(()=>resolveHnAmendment({...capture(),author:''},'dry-20261028-1'),/invalid/);
});
test('a no-break space in the HN comments label is normalised in the label and in the page-wide match count',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hn-preflight-')),raw='7\u00a0comments';
  const metadata={locator:(selector:string)=>selector==='a.hnuser'?{count:async()=>1,innerText:async()=>'publicAuthor'}:{last:()=>({innerText:async()=>raw})}};
  const row={getAttribute:async()=>'123',locator:(selector:string)=>selector==='.titleline > a'?{first:()=>({innerText:async()=>'Show HN: A bounded public story'})}:metadata};
  const tab={goto:async()=>undefined,close:async()=>undefined,locator:(selector:string)=>selector==='tr.athing:visible'?{first:()=>row}:{evaluateAll:async(fn:(nodes:{textContent:string}[],label:string)=>number,label:string)=>fn([{textContent:raw}],label)}};
  const page={context:()=>({newPage:async()=>tab})} as unknown as Page;
  try{
    const frozen=await captureHnAmendment(page,'dry-20261031-1',dir);
    assert.equal(frozen.comments,'7 comments');assert.equal(frozen.commentsMatchCount,1);assert.equal(frozen.commentsGloballyUnique,true);assert.equal(frozen.replacement[1],'Click the "7 comments" link');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
