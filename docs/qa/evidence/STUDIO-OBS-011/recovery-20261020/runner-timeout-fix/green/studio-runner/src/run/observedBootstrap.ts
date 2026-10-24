/** Exact page identity through the sequential bootstrap; no Playwright or wire capability. */
export class BootstrapPageGuard<T> {
  private phase:'startup'|'empty'|'creating'|'app'='startup';
  private startup:T|undefined;private app:T|undefined;private pending=new Set<T>();
  private violated=false;private listener:(()=>void)|undefined;
  constructor(private readonly closeUnexpected:(page:T)=>void){}
  inspectStartup(pages:readonly T[]):T{if(pages.length!==1){this.fail();throw new Error('TARGET_DRIFT');}this.startup=pages[0];this.check();return pages[0] as T;}
  opened(page:T):void{
    if(this.phase==='startup'&&page===this.startup||this.phase==='app'&&page===this.app)return;
    if(this.phase==='creating'){this.pending.add(page);if(this.pending.size>1)this.fail();return;}
    this.fail();this.closeUnexpected(page);
  }
  check():void{if(this.violated)throw new Error('TARGET_DRIFT');}
  startupRemoved(pages:readonly T[]):void{this.check();if(this.phase!=='startup'||pages.length!==0){this.fail();throw new Error('TARGET_DRIFT');}this.startup=undefined;this.phase='empty';}
  beginApp():void{this.check();if(this.phase!=='empty')throw new Error('TARGET_DRIFT');this.phase='creating';}
  appReturned(page:T,pages:readonly T[]):void{this.check();if(this.phase!=='creating'||this.pending.size!==1||!this.pending.has(page)||pages.length!==1||pages[0]!==page){this.fail();throw new Error('TARGET_DRIFT');}this.pending.clear();this.app=page;this.phase='app';}
  ready(page:T,pages:readonly T[]):boolean{return !this.violated&&this.phase==='app'&&this.app===page&&pages.length===1&&pages[0]===page;}
  subscribe(listener:()=>void):void{this.listener=listener;if(this.violated)listener();}
  private fail():void{this.violated=true;for(const page of this.pending)this.closeUnexpected(page);this.listener?.();}
}
// Private identity metadata: no Error property, subtype or wire change.
const absoluteStartupTimeouts = new WeakMap<Error, number>();
function absoluteStartupTimeout(error: Error, deadline: number): Error {
  absoluteStartupTimeouts.set(error, deadline);
  return error;
}
export function isAbsoluteStartupTimeout(error: unknown, deadline: number): boolean {
  return error instanceof Error && absoluteStartupTimeouts.get(error) === deadline;
}

export function boundedStartup<T>(work: () => Promise<T>, deadline: number, signal?: AbortSignal, maxMs = 30000): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  if (Date.now() >= deadline) return Promise.reject(absoluteStartupTimeout(new Error('TIMEOUT'), deadline));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(new Error('CANCELLED')); };
    // Capture the existing delay-selection wall sample once.
    const remaining = deadline - Date.now();
    const timer = setTimeout(() => {
      const error = new Error('TIMEOUT');
      // A strictly earlier operation cap is not whole-start expiry; equality selects both boundaries.
      reject(remaining <= maxMs ? absoluteStartupTimeout(error, deadline) : error);
    }, Math.max(1, Math.min(maxMs, remaining)));
    signal?.addEventListener('abort', abort, { once: true });
    const clear = (): void => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    Promise.resolve().then(work).then(value => {
      clear();
      if (signal?.aborted) reject(new Error('CANCELLED'));
      else if (Date.now() >= deadline) reject(absoluteStartupTimeout(new Error('TIMEOUT'), deadline));
      else resolve(value);
    }, (error: unknown) => {
      clear();
      reject(error instanceof Error ? error : new Error('BOOTSTRAP_FAILED'));
    });
  });
}
