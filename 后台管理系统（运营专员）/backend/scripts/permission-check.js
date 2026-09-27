'use strict';
const path=require('path');const mysql=require('mysql2/promise');require('dotenv').config({path:path.resolve(__dirname,'..','.env'),quiet:true});
async function main(){const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.MIGRATION_DB_USER,password:process.env.MIGRATION_DB_PASSWORD,database:process.env.DB_NAME});try{const user=process.env.ADMIN_DB_USER||'mz_admin';const[rows]=await c.query(`SHOW GRANTS FOR \`${user}\`@\`localhost\``);const grants=rows.map((x)=>Object.values(x)[0]).join('\n');
  if(/\b(CREATE|ALTER|DROP|TRIGGER|REFERENCES)\b/i.test(grants))throw new Error('运行账号含有禁止的 DDL/结构权限');
  for(const table of ['transaction','budget','budget_category','account','category','ledger','import_batch']){const write=new RegExp(`(INSERT|UPDATE|DELETE)[^\\n]*\\.${table}\\b`,'i');if(write.test(grants))throw new Error(`运行账号不应拥有 ${table} 写权限`);}
  console.log('数据库权限检查通过：无 DDL 权限，用户财务事实表均为只读。');
}finally{await c.end();}}
main().catch((err)=>{console.error(err.message);process.exit(1);});
