import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const wrangler=resolve(require.resolve('wrangler/package.json'),'../bin/wrangler.js');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--voice=openai')){console.error('Use npm start ou npm run start:openai.');process.exit(1);}
const openaiSelected=args.includes('--voice=openai')||existsSync(resolve(root,'.env.openai.local'));
const voiceConfig=openaiSelected?'.env.openai.local':existsSync(resolve(root,'.env.qwen.local'))?'.env.qwen.local':'.env.kokoro.local';
if(openaiSelected&&!existsSync(resolve(root,voiceConfig))){console.error('Crie apps/plataforma/.env.openai.local com TTS_PROVIDER=openai, OPENAI_API_KEY e OPENAI_TTS_VOICE=marin.');process.exit(1);}
const files=['.env',voiceConfig,'.env.postgres.local'].map(file=>resolve(root,file)).filter(existsSync);
const values=Object.assign({},...files.map(file=>parseEnv(readFileSync(file,'utf8'))));
if(openaiSelected&&(values.TTS_PROVIDER?.trim().toLowerCase()!=='openai'||!values.OPENAI_API_KEY?.trim())){
 console.error('Preencha OPENAI_API_KEY e TTS_PROVIDER=openai em apps/plataforma/.env.openai.local. Sua chave não será exibida.');process.exit(1);
}
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
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 if(stopping||child.exitCode!==null||child.signalCode!==null)return;
 stopping=true;
 if(process.platform!=='win32'){child.kill();return;}
 // Stop only the Wrangler tree created by this launcher, including its workerd child.
 const taskkill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 taskkill.once('error',()=>child.kill());
});
