import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const wrangler=resolve(require.resolve('wrangler/package.json'),'../bin/wrangler.js');
const voiceConfig=existsSync(resolve(root,'.env.qwen.local'))?'.env.qwen.local':'.env.kokoro.local';
const files=['.env',voiceConfig,'.env.postgres.local'].map(file=>resolve(root,file)).filter(existsSync);
const values=Object.assign({},...files.map(file=>parseEnv(readFileSync(file,'utf8'))));
if(!values.DATABASE_URL){console.error('Configure o PostgreSQL em .env.postgres.local antes de iniciar.');process.exit(1);}
if(!existsSync(resolve(root,'dist/server/wrangler.json'))){console.error('Execute npm run build antes de iniciar.');process.exit(1);}
const secrets=Object.entries(values).filter(([key,value])=>/KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/.test(key)&&value).map(([,value])=>value);
try{secrets.push(decodeURIComponent(new URL(values.DATABASE_URL).password));}catch{console.error('A conexão PostgreSQL configurada é inválida.');process.exit(1);}
const redact=text=>secrets.filter(Boolean).reduce((safe,secret)=>safe.replaceAll(secret,'[hidden]'),text);
const child=spawn(process.execPath,[wrangler,'dev','--config',resolve(root,'dist/server/wrangler.json'),'--local','--persist-to','.wrangler/test-state','--port','3002','--ip','127.0.0.1',...files.flatMap(file=>['--env-file',file])],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
for(const [stream,output] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
 let pending='';stream.setEncoding('utf8');stream.on('data',chunk=>{pending+=chunk;let index;while((index=pending.indexOf('\n'))>=0){output.write(redact(pending.slice(0,index+1)));pending=pending.slice(index+1);}});stream.on('end',()=>{if(pending)output.write(redact(pending));});
}
child.once('error',()=>{console.error('Não foi possível iniciar a plataforma.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
