'use strict';
const express=require('express');const service=require('../services/audit.service');const http=require('../utils/http');const{requireAdmin,clientIp}=require('../middleware/auth');
const router=express.Router();router.use(requireAdmin);
router.get('/audit',async(req,res)=>{const r=await service.list(req.query);http.ok(res,r.items,r.meta);});
router.get('/audit/export.csv',async(req,res)=>{const csv=await service.exportCsv(req.query,{adminId:req.auth.adminId,adminLabel:req.auth.admin.displayName,ip:clientIp(req)});res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="mingzhang-audit-${Date.now()}.csv"`);res.send(csv);});
router.get('/audit/:id',async(req,res)=>{const row=await service.get(req.params.id);if(!row){const{ApiError}=require('../middleware/errors');throw ApiError.notFound('审计记录不存在','AUDIT_NOT_FOUND');}http.ok(res,row);});
module.exports=router;
