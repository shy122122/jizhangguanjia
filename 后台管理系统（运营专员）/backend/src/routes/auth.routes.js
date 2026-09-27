'use strict';
const express=require('express');const service=require('../services/auth.service');const http=require('../utils/http');const{requireAdmin,clientIp}=require('../middleware/auth');
const router=express.Router();
router.post('/auth/login',async(req,res)=>http.ok(res,await service.login(req.body||{},clientIp(req))));
router.get('/auth/me',requireAdmin,async(req,res)=>http.ok(res,{admin:req.auth.admin}));
router.post('/auth/logout',requireAdmin,async(req,res)=>http.ok(res,await service.logout(req.auth,clientIp(req))));
module.exports=router;
