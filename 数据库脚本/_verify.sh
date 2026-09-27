#!/usr/bin/env bash
# 自检脚本：跑三个 SQL 脚本并逐项断言。
#
# 用法：
#   bash _verify.sh           # 【推荐】起一次性 MySQL 8 容器验证，不碰本机数据库
#   bash _verify.sh local     # 在本机已装的 MySQL 上验证（需先 export MYSQL_PWD=...）
#
# 两种模式会给出不同的结果，这是有意义的：
#   容器模式用的是最新 8.0.x，CHECK 约束【生效】；
#   本机若低于 8.0.16，CHECK 约束会被 MySQL 静默忽略 —— 脚本仍会全部成功，
#   但 STEP 8 的脏数据会全部插进去，断言会红。这正是在暴露环境问题。
set -u

MODE="${1:-docker}"

SRC="$(cd "$(dirname "$0")" && pwd)"
# docker 是 Windows 程序，路径必须用 Windows 形式（正斜杠可用）；
# 关掉 MSYS 的路径转换，否则 /d/... 会被原样传过去而找不到文件。
SRC_WIN="$(cd "$SRC" && pwd -W 2>/dev/null || echo "$SRC")"
export MSYS_NO_PATHCONV=1

IMG="docker.m.daocloud.io/library/mysql:8.0"
C="mz-verify"
PW="${MYSQL_PWD:-mzverify}"
MYSQL_EXE="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"

RC=0
note() { echo "[mz] $*"; }
fail() { echo "[mz] !!! $*"; RC=1; }

# ---------------------------------------------------------------- 环境准备
if [ "$MODE" = "local" ]; then
  [ -n "${MYSQL_PWD:-}" ] || { echo "本机模式需要 MYSQL_PWD 环境变量"; exit 1; }
  mq() { "$MYSQL_EXE" -u root --default-character-set=utf8mb4 "$@"; }
  note "=== 本机模式 ==="
  VER=$(mq -N -e "SELECT VERSION();" 2>/dev/null)
  note "server version: $VER"
  # 版本守卫：只有 8.0.16 起才真正执行 CHECK 约束。
  # 注意这里必须写成 [ MAJ -lt 8 ] || ( MAJ -eq 8 && MIN -eq 0 && PAT -lt 16 )，
  # 不能图省事写成 [ MIN -lt 8 ] —— 那样 MIN=0 时恒真，任何 8.0.x 都会误报。
  MAJ=$(echo "$VER" | cut -d. -f1); MIN=$(echo "$VER" | cut -d. -f2); PAT=$(echo "$VER" | cut -d. -f3)
  if [ "$MAJ" -lt 8 ] || { [ "$MAJ" -eq 8 ] && [ "$MIN" -eq 0 ] && [ "$PAT" -lt 16 ]; }; then
    note "############################################################"
    note "# 警告：MySQL $VER < 8.0.16 —— CHECK 约束会被【静默忽略】      #"
    note "# 建表不会报错，但下面的约束冒烟测试（STEP 8）会全部失败。     #"
    note "# 这不是脚本的问题，是服务器版本的问题。                       #"
    note "############################################################"
  fi
else
  note "=== 容器模式 ==="
  note "STEP 1: pull image"
  docker pull "$IMG" >/dev/null 2>&1 || { echo "[mz] PULL FAILED"; exit 1; }
  note "STEP 2: start container (port 13306)"
  docker rm -f "$C" >/dev/null 2>&1
  docker run -d --name "$C" -e MYSQL_ROOT_PASSWORD="$PW" -p 13306:3306 "$IMG" >/dev/null \
    || { echo "[mz] RUN FAILED"; exit 1; }
  note "STEP 3: wait for mysqld"
  READY=0
  for i in $(seq 1 60); do
    if docker exec -e MYSQL_PWD="$PW" "$C" mysqladmin ping -h127.0.0.1 -uroot --silent >/dev/null 2>&1; then
      READY=1; note "mysqld ready (iteration $i)"; break
    fi
    sleep 3
  done
  [ "$READY" = "1" ] || { echo "[mz] MYSQL NEVER BECAME READY"; docker logs --tail 40 "$C" 2>&1; exit 1; }
  mq() { docker exec -e MYSQL_PWD="$PW" "$C" mysql -uroot "$@"; }
  note "server version: $(mq -N -e 'SELECT VERSION();' 2>/dev/null)"
fi

# ---------------------------------------------------------------- 执行脚本
note "=== STEP 4/5: 执行三个脚本 ==="
for f in 01_schema 02_seed 03_views; do
  if [ "$MODE" = "local" ]; then
    OUT=$(mq < "$SRC/$f.sql" 2>&1)
  else
    docker cp "$SRC_WIN/$f.sql" "$C:/tmp/$f.sql" >/dev/null 2>&1 \
      || { fail "cp $f.sql 失败"; exit 1; }
    OUT=$(docker exec -e MYSQL_PWD="$PW" "$C" sh -c "mysql -uroot < /tmp/$f.sql" 2>&1)
  fi
  if [ -n "$OUT" ]; then fail "$f.sql:"; echo "$OUT"; else note "$f.sql OK"; fi
done

note "=== STEP 5b: 重复执行 02/03 验证幂等 ==="
for f in 02_seed 03_views; do
  if [ "$MODE" = "local" ]; then
    OUT=$(mq < "$SRC/$f.sql" 2>&1)
  else
    OUT=$(docker exec -e MYSQL_PWD="$PW" "$C" sh -c "mysql -uroot < /tmp/$f.sql" 2>&1)
  fi
  if [ -n "$OUT" ]; then fail "$f.sql 重复执行失败:"; echo "$OUT"; else note "$f.sql 重复执行 OK"; fi
done

# ---------------------------------------------------------------- 断言
expect() {  # expect <label> <expected> <sql>
  local got
  got=$(mq -N -e "USE mingzhang; $3" 2>/dev/null | head -1)
  if [ "$got" = "$2" ]; then note "OK   $1 = $got"
  else fail "$1 期望「$2」，实际「$got」"; fi
}

note "=== STEP 6: 结构断言 ==="
expect "基础表数量"        13 "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='mingzhang' AND table_type='BASE TABLE'"
expect "视图数量"           6 "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='mingzhang'"
expect "CHECK 约束数量"     9 "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='mingzhang' AND constraint_type='CHECK'"
# 7 条显式索引 + 3 条 MySQL 为外键自动补的（fk_txn_user / fk_txn_category / fk_txn_account，
# 因为它们的外键列不是任何复合索引的首列）。自动补是正常行为，不是重复索引。
expect "transaction 索引数" 10 "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='mingzhang' AND table_name='transaction' AND index_name<>'PRIMARY'"

note "=== STEP 7: 数据断言（对照 README 期望值）==="
expect "有效流水数"         17 "SELECT COUNT(*) FROM \`transaction\` WHERE is_deleted=0"
expect "2026-09 支出合计"   3461.00 "SELECT SUM(amount) FROM \`transaction\` WHERE type='expense' AND is_deleted=0 AND happened_at>='2026-09-01' AND happened_at<'2026-10-01'"
expect "分类数"             16 "SELECT COUNT(*) FROM category"
expect "账户数"             5  "SELECT COUNT(*) FROM account"
expect "关键词规则数"       69 "SELECT COUNT(*) FROM category_rule"

expect "本月剩余预算"       4539.00 "SELECT remaining FROM v_today_quota"
expect "本月剩余天数"       7       "SELECT remaining_days FROM v_today_quota"
expect "今日可花"           648.43  "SELECT today_quota FROM v_today_quota"
expect "预警档位"           normal  "SELECT alert_level FROM v_today_quota"

expect "现金余额"           500.00    "SELECT balance FROM v_account_balance WHERE name='现金'"
expect "微信钱包余额"       1097.50   "SELECT balance FROM v_account_balance WHERE name='微信支付钱包'"
expect "支付宝余额"         2856.30   "SELECT balance FROM v_account_balance WHERE name='支付宝'"
expect "储蓄卡余额"         33600.00  "SELECT balance FROM v_account_balance WHERE name='招商银行储蓄卡'"
expect "信用卡已用额度"     88.00     "SELECT credit_used FROM v_account_balance WHERE name='信用卡'"
expect "信用卡可用额度"     59912.00  "SELECT credit_available FROM v_account_balance WHERE name='信用卡'"
expect "非信用卡无授信列"   NULL      "SELECT credit_used FROM v_account_balance WHERE name='现金'"

expect "转账笔数"           1 "SELECT transfer_count FROM v_monthly_summary"
expect "收入合计"           18786.30 "SELECT income_total FROM v_monthly_summary"
expect "支出合计"           3461.00  "SELECT expense_total FROM v_monthly_summary"

if [ "$MODE" != "local" ]; then
  note "----- v_today_quota（明细）-----"
  mq -e "USE mingzhang; SELECT * FROM v_today_quota\G"
  note "----- v_account_balance（明细）-----"
  mq -t -e "USE mingzhang; SELECT name, balance, credit_used, credit_available FROM v_account_balance ORDER BY sort_order;"
fi

note "=== STEP 8: 约束冒烟测试（每条都必须被拦下）==="
idx=0
run_expect_err() {  # run_expect_err <期望错误码> <语句>
  idx=$((idx+1))
  local want="$1" stmt="$2" out
  out=$(mq -e "USE mingzhang; $stmt" 2>&1)
  if echo "$out" | grep -q "ERROR $want"; then
    note "OK  #$idx 拦截 (ERROR $want)"
  else
    fail "#$idx 期望 ERROR $want，实际没被拦下（脏数据插进去了）"
  fi
}

TXN_COLS="INSERT INTO \`transaction\`(ledger_id,created_by,type,amount,category_id,account_id,to_account_id,happened_at)"

run_expect_err 3819 "$TXN_COLS VALUES(1,1,'transfer',10.00,NULL,1,1,NOW())"          # 转出=转入
run_expect_err 3819 "$TXN_COLS VALUES(1,1,'transfer',10.00,NULL,1,NULL,NOW())"       # 转账无转入账户
run_expect_err 3819 "$TXN_COLS VALUES(1,1,'expense',10.00,1,1,2,NOW())"              # 非转账有转入账户
run_expect_err 3819 "$TXN_COLS VALUES(1,1,'expense',0.00,1,1,NULL,NOW())"            # 金额为 0
run_expect_err 1264 "$TXN_COLS VALUES(1,1,'expense',-5.00,1,1,NULL,NOW())"           # 金额为负（类型层拦）
run_expect_err 3819 "$TXN_COLS VALUES(1,1,'expense',99999999.00,1,1,NULL,NOW())"     # 超上限
run_expect_err 3819 "$TXN_COLS VALUES(1,1,'expense',10.00,NULL,1,NULL,NOW())"        # 非转账无分类
run_expect_err 3819 "INSERT INTO \`account\`(ledger_id,name,type,credit_limit) VALUES(1,'坏账户','cash',5000)"
run_expect_err 3819 "INSERT INTO \`budget\`(ledger_id,period_type,period_value,total_amount,alert_yellow_pct) VALUES(1,'monthly','2026-10',1000.00,99)"

note "=== STEP 8b: 正常数据必须能插进去（防止约束过严）==="
run_expect_ok() {
  idx=$((idx+1))
  local out; out=$(mq -e "USE mingzhang; $1" 2>&1)
  if [ -z "$out" ]; then note "OK  #$idx 正常插入通过"
  else fail "#$idx 正常数据被误拒: $out"; fi
}
run_expect_ok "$TXN_COLS VALUES(1,1,'transfer',1.00,NULL,1,2,'2026-09-25 10:00:00')"
run_expect_ok "$TXN_COLS VALUES(1,1,'expense',0.01,1,1,NULL,'2026-09-25 10:00:00')"
run_expect_ok "$TXN_COLS VALUES(1,1,'expense',9999999.99,1,1,NULL,'2026-09-25 10:00:00')"
run_expect_ok "INSERT INTO \`account\`(ledger_id,name,type,credit_limit,bill_due) VALUES(1,'测试信用卡','credit',5000,1200)"
run_expect_ok "INSERT INTO \`budget\`(ledger_id,period_type,period_value,total_amount,alert_yellow_pct,alert_red_pct) VALUES(1,'monthly','2026-11',1000.00,50,120)"

# ---------------------------------------------------------------- 收尾
if [ "$MODE" != "local" ]; then
  note "=== STEP 9: teardown ==="
  docker rm -f "$C" >/dev/null 2>&1 && note "container removed"
else
  note "=== STEP 9: 本机模式收尾 ==="
  # STEP 8 造的脏数据在旧版 MySQL 上不会被拦、会真的落库；8b 还额外插了正常数据。
  # 重跑一次 02_seed.sql 把 demo 数据恢复成干净状态（该脚本本身是幂等的）。
  if [ "$RC" != "0" ]; then
    note "有断言未通过，重跑 02_seed.sql 还原演示数据 ..."
  else
    note "重跑 02_seed.sql 还原演示数据 ..."
  fi
  OUT=$(mq < "$SRC/02_seed.sql" 2>&1)
  if [ -n "$OUT" ]; then fail "还原失败:"; echo "$OUT"; else note "演示数据已还原"; fi
  note "（mingzhang 库保留，如需彻底重置请重跑 01_schema.sql）"
fi

if [ "$RC" = "0" ]; then echo "[mz] ==== ALL CHECKS PASSED ===="; else echo "[mz] ==== SOME CHECKS FAILED ===="; fi
exit $RC
