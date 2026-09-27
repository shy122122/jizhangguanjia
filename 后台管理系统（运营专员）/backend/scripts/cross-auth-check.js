'use strict';
const{app}=require('../src/server');const db=require('../src/db');const auth=require('../src/auth');
async function main(){const server=await new Promise((resolve)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const adminBase=`http://127.0.0.1:${server.address().port}`;try{
  const cLogin=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'demo@mingzhang.app',password:'Demo123456'})});
  if(!cLogin.ok)throw new Error('C 端未运行或演示账号不可用，请先启动 localhost:3000');const cJson=await cLogin.json();
  const intoAdmin=await fetch(adminBase+'/api/admin/dashboard',{headers:{Authorization:`Bearer ${cJson.data.token}`}});if(intoAdmin.status!==401)throw new Error(`C 端 token 调后台未被拒绝：${intoAdmin.status}`);
  const adminRow=await db.queryOne('SELECT id,token_version FROM admin_user WHERE status=1 ORDER BY id LIMIT 1');const adminToken=auth.signToken(adminRow.id,adminRow.token_version);
  const intoClient=await fetch('http://127.0.0.1:3000/api/auth/me',{headers:{Authorization:`Bearer ${adminToken}`}});if(intoClient.status!==401)throw new Error(`后台 token 调 C 端未被拒绝：${intoClient.status}`);
  console.log('双向 token 隔离通过：C → 后台 401，后台 → C 401。');
}finally{await new Promise((resolve)=>server.close(resolve));await db.close();}}
main().catch((err)=>{console.error(err.message);process.exit(1);});
