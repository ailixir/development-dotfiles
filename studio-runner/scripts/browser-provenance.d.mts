export interface BrowserProvenance {channel:'chromium';headless:true;chromiumSandbox:true;args:readonly never[];platform:string;arch:string;revision:string;executableRelativePath:string;executableSha256:string}
export function browserExecutableRelativePath(platform?:string,arch?:string):string;
export function fileSha256(path:string):string;
export function envBrowserRoot(env:Readonly<Record<string,string|undefined>>):string;
export function readBrowserProvenance(root:string|undefined,revision:string|null|undefined,platform?:string,arch?:string):BrowserProvenance;
