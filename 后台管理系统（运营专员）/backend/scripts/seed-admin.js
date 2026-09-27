'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const db = require('../src/db');
const auth = require('../src/auth');

const CATEGORIES = [
  ['餐饮美食','expense','restaurant','#14B8A6'], ['交通出行','expense','directions_subway','#06B6D4'],
  ['日用百货','expense','shopping_bag','#0EA5E9'], ['居家生活','expense','home','#6366F1'],
  ['休闲娱乐','expense','sports_esports','#8B5CF6'], ['医疗保健','expense','medical_services','#EC4899'],
  ['学习进修','expense','menu_book','#F43F5E'], ['通讯','expense','cell_tower','#F59E0B'],
  ['人情往来','expense','redeem','#84CC16'], ['其他','expense','more_horiz','#64748B'],
  ['工资','income','payments','#14B8A6'], ['奖金','income','card_giftcard','#06B6D4'],
  ['兼职','income','work','#0EA5E9'], ['投资收益','income','trending_up','#6366F1'],
  ['红包','income','redeem','#8B5CF6'], ['其他','income','more_horiz','#64748B'],
];
const ACCOUNTS = [
  ['现金','cash','payments','#64748B','0.00',null,null,null,1],
  ['微信支付钱包','wechat','chat','#07C160','0.00',null,null,null,0],
  ['支付宝','alipay','account_balance_wallet','#1677FF','0.00',null,null,null,0],
  ['储蓄卡','bank','account_balance','#E11D48','0.00',null,null,null,0],
  ['信用卡','credit','credit_card','#7C3AED','0.00','20000.00',null,null,0],
];

async function main() {
  const username = process.env.ADMIN_SEED_USERNAME || 'operator';
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password || password.length < 10) throw new Error('请在 .env 设置至少 10 位的 ADMIN_SEED_PASSWORD');
  const passwordHash = await auth.hashPassword(password);
  await db.query(
    `INSERT INTO admin_user (username, password_hash, display_name)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
    [username, passwordHash, process.env.ADMIN_SEED_DISPLAY_NAME || '运营专员']
  );
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const [name, type, icon, color] = CATEGORIES[i];
    await db.query(
      `INSERT INTO category_template (name,type,icon,color,sort_order,is_enabled)
       VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE icon=VALUES(icon),color=VALUES(color),sort_order=VALUES(sort_order)`,
      [name, type, icon, color, i + 1]
    );
  }
  for (let i = 0; i < ACCOUNTS.length; i += 1) {
    const row = ACCOUNTS[i];
    await db.query(
      `INSERT INTO account_template
       (name,type,icon,color,initial_balance,credit_limit,bill_due,card_tail,is_default,sort_order,is_enabled)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE icon=VALUES(icon),color=VALUES(color),sort_order=VALUES(sort_order)`,
      [...row, i + 1]
    );
  }
  console.log(`[seed] 后台账号 ${username} 与默认模板已就绪。`);
  await db.close();
}

main().catch(async (err) => { console.error('[seed]', err.message); try { await db.close(); } catch {} process.exit(1); });
