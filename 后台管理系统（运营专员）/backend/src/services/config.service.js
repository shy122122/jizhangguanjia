'use strict';

const db = require('../db');
const audit = require('./audit.service');
const validate = require('../utils/validate');
const money = require('../utils/money');
const { ApiError } = require('../middleware/errors');

function actor(ctx, ip) { return { adminId:ctx.adminId,adminLabel:ctx.admin.displayName||ctx.admin.username,ip }; }
function mapRule(r) {
  return { id:Number(r.id),keyword:r.keyword,matchType:r.match_type,priority:Number(r.priority),isEnabled:Number(r.priority)>-100000,
    isSystem:!!r.is_system,categoryId:Number(r.category_id),categoryName:r.category_name,categoryType:r.category_type,
    icon:r.icon,color:r.color,createdAt:r.created_at };
}
async function ruleRow(id) {
  const r=await db.queryOne(`SELECT r.*,c.name AS category_name,c.type AS category_type,c.icon,c.color
    FROM category_rule r JOIN category c ON c.id=r.category_id WHERE r.id=? AND r.ledger_id IS NULL`,[Number(id)]);
  if(!r) throw ApiError.notFound('全局规则不存在','RULE_NOT_FOUND'); return r;
}
async function listRules(query={}) {
  const where=['r.ledger_id IS NULL']; const p=[];
  if(query.q){where.push('r.keyword LIKE ?');p.push(`%${query.q}%`);}
  if(query.category){where.push('c.name=?');p.push(String(query.category));}
  const rows=await db.query(`SELECT r.*,c.name AS category_name,c.type AS category_type,c.icon,c.color
    FROM category_rule r JOIN category c ON c.id=r.category_id WHERE ${where.join(' AND ')}
    ORDER BY c.type,c.sort_order,r.priority DESC,r.id`,p);
  return rows.map(mapRule);
}
async function ruleCategories(){
  const rows=await db.query(`SELECT MIN(c.id) AS id,c.name,c.type,MAX(c.icon) AS icon,MAX(c.color) AS color
    FROM category c WHERE c.is_system=1 AND c.is_archived=0 GROUP BY c.name,c.type ORDER BY c.type,MIN(c.sort_order)`);
  return rows.map((r)=>({id:Number(r.id),name:r.name,type:r.type,icon:r.icon,color:r.color}));
}
async function createRule(body,ctx,ip){
  const reason=validate.reason(body.reason); const keyword=validate.keyword(body.keyword);
  const matchType=validate.oneOf(body.matchType,'匹配方式',['contains','equals','regex']);
  const priority=validate.int(body.priority,'优先级',{min:0,max:999});
  const category=await db.queryOne('SELECT id,name,type FROM category WHERE id=? AND is_archived=0',[Number(body.categoryId)]);
  if(!category) throw ApiError.badRequest('目标分类不存在','INVALID_CATEGORY');
  if(await db.queryOne('SELECT id FROM category_rule WHERE ledger_id IS NULL AND keyword=?',[keyword])){
    throw ApiError.conflict('全局规则中已存在相同关键词','RULE_KEYWORD_TAKEN');
  }
  let insertId;
  await db.transaction(async(conn)=>{
    const [result]=await conn.query(`INSERT INTO category_rule (ledger_id,category_id,keyword,match_type,priority,is_system)
      VALUES (NULL,?,?,?,?,0)`,[category.id,keyword,matchType,priority]); insertId=Number(result.insertId);
    await audit.append({...actor(ctx,ip),action:'rule.create',targetType:'category_rule',targetId:insertId,
      targetLabel:`${keyword} → ${category.name}`,reason,after:{keyword,matchType,priority,categoryId:Number(category.id)}},conn);
  });
  return mapRule(await ruleRow(insertId));
}
async function updateRule(id,body,ctx,ip){
  const reason=validate.reason(body.reason); const before=await ruleRow(id);
  const keyword=body.keyword==null?before.keyword:validate.keyword(body.keyword);
  const matchType=body.matchType==null?before.match_type:validate.oneOf(body.matchType,'匹配方式',['contains','equals','regex']);
  let priority=body.priority==null?Number(before.priority):validate.int(body.priority,'优先级',{min:0,max:999});
  if(body.isEnabled===false) priority=-100000-Math.max(0,priority);
  if(body.isEnabled===true && Number(before.priority)<=-100000) priority=body.priority==null?10:priority;
  const categoryId=body.categoryId==null?Number(before.category_id):Number(body.categoryId);
  const category=await db.queryOne('SELECT id,name FROM category WHERE id=? AND is_archived=0',[categoryId]);
  if(!category) throw ApiError.badRequest('目标分类不存在','INVALID_CATEGORY');
  if(await db.queryOne('SELECT id FROM category_rule WHERE ledger_id IS NULL AND keyword=? AND id<>?',[keyword,id])){
    throw ApiError.conflict('全局规则中已存在相同关键词','RULE_KEYWORD_TAKEN');
  }
  await db.transaction(async(conn)=>{
    await conn.query('UPDATE category_rule SET category_id=?,keyword=?,match_type=?,priority=? WHERE id=? AND ledger_id IS NULL',[categoryId,keyword,matchType,priority,id]);
    await audit.append({...actor(ctx,ip),action:'rule.update',targetType:'category_rule',targetId:id,targetLabel:`${keyword} → ${category.name}`,reason,
      before:mapRule(before),after:{keyword,matchType,priority,categoryId}},conn);
  });
  return mapRule(await ruleRow(id));
}
async function deleteRule(id,body,ctx,ip){
  const reason=validate.reason(body.reason); const before=await ruleRow(id);
  if(before.is_system && body.confirmText!==before.keyword) throw ApiError.badRequest(`删除内置规则需输入关键词「${before.keyword}」确认`,'CONFIRM_PHRASE_MISMATCH');
  await db.transaction(async(conn)=>{
    await conn.query('DELETE FROM category_rule WHERE id=? AND ledger_id IS NULL',[id]);
    await audit.append({...actor(ctx,ip),action:'rule.delete',targetType:'category_rule',targetId:id,targetLabel:`${before.keyword} → ${before.category_name}`,reason,before:mapRule(before)},conn);
  });
  return {deleted:true};
}
function matches(rule,text){
  if(!rule.isEnabled)return false;
  if(rule.matchType==='equals')return text===rule.keyword;
  if(rule.matchType==='regex'){try{return new RegExp(rule.keyword,'i').test(text);}catch{return false;}}
  return text.toLowerCase().includes(rule.keyword.toLowerCase());
}
async function previewRule(textInput){
  const text=validate.str(textInput,'商户名',{max:100}); const rules=await listRules();
  const hits=rules.filter((r)=>matches(r,text)).sort((a,b)=>b.priority-a.priority||a.id-b.id);
  return {text,matched:hits[0]||null,candidates:hits.slice(0,10)};
}

function mapCategoryTemplate(r){return{id:Number(r.id),name:r.name,type:r.type,icon:r.icon,color:r.color,sortOrder:Number(r.sort_order),isEnabled:!!r.is_enabled,createdAt:r.created_at,updatedAt:r.updated_at};}
function mapAccountTemplate(r){return{id:Number(r.id),name:r.name,type:r.type,icon:r.icon,color:r.color,initialBalance:money.toNumber(r.initial_balance),creditLimit:r.credit_limit==null?null:money.toNumber(r.credit_limit),billDue:r.bill_due==null?null:money.toNumber(r.bill_due),cardTail:r.card_tail,isDefault:!!r.is_default,sortOrder:Number(r.sort_order),isEnabled:!!r.is_enabled};}
async function listTemplates(){const[c,a]=await Promise.all([db.query('SELECT * FROM category_template ORDER BY type,sort_order,id'),db.query('SELECT * FROM account_template ORDER BY sort_order,id')]);return{categories:c.map(mapCategoryTemplate),accounts:a.map(mapAccountTemplate)};}
async function categoryTemplate(id){const r=await db.queryOne('SELECT * FROM category_template WHERE id=?',[id]);if(!r)throw ApiError.notFound('分类模板不存在','TEMPLATE_NOT_FOUND');return r;}
async function saveCategoryTemplate(id,body,ctx,ip){
  const reason=validate.reason(body.reason);const before=id?await categoryTemplate(id):null;
  const name=validate.str(body.name??before?.name,'名称',{max:20});const type=validate.oneOf(body.type??before?.type,'类型',['expense','income']);
  const icon=validate.str(body.icon??before?.icon,'图标',{max:50,required:false});const color=validate.hexColor(body.color??before?.color);
  const sortOrder=validate.int(body.sortOrder??before?.sort_order,'排序',{min:0,max:9999});const enabled=body.isEnabled==null?(before?!!before.is_enabled:true):!!body.isEnabled;
  let targetId=Number(id)||null;
  await db.transaction(async(conn)=>{
    if(before&&before.is_enabled&&(!enabled||before.type!==type)){
      const[remaining]=await conn.query('SELECT COUNT(*) AS c FROM category_template WHERE type=? AND is_enabled=1 AND id<>?',[before.type,targetId]);
      if(Number(remaining[0].c)<1)throw ApiError.conflict(`${before.type==='expense'?'支出':'收入'}分类模板至少保留一个启用项`,'LAST_TEMPLATE');
    }
    if(targetId)await conn.query('UPDATE category_template SET name=?,type=?,icon=?,color=?,sort_order=?,is_enabled=? WHERE id=?',[name,type,icon,color,sortOrder,enabled?1:0,targetId]);
    else{const[r]=await conn.query('INSERT INTO category_template (name,type,icon,color,sort_order,is_enabled) VALUES (?,?,?,?,?,?)',[name,type,icon,color,sortOrder,enabled?1:0]);targetId=Number(r.insertId);}
    await audit.append({...actor(ctx,ip),action:id?'template.category.update':'template.category.create',targetType:'category_template',targetId:targetId,targetLabel:`${type}/${name}`,reason,before:before?mapCategoryTemplate(before):null,after:{name,type,icon,color,sortOrder,isEnabled:enabled}},conn);
  });return mapCategoryTemplate(await categoryTemplate(targetId));
}
async function deleteCategoryTemplate(id,body,ctx,ip){
  const reason=validate.reason(body.reason);const before=await categoryTemplate(id);
  await db.transaction(async(conn)=>{const[rows]=await conn.query('SELECT COUNT(*) AS c FROM category_template WHERE type=? AND is_enabled=1 AND id<>?',[before.type,id]);if(before.is_enabled&&Number(rows[0].c)<1)throw ApiError.conflict('每种类型至少保留一个启用分类模板','LAST_TEMPLATE');await conn.query('DELETE FROM category_template WHERE id=?',[id]);await audit.append({...actor(ctx,ip),action:'template.category.delete',targetType:'category_template',targetId:id,targetLabel:`${before.type}/${before.name}`,reason,before:mapCategoryTemplate(before)},conn);});return{deleted:true};
}
async function accountTemplate(id){const r=await db.queryOne('SELECT * FROM account_template WHERE id=?',[id]);if(!r)throw ApiError.notFound('账户模板不存在','TEMPLATE_NOT_FOUND');return r;}
async function saveAccountTemplate(id,body,ctx,ip){
  const reason=validate.reason(body.reason);const before=id?await accountTemplate(id):null;const type=validate.oneOf(body.type??before?.type,'类型',['cash','wechat','alipay','bank','credit']);
  const name=validate.str(body.name??before?.name,'名称',{max:50});const icon=validate.str(body.icon??before?.icon,'图标',{max:50,required:false});const color=validate.hexColor(body.color??before?.color);
  const initial=money.fromCents(money.toCents(body.initialBalance??before?.initial_balance??0));const limit=type==='credit'?money.fromCents(money.toCents(body.creditLimit??before?.credit_limit??20000)):null;
  const bill=type==='credit'&&body.billDue!=null?money.fromCents(money.toCents(body.billDue)):null;const tail=body.cardTail?String(body.cardTail):null;if(tail&&!/^\d{4}$/.test(tail))throw ApiError.badRequest('卡号尾号必须是 4 位数字','INVALID_CARD_TAIL');
  const isDefault=!!(body.isDefault??before?.is_default);const sortOrder=validate.int(body.sortOrder??before?.sort_order,'排序',{min:0,max:9999});const enabled=body.isEnabled==null?(before?!!before.is_enabled:true):!!body.isEnabled;let targetId=Number(id)||null;
  await db.transaction(async(conn)=>{if(before&&before.is_default&&(!isDefault||!enabled))throw ApiError.conflict('请先把另一个启用账户设为默认，再停用或取消当前默认模板','DEFAULT_TEMPLATE_REQUIRED');if(isDefault)await conn.query('UPDATE account_template SET is_default=0');if(targetId)await conn.query(`UPDATE account_template SET name=?,type=?,icon=?,color=?,initial_balance=?,credit_limit=?,bill_due=?,card_tail=?,is_default=?,sort_order=?,is_enabled=? WHERE id=?`,[name,type,icon,color,initial,limit,bill,tail,isDefault?1:0,sortOrder,enabled?1:0,targetId]);else{const[r]=await conn.query(`INSERT INTO account_template (name,type,icon,color,initial_balance,credit_limit,bill_due,card_tail,is_default,sort_order,is_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[name,type,icon,color,initial,limit,bill,tail,isDefault?1:0,sortOrder,enabled?1:0]);targetId=Number(r.insertId);}await audit.append({...actor(ctx,ip),action:id?'template.account.update':'template.account.create',targetType:'account_template',targetId:targetId,targetLabel:`${type}/${name}`,reason,before:before?mapAccountTemplate(before):null,after:{name,type,isDefault,sortOrder,isEnabled:enabled}},conn);});return mapAccountTemplate(await accountTemplate(targetId));
}
async function deleteAccountTemplate(id,body,ctx,ip){const reason=validate.reason(body.reason);const before=await accountTemplate(id);await db.transaction(async(conn)=>{if(before.is_default)throw ApiError.conflict('默认账户模板不能直接删除，请先设置另一个默认账户','DEFAULT_TEMPLATE_REQUIRED');const[rows]=await conn.query('SELECT COUNT(*) AS c FROM account_template WHERE is_enabled=1 AND id<>?',[id]);if(before.is_enabled&&Number(rows[0].c)<1)throw ApiError.conflict('至少保留一个启用账户模板','LAST_TEMPLATE');await conn.query('DELETE FROM account_template WHERE id=?',[id]);await audit.append({...actor(ctx,ip),action:'template.account.delete',targetType:'account_template',targetId:id,targetLabel:`${before.type}/${before.name}`,reason,before:mapAccountTemplate(before)},conn);});return{deleted:true};}

module.exports={listRules,ruleCategories,createRule,updateRule,deleteRule,previewRule,listTemplates,saveCategoryTemplate,deleteCategoryTemplate,saveAccountTemplate,deleteAccountTemplate};
