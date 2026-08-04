import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/i18n/strings';
import { getLocale, onLocaleChange, setLocale, t, toggleLocale } from '../src/i18n/i18n';
import { UPGRADES } from '../src/game/upgrades';

/**
 * 两份词典必须长得一模一样 —— 这条不由 TypeScript 的结构类型单独保证
 * 到「值」的层面（比如某个键被写成了空字符串，或者漏了一个 upgrades 条目
 * 但另一份用展开凑出了同名字段），所以额外用一次深度按键比对兜底。
 */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  if (typeof obj === 'function') return [prefix];
  return Object.keys(obj as Record<string, unknown>).flatMap((k) =>
    keyPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k),
  );
}

describe('两份词典结构完全一致', () => {
  it('zh 和 en 的键路径逐条相同', () => {
    const zhKeys = keyPaths(DICTS.zh).sort();
    const enKeys = keyPaths(DICTS.en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('没有空字符串文案（漏翻译的常见信号）', () => {
    for (const locale of ['zh', 'en'] as const) {
      const empties = keyPaths(DICTS[locale]).filter((path) => {
        const value = path.split('.').reduce<unknown>(
          (o, k) => (o as Record<string, unknown>)[k],
          DICTS[locale],
        );
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empties, `${locale} 词典里有空字符串：${empties.join(', ')}`).toEqual([]);
    }
  });

  it('每个强化 id 在两份词典里都有对应条目', () => {
    for (const u of UPGRADES) {
      expect(DICTS.zh.upgrades[u.id], `zh 缺少强化 ${u.id}`).toBeDefined();
      expect(DICTS.en.upgrades[u.id], `en 缺少强化 ${u.id}`).toBeDefined();
    }
  });
});

describe('locale 状态机', () => {
  it('setLocale 是幂等的：设成当前语言不触发监听器', () => {
    setLocale('zh');
    let fired = 0;
    const off = onLocaleChange(() => { fired += 1; });
    setLocale('zh');
    expect(fired).toBe(0);
    off();
  });

  it('setLocale 切到不同语言会广播给所有订阅者', () => {
    setLocale('zh');
    let fired = 0;
    const off = onLocaleChange(() => { fired += 1; });
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(fired).toBe(1);
    off();
    setLocale('zh');
  });

  it('toggleLocale 在两种语言之间来回切', () => {
    setLocale('zh');
    toggleLocale();
    expect(getLocale()).toBe('en');
    toggleLocale();
    expect(getLocale()).toBe('zh');
  });

  it('t() 返回的正是当前语言的词典', () => {
    setLocale('zh');
    expect(t()).toBe(DICTS.zh);
    setLocale('en');
    expect(t()).toBe(DICTS.en);
    setLocale('zh');
  });

  it('取消订阅之后不再收到广播', () => {
    setLocale('zh');
    let fired = 0;
    const off = onLocaleChange(() => { fired += 1; });
    off();
    setLocale('en');
    expect(fired).toBe(0);
    setLocale('zh');
  });
});

describe('强化名字/描述是 getter，随当前语言变化', () => {
  it('同一个 Upgrade 引用在两种语言下读出不同的文本', () => {
    setLocale('zh');
    const blade = UPGRADES.find((u) => u.id === 'blade')!;
    const zhName = blade.name;
    const zhDesc = blade.desc;

    setLocale('en');
    expect(blade.name).not.toBe(zhName);
    expect(blade.desc).not.toBe(zhDesc);
    expect(blade.name).toBe(DICTS.en.upgrades.blade.name);

    setLocale('zh');
    expect(blade.name).toBe(zhName);
  });
});
