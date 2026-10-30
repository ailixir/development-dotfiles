import {lstatSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256Hex} from './common.ts';
// Exact sanitized key + randomUUID() filename emitted by driver.watchLearning; one known level only.
const TIMING_JOURNAL = /^[A-Za-z0-9_-]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jsonl$/;
/** Binds a scan to the exact counted records, rather than a freely retagged clean summary. */
export function scanEvidenceDigest(directory:string,nextday:boolean):string {
  const entries:{path:string;sha256:string}[]=[];
  for(const name of [...(nextday?['results','nextday']:['results']),...(lstatSync(join(directory,'diagnostics'),{throwIfNoEntry:false})!==undefined?['diagnostics']:[])]){
    const dir=join(directory,name),directoryStat=lstatSync(dir,{throwIfNoEntry:false});
    if(directoryStat===undefined){entries.push({path:name,sha256:'MISSING'});continue;}
    if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())throw new Error('SCAN_IDENTITY_ARTIFACT_REJECTED');
    for(const filename of readdirSync(dir).sort()){
      const path=join(dir,filename),st=lstatSync(path);
      if(name==='diagnostics'&&filename==='learning-timing'){
        if(!st.isDirectory()||st.isSymbolicLink())throw new Error('SCAN_IDENTITY_ARTIFACT_REJECTED');
        for(const journal of readdirSync(path).sort()){
          const journalPath=join(path,journal),journalStat=lstatSync(journalPath);
          if(!journalStat.isFile()||journalStat.isSymbolicLink()||!TIMING_JOURNAL.test(journal))throw new Error('SCAN_IDENTITY_ARTIFACT_REJECTED');
          entries.push({path:`diagnostics/learning-timing/${journal}`,sha256:sha256Hex(readFileSync(journalPath))});
        }
        continue;
      }
      if(!st.isFile()||st.isSymbolicLink()||!filename.endsWith('.json'))throw new Error('SCAN_IDENTITY_ARTIFACT_REJECTED');
      entries.push({path:`${name}/${filename}`,sha256:sha256Hex(readFileSync(path))});
    }
  }
  return sha256Hex(JSON.stringify(entries));
}
