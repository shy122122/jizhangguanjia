'use strict';

const fs=require('fs');const path=require('path');const express=require('express');
const config=require('./config');const db=require('./db');
const authRoutes=require('./routes/auth.routes');const usersRoutes=require('./routes/users.routes');
const configRoutes=require('./routes/config.routes');const auditRoutes=require('./routes/audit.routes');const dashboardRoutes=require('./routes/dashboard.routes');
const{notFoundHandler,errorHandler}=require('./middleware/errors');

const app=express();app.disable('x-powered-by');app.set('trust proxy',config.trustProxyHops);
app.use((req,res,next)=>{res.set({
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
});next();});
app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{const started=Date.now();res.on('finish',()=>{if(req.path.startsWith('/api/'))console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now()-started}ms)`);});next();});
app.get('/api/health',async(req,res)=>{const info=await db.ping();res.json({ok:true,data:{service:'mingzhang-admin',database:'connected',...info}});});
app.use('/api/admin',authRoutes,dashboardRoutes,usersRoutes,configRoutes,auditRoutes);

if(fs.existsSync(config.frontendDir)){
  app.use(express.static(config.frontendDir,{index:'index.html',etag:true,maxAge:config.env==='production'?'1h':0}));
  app.get(/^(?!\/api\/).*/,(_req,res)=>res.sendFile(path.join(config.frontendDir,'index.html')));
}
app.use(notFoundHandler);app.use(errorHandler);

let server=null;
async function start(){const info=await db.ping();server=app.listen(config.port,'127.0.0.1',()=>{console.log(`[db] MySQL ${info.version} · 后台表 ${info.adminTables} 张`);console.log(`明账运营后台已启动 http://localhost:${config.port}`);});return server;}
async function shutdown(){if(server)await new Promise((resolve)=>server.close(resolve));await db.close();}
if(require.main===module){start().catch((err)=>{console.error('[startup]',err.message);process.exit(1);});process.on('SIGINT',()=>shutdown().then(()=>process.exit(0)));process.on('SIGTERM',()=>shutdown().then(()=>process.exit(0)));}
module.exports={app,start,shutdown};
