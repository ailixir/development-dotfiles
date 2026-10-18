import fs from 'node:fs';
const p=process.argv[2]; let polls=0,bad=0; const end=Date.now()+Number(process.argv[3]);
while(Date.now()<end){ try{JSON.parse(fs.readFileSync(p,'utf8'));}catch{bad++;} polls++; await new Promise(r=>setTimeout(r,20)); }
console.log(JSON.stringify({polls,bad}));
