'use strict';

/**
 * 文本匹配工具。两个用途：
 *   1. 导入去重：判断两条账单是不是同一笔（PRD 4.3.3，相似度 > 80% 视为重复）
 *   2. 关键词分类：把商户名/备注匹配到 category_rule（PRD 4.2.4）
 *
 * 相似度用 **二元组 Dice 系数**，而不是编辑距离：
 *   编辑距离对「肯德基」vs「肯德基(中关村店)」这类「一个包含另一个」的情况
 *   给分偏低（长度差太大），会漏判成两笔。Dice 只看共同片段占比，更贴合
 *   「同一个商户的不同显示名」这个真实场景。
 */

/** 归一化：去掉大小写差异、空白与标点，只留下有信息量的字符。 */
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 切成字符二元组。单字符时退化为自身，避免空数组导致分母为 0。 */
function bigrams(text) {
  if (text.length <= 1) return text.length === 1 ? [text] : [];
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    out.push(text.slice(i, i + 2));
  }
  return out;
}

/**
 * 0~1 的相似度。完全一致返回 1，任一方为空返回 0。
 * 用多重集交集，所以「多多多」和「多」不会因为重复字数不同而失真。
 */
function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);

  const pool = new Map();
  for (const g of leftGrams) pool.set(g, (pool.get(g) || 0) + 1);

  let intersection = 0;
  for (const g of rightGrams) {
    const available = pool.get(g) || 0;
    if (available > 0) {
      intersection += 1;
      pool.set(g, available - 1);
    }
  }

  return (2 * intersection) / (leftGrams.length + rightGrams.length);
}

/**
 * PRD 4.3.3 的阈值：80%。
 *
 * 这里刻意**只**用 Dice，不额外加「包含关系」加权。原因是 PRD 明确写了
 * 「宁可轻微漏判也不可误判」——代价是 '肯德基' vs '肯德基(中关村店)' 只有
 * 约 0.5 分，会被判成两笔。但去重是三条件同时满足（金额相同 AND 日期相同
 * AND 相似度>80%），前两条已经把候选压得很窄，而误判（把两笔真实消费
 * 合并成一条）造成的损失远大于漏判（用户手动再删一次）。
 */
const DUPLICATE_THRESHOLD = 0.8;

/**
 * 判定是否重复。**严格大于**阈值 —— PRD 4.3.3 的原文是「相似度 > 80%」，
 * 正好等于 0.8 的落在阈值之下。
 *
 * 这不是抠字眼：「甲商户」vs「甲商户（分店）」这类加后缀的写法算下来正是
 * 0.8，按「宁漏不误」应当判成两笔（用户手动删一次即可，误合并则很难发现）。
 * 判定统一走这里，不要在各调用点自己写 `>=`。
 */
function isSimilar(a, b, threshold = DUPLICATE_THRESHOLD) {
  return similarity(a, b) > threshold;
}

/**
 * 判断一段文本是否命中某条关键词规则。
 *
 * priority 的裁决不在这里做 —— 这里只回答「命不命中」，由调用方按
 * priority 降序取第一个命中的规则（对应 02_seed.sql 里「美团买药」priority=30
 * 压过「美团」priority=20 的设计）。
 */
function matchesRule(text, rule) {
  if (!text || !rule || !rule.keyword) return false;

  const haystack = String(text);
  const needle = String(rule.keyword);

  switch (rule.match_type || 'contains') {
    case 'equals':
      return normalize(haystack) === normalize(needle);

    case 'regex':
      // 规则来自数据库，理论上可被用户改写。加长度上限保护，
      // 避免一条灾难性回溯的正则把请求线程拖死。
      try {
        if (needle.length > 200) return false;
        return new RegExp(needle, 'i').test(haystack);
      } catch {
        return false;
      }

    case 'contains':
    default:
      return haystack.toLowerCase().includes(needle.toLowerCase());
  }
}

/**
 * 按 priority 降序找出最匹配的分类。
 * rules 需自带 category_id / keyword / match_type / priority 字段。
 * 返回命中的规则；没有命中返回 null。
 */
function pickBestRule(text, rules) {
  if (!text || !Array.isArray(rules) || rules.length === 0) return null;

  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return sorted.find((rule) => matchesRule(text, rule)) || null;
}

module.exports = {
  normalize,
  similarity,
  isSimilar,
  matchesRule,
  pickBestRule,
  DUPLICATE_THRESHOLD,
};
