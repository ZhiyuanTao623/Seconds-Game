import { DICTS } from './strings';
import type { Locale, Strings } from './strings';

export type { Locale, Strings, RoomText, UpgradeText, UpgradeId } from './strings';

const STORAGE_KEY = 'seconds.locale';

/**
 * 语言检测：先看上次记住的选择，再看浏览器语言，最后兜底英文。
 *
 * 两个全局都做了 `typeof` 守卫 —— 这个模块会被 game/upgrades.ts 和
 * game/run.ts 间接引入，而那些模块的单元测试跑在 node 环境里，
 * 既没有 localStorage 也没有 navigator。
 */
function detectDefault(): Locale {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'zh' || saved === 'en') return saved;
    } catch {
      // 隐私模式等场景下 localStorage 可能直接抛错，忽略即可
    }
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current: Locale = detectDefault();
const listeners = new Set<() => void>();

export function getLocale(): Locale { return current; }

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* 忽略 */ }
  }
  for (const fn of listeners) fn();
}

export function toggleLocale(): void {
  setLocale(current === 'zh' ? 'en' : 'zh');
}

/** 返回取消订阅函数。App 和 Hud 在构造时订阅一次，两者都活到进程结束，不需要真的取消。 */
export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 当前语言的完整词典。任何界面文案都只应该从这里取。 */
export function t(): Strings { return DICTS[current]; }
