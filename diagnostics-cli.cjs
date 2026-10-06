const {buildReport,uploadReport}=require('./core/diagnostics.cjs');
const {MAX_BYTES}=require('./core/diagnostic-schema.cjs');
const path=require('node:path');
async function main(){
  const [mode,root]=process.argv.slice(2);
  if(!['prepare','upload'].includes(mode)||!path.isAbsolute(root||''))throw Error('invalid_request');
  let input='';
  for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>MAX_BYTES)throw Error('invalid_request');}
  const value=JSON.parse(input);
  const result=mode==='prepare'?buildReport({root,product:'obs',version:require('./package.json').version,hours:value.hours,account:value.account,current:value.current}):await uploadReport(value);
  process.stdout.write(JSON.stringify({ok:true,result}));
}
main().catch(error=>{process.stdout.write(JSON.stringify({ok:false,error:['channel_required','rate_limited'].includes(error.message)?error.message:'error'}));process.exitCode=1;});
