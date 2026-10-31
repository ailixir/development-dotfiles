/** Actual HN first-story authoring preflight. Public labels freeze before learning, never after failure. */
import type {Page} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256Hex} from './common.ts';
import type {GateTable} from './common.ts';
import {instant} from './lifecycle.ts';
export const HN_ORIGINAL=['Copy the title of the first story','Click the comments link of the first story','Check that the story title on the page contains the copied title'];
export interface HnPublicCapture {url:'https://news.ycombinator.com/show';capturedAt:string;storyId:string;itemUrl:string;title:string;author:string;comments:string;commentsGloballyUnique:boolean;commentsMatchCount:number}
export interface HnAmendment extends HnPublicCapture {schemaVersion:1;runId:string;sourceCaptureHash:string;original:string[];replacement:string[];reason:string}
const captureBody=(a:HnPublicCapture):HnPublicCapture=>({url:a.url,capturedAt:a.capturedAt,storyId:a.storyId,itemUrl:a.itemUrl,title:a.title,author:a.author,comments:a.comments,commentsGloballyUnique:a.commentsGloballyUnique,commentsMatchCount:a.commentsMatchCount});
const replacements=(a:HnPublicCapture):string[]=>[`Copy the story title ${JSON.stringify(a.title)}`,a.commentsGloballyUnique?`Click the ${JSON.stringify(a.comments)} link`:`Click the ${JSON.stringify(a.comments)} link near ${JSON.stringify(a.author)}`,`Check that the story title near ${JSON.stringify(a.author)} contains the copied title`];
export function resolveHnAmendment(c:HnPublicCapture,runId:string):HnAmendment{
  const a:HnAmendment={schemaVersion:1,runId,...captureBody(c),sourceCaptureHash:sha256Hex(JSON.stringify(captureBody(c))),original:HN_ORIGINAL,replacement:replacements(c),reason:'Authorized first-visible-story HN3 rewrite: unique comments use normal exact label; repeated labels REQUIRE the actual supported public-author association, effect-safe scopeRefs and standard native unique+SAME proof, otherwise the first-story flow fails. Final containsText consumes the same captured binding near public author. Preflight is ground truth only; no private title restoration, direct item navigation, refresh or title composition.'};
  const problems=hnAmendmentProblems(a,runId,c.capturedAt);if(problems.length)throw new Error(problems.join('; '));return a;
}
export function hnAmendmentProblems(a:HnAmendment|undefined,runId:string,startedAt:string):string[]{
  if(a===undefined)return ['missing frozen same-day actual first visible Show story'];
  const reasons:string[]=[];
  if(a.schemaVersion!==1||a.runId!==runId||a.url!=='https://news.ycombinator.com/show'||!/^\d+$/.test(a.storyId)||a.itemUrl!==`https://news.ycombinator.com/item?id=${a.storyId}`||!a.title||a.title.length>256||!a.author||a.author.length>80||!a.comments||a.comments.length>80||!(/^(?:[0-9]+ comments?|discuss)$/.test(a.comments))||!Number.isSafeInteger(a.commentsMatchCount)||a.commentsMatchCount<1||a.commentsGloballyUnique!==(a.commentsMatchCount===1)||a.original.join()!==HN_ORIGINAL.join()||a.replacement.join()!==replacements(a).join())reasons.push('invalid authorized HN3 amendment');
  const captured=instant(a.capturedAt),started=instant(startedAt);if(captured===null||started===null||new Date(captured).toISOString().slice(0,10)!==new Date(started).toISOString().slice(0,10)||Math.abs(captured-started)>12*3600_000)reasons.push('HN source capture is not same-day');
  if(a.sourceCaptureHash!==sha256Hex(JSON.stringify(captureBody(a))))reasons.push('HN frozen capture hash mismatch');return reasons;
}
export async function captureHnAmendment(page:Page,runId:string,directory:string):Promise<HnAmendment>{
  const file=join(directory,'hn-amendment.json'),attempt=join(directory,'hn-preflight.attempt.json');if(existsSync(file)||existsSync(attempt))throw new Error('HN preflight is create-once; never refresh comments/title under a run');
  writeFileSync(attempt,JSON.stringify({runId,url:'https://news.ycombinator.com/show',at:new Date().toISOString()})+'\n',{flag:'wx'});
  const tab=await page.context().newPage();
  try{
    await tab.goto('https://news.ycombinator.com/show',{waitUntil:'domcontentloaded'});
    const row=tab.locator('tr.athing:visible').first(),storyId=await row.getAttribute('id');if(storyId===null||!/^\d+$/.test(storyId))throw new Error('HN first visible source identity missing');
    const title=(await row.locator('.titleline > a').first().innerText()).trim(),metadata=row.locator('xpath=following-sibling::tr[1]'),authorLink=metadata.locator('a.hnuser');
    if(await authorLink.count()!==1)throw new Error('HN first story author association missing');
    const author=(await authorLink.innerText()).trim(),comments=(await metadata.locator(`a[href="item?id=${storyId}"]`).last().innerText()).replace(/\u00a0/g,' ').trim();
    const count=await tab.locator('a:visible').evaluateAll((links,label)=>links.filter((link)=>(link.textContent??'').replace(/\u00a0/g,' ').trim()===label).length,comments);
    const captured:HnPublicCapture={url:'https://news.ycombinator.com/show',capturedAt:new Date().toISOString(),storyId,itemUrl:`https://news.ycombinator.com/item?id=${storyId}`,title,author,comments,commentsGloballyUnique:count===1,commentsMatchCount:count};
    writeFileSync(join(directory,'hn-preflight.json'),JSON.stringify({runId,captured,sourceCaptureHash:sha256Hex(JSON.stringify(captureBody(captured)))})+'\n',{flag:'wx'});
    const a=resolveHnAmendment(captured,runId);
    writeFileSync(file,JSON.stringify(a)+'\n',{flag:'wx'});return a;
  }finally{await tab.close();}
}
export function applyHnAmendment(table:GateTable,a:HnAmendment,runId:string,startedAt:string):void{
  const problems=hnAmendmentProblems(a,runId,startedAt);if(problems.length)throw new Error(problems.join('; '));const test=table.tests.find((t)=>t.key==='hackernews');if(test?.steps===undefined||test.steps.length!==6)throw new Error('HN registered case changed');if(test.steps.slice(3).join()!==HN_ORIGINAL.join()&&test.steps.slice(3).join()!==a.replacement.join())throw new Error('unauthorized HN text change');test.steps.splice(3,3,...a.replacement);
}
