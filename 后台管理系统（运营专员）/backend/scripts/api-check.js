'use strict';
const{app}=require('../src/server');const db=require('../src/db');const jwt=require('jsonwebtoken');const config=require('../src/config');
let passed=0;function check(name,ok,detail){if(!ok)throw new Error(`${name}：${JSON.stringify(detail)}`);passed+=1;console.log(`✓ ${name}`);}
async function main(){const server=await new Promise((resolve)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}`;let token='';
async function req(method,path,body,useToken=true){const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(useToken&&token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});let json=null;try{json=await res.json();}catch{}return{res,json};}
try{
  let r=await req('GET','/api/health',null,false);check('健康检查',r.res.status===200&&r.json?.ok===true,r.json);
  r=await req('GET','/api/admin/dashboard',null,false);check('未登录拒绝',r.res.status===401&&r.json?.ok===false,r.json);
  const wrongScope=jwt.sign({scope:'user',ver:1},config.jwt.secret,{subject:'1',expiresIn:'5m'});r=await fetch(base+'/api/admin/dashboard',{headers:{Authorization:`Bearer ${wrongScope}`}});check('错误 scope 拒绝',r.status===401,r.status);
  r=await req('POST','/api/admin/auth/login',{username:process.env.ADMIN_SEED_USERNAME||'operator',password:process.env.ADMIN_SEED_PASSWORD},false);check('后台登录',r.res.status===200&&r.json?.data?.token,r.json);token=r.json.data.token;
  r=await req('GET','/api/admin/auth/me');check('读取后台身份',r.res.status===200&&r.json?.data?.admin?.username,r.json);
  r=await req('GET','/api/admin/dashboard?days=30');check('数据看板',r.res.status===200&&Number.isInteger(r.json?.data?.totals?.users),r.json);
  const trend=r.json?.data?.registrationTrend||[];
  const today=await db.queryValue("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d')");
  const continuous=trend.every((item,index)=>index===0||Date.parse(item.date)-Date.parse(trend[index-1].date)===86400000);
  check('近 30 日趋势连续补零',trend.length===30&&trend.at(-1)?.date===today&&continuous&&trend.every((item)=>Number.isInteger(item.count)&&item.count>=0),trend);
  const recentUsers=Number(await db.queryValue('SELECT COUNT(*) FROM user WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)'));
  check('近 30 日趋势合计与用户表一致',trend.reduce((sum,item)=>sum+item.count,0)===recentUsers,{trend,recentUsers});
  r=await req('GET','/api/admin/users?page=1&pageSize=20');check('用户分页列表',r.res.status===200&&Array.isArray(r.json?.data)&&r.json?.meta?.total>=1,r.json);const user=r.json.data[0];
  check('列表联系方式已脱敏',!(/13800001234|demo@mingzhang\.app/.test(JSON.stringify(user))),user);
  r=await req('GET',`/api/admin/users/${user.id}`);check('用户详情不含密码与 token',r.res.status===200&&!/password_hash|"token"/i.test(JSON.stringify(r.json?.data)),r.json?.data);
  for(const tab of ['accounts','categories','budgets','transactions','imports']){r=await req('GET',`/api/admin/users/${user.id}/data/${tab}?page=1&pageSize=20`);check(`只读数据 ${tab}`,r.res.status===200&&Array.isArray(r.json?.data),r.json);}
  r=await req('GET','/api/admin/config/rules');check('关键词规则列表',r.res.status===200&&Array.isArray(r.json?.data),r.json);
  const categories=await req('GET','/api/admin/config/rule-categories');const categoryId=categories.json?.data?.[0]?.id;check('规则目标分类',categories.res.status===200&&categoryId,categories.json);
  const keyword=`自检-${Date.now()}`;
  r=await req('POST','/api/admin/config/rules',{keyword,categoryId,matchType:'contains',priority:41,reason:'自动化自检创建规则'});check('创建规则并审计',r.res.status===201&&r.json?.data?.keyword===keyword,r.json);const ruleId=r.json.data.id;
  r=await req('PUT',`/api/admin/config/rules/${ruleId}`,{priority:42,isEnabled:false,reason:'自动化自检停用规则'});check('编辑并停用规则',r.res.status===200&&r.json?.data?.isEnabled===false,r.json);
  r=await req('DELETE',`/api/admin/config/rules/${ruleId}`,{reason:'自动化自检删除规则'});check('删除规则并审计',r.res.status===200&&r.json?.data?.deleted===true,r.json);
  r=await req('POST','/api/admin/config/rules/preview',{text:'美团买药'});check('规则优先级预览',r.res.status===200&&'matched'in r.json.data,r.json);
  r=await req('GET','/api/admin/config/templates');check('分类与账户模板',r.res.status===200&&r.json?.data?.categories?.length>=2&&r.json?.data?.accounts?.length>=1,r.json);
  const templateName=`自检分类${Date.now()}`;
  r=await req('POST','/api/admin/config/templates/categories',{name:templateName,type:'expense',icon:'science',color:'#14B8A6',sortOrder:99,isEnabled:true,reason:'自动化自检创建模板'});check('创建分类模板',r.res.status===201&&r.json?.data?.name===templateName,r.json);const templateId=r.json.data.id;
  r=await req('DELETE',`/api/admin/config/templates/categories/${templateId}`,{reason:'自动化自检清理模板'});check('删除分类模板',r.res.status===200&&r.json?.data?.deleted===true,r.json);
  r=await req('GET','/api/admin/audit?page=1&pageSize=20');check('审计日志',r.res.status===200&&Array.isArray(r.json?.data),r.json);
  console.log(`\nAPI 自检通过：${passed} 项。`);
}finally{await new Promise((resolve)=>server.close(resolve));await db.close();}}
main().catch((err)=>{console.error(err);process.exit(1);});
