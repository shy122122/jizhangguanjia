'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.resolve(__dirname,'..');const frontend=path.resolve(root,'..','frontend');let passed=0;
function check(name,ok){if(!ok)throw new Error(`静态检查失败：${name}`);passed+=1;console.log(`✓ ${name}`);}
function files(dir,ext){return fs.readdirSync(dir,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?files(path.join(dir,e.name),ext):e.name.endsWith(ext)?[path.join(dir,e.name)]:[]);}
for(const file of files(path.join(root,'src'),'.js').concat(files(path.join(root,'scripts'),'.js')).concat(files(path.join(frontend,'assets'),'.js'))){new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});passed+=1;}
const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8');
for(const href of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m)=>m[1]).filter((x)=>x.startsWith('/assets/'))){check(`资源存在 ${href}`,fs.existsSync(path.join(frontend,href.slice(1))));}
['login-view','app-view','page','main-nav','modal-root','toast-root','login-form','logout-btn','page-title'].forEach((id)=>check(`基础 DOM #${id}`,html.includes(`id="${id}"`)));
const sql=fs.readFileSync(path.join(root,'sql','01_admin_schema.sql'),'utf8');
check('迁移脚本不含 ALTER',!/\bALTER\s+TABLE\b/i.test(sql));check('迁移脚本不含 DROP',!/\bDROP\s+(TABLE|VIEW|DATABASE)\b/i.test(sql));
check('恰好声明 5 张后台表',(sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length===5);
console.log(`静态检查通过：${passed} 项。`);
