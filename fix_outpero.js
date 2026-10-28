const fs=require('fs');
const p='server/src/services/outperoService.js';
let s=fs.readFileSync(p,'utf8');
const i=s.indexOf('module.exports');
const j=s.indexOf('};',i);
s=s.slice(0,j+2)+'\n';
fs.writeFileSync(p,s);
console.log('done');
