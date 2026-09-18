import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['--test','tests/api-security.test.mjs'],{cwd:root,env:{...process.env,LETRIA_TEST_DATABASE:'postgres'},stdio:'inherit',windowsHide:true});
child.once('error',()=>{console.error('Não foi possível iniciar os testes PostgreSQL.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
