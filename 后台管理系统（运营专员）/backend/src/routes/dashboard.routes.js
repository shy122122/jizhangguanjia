'use strict';
const express=require('express');const service=require('../services/dashboard.service');const http=require('../utils/http');const{requireAdmin}=require('../middleware/auth');
const router=express.Router();router.get('/dashboard',requireAdmin,async(req,res)=>http.ok(res,await service.overview(req.query.days)));module.exports=router;
