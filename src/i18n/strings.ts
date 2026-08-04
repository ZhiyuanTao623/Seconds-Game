import type { RoomKind } from '../game/map';

export type Locale = 'zh' | 'en';

export interface RoomText { label: string; hint: string }
export interface UpgradeText { name: string; desc: string }
export interface EvolutionText { desc: string }

/**
 * 13 个强化的 id 联合类型。这里是唯一真相源 —— upgrades.ts 里每个
 * `mkUpgrade({ id: ... })` 的 id 都必须落在这个联合里，拼错字会在编译期报错，
 * 而不是运行时显示一个 undefined 的名字。
 */
export type UpgradeId =
  | 'blade' | 'gale' | 'tough' | 'reach' | 'rapid'
  | 'exec' | 'greed' | 'stasis' | 'riposte' | 'abacus'
  | 'throw' | 'phantom' | 'charge';

/**
 * 全部界面文案的形状。
 *
 * zh 和 en 两份词典都必须满足这个接口 —— 少翻译一个键会在编译期报错，
 * 不会等到运行时才发现某个界面在英文模式下显示 undefined。
 * 带参数的文案用函数而不是字符串模板，保证数字/单位在两种语言里都不会丢。
 */
export interface Strings {
  meta: { title: string; htmlLang: string };

  hud: {
    play: string; pen: string; spend: string; ref: string;
    floor: (floor: number, total: number) => string;
    seed: (seed: number | string) => string;
    tax: (mult: string, secondsLeft: string) => string;
  };

  help: string;

  title: {
    brand: string;
    tagline: string;
    line1: string;
    line2: string;
    line3: string;
    controls: string;
    seedLabel: string;
    seedPlaceholder: string;
    start: string;
  };

  map: {
    hint: string;
    mendToast: (cost: number, cut: string) => string;
    shortcutToast: (cost: number) => string;
  };

  rooms: Record<RoomKind, RoomText>;

  combat: { finalFloor: string };

  reward: {
    kind: string;
    eliteKind: string;
    cleared: string;
    eliteCleared: string;
    body: string;
    eliteBody: string;
    clockNote: string;
    free: string;
    got: (name: string) => string;
    evolved: (name: string) => string;
  };

  evolution: { numeric: string; costRemoval: string };
  evolutions: Record<UpgradeId, { numeric: EvolutionText; costRemoval?: EvolutionText }>;

  shop: {
    title: string;
    sold: string;
    body: string;
    /** `total` 参数已经带好单位（比如 `8.4s`），只管往句子里嵌 */
    total: (total: string) => string;
    clockNote: string;
    leave: string;
    bought: (price: number, name: string) => string;
  };

  result: {
    clear: string;
    over: string;
    play: string;
    pen: string;
    spend: string;
    ref: string;
    seed: string;
    owned: string;
    none: string;
    retry: string;
    fresh: string;
    copied: string;
    listSep: string;
  };

  pause: {
    title: string;
    note1: string;
    note2: string;
    resume: string;
    quit: string;
  };

  upgrades: Record<UpgradeId, UpgradeText>;
}

const zh: Strings = {
  meta: { title: '秒 · SECONDS', htmlLang: 'zh-CN' },

  hud: {
    play: '游戏', pen: '受击', spend: '消费', ref: '返还',
    floor: (floor, total) => `第 ${floor} 层 / ${total}`,
    seed: (seed) => `SEED ${seed}`,
    tax: (mult, secondsLeft) => `连击税 ×${mult} · ${secondsLeft}s 后清零`,
  },

  help: 'WASD 移动 · 鼠标瞄准 · 左键挥砍 · 空格/右键 朝光标冲刺(无敌) · 数字键选卡 · ESC 暂停',

  title: {
    brand: '秒 · S E C O N D S',
    tagline: '时间即货币',
    line1: '你没有血量。被打中只会让你的计时器变长。',
    line2: '买强化要花秒、开捷径要花秒、修复伤势也要花秒。',
    line3: '地图和商店界面同样在计时 —— 犹豫也是要付钱的。',
    controls: 'WASD 移动 · 鼠标瞄准 · 左键挥砍 · 空格/右键 朝光标冲刺(无敌帧)',
    seedLabel: 'SEED（留空随机）',
    seedPlaceholder: '随机',
    start: '开 始',
  },

  map: {
    hint: '选 择 路 线 —— 时 钟 正 在 走',
    mendToast: (cost, cut) => `花费 ${cost}s，消除了 ${cut}s 惩罚`,
    shortcutToast: (cost) => `花费 ${cost}s 跳过一整层`,
  },

  rooms: {
    combat: { label: '战斗房', hint: '常规敌人 · 清空后 2 选 1 免费强化' },
    elite: { label: '精英房', hint: '更多更硬的敌人 · 清空后 3 选 1 免费强化' },
    shop: { label: '秒 · 商店', hint: '用秒数直接买强化 · 逛店期间时钟在走' },
    mend: { label: '时间修复站', hint: '花秒数抹掉一部分已累计的受击惩罚' },
    shortcut: { label: '捷径门', hint: '花秒数跳过一整层 · 少打一场，也少拿一个强化' },
    boss: { label: 'BOSS', hint: '最终节点' },
  },

  combat: { finalFloor: '最终节点' },

  reward: {
    kind: '强化',
    cleared: '房 间 已 清 空',
    body: '你用游戏时间换来了它 —— 免费拿走一个。',
    clockNote: '时钟还在走。',
    free: '免费 · 已用战斗时间支付',
    got: (name) => `获得 ${name}`,
    eliteKind: '精英进化',
    eliteCleared: '精英已击破',
    eliteBody: '展示过的分支将永久离开本局奖励池 —— 选一个强化你的构筑。',
    evolved: (name) => `进化 ${name}`,
  },

  evolution: { numeric: '锋锐', costRemoval: '卸重' },
  evolutions: {
    blade: { numeric: { desc: '总伤害提升至 200%。' }, costRemoval: { desc: '移除「受击时间惩罚 +40%」。' } },
    gale: { numeric: { desc: '总移速提升至 +30%，冲刺冷却缩短至 -48%。' } },
    tough: { numeric: { desc: '受击时间惩罚降低至 -50%。' }, costRemoval: { desc: '移除「伤害 -15%」。' } },
    reach: { numeric: { desc: '总攻击范围提升至 +80%，挥砍角度进一步增大。' } },
    rapid: { numeric: { desc: '攻击间隔缩短至原本的 45%。' }, costRemoval: { desc: '移除「单次伤害 -10%」。' } },
    exec: { numeric: { desc: '处决阈值提升至 45%（仍不作用于 Boss）。' } },
    greed: { numeric: { desc: '后续秒数消费降低至原价的 45%（最低仍为 3s）。' } },
    stasis: { numeric: { desc: '冲刺时的全场减速持续提升至 0.85 秒。' } },
    riposte: { numeric: { desc: '反击窗口内伤害提升至 +140%。' } },
    abacus: { numeric: { desc: '每击杀一名非 Boss 敌人返还 1.0 秒。' } },
    throw: { numeric: { desc: '飞刃伤害提升至本次挥砍的 85%。' } },
    phantom: { numeric: { desc: '冲刺穿敌伤害提升至 180%。' } },
    charge: { numeric: { desc: '满蓄全向斩伤害提升至 340%。' } },
  },

  shop: {
    title: '秒 · 商 店',
    sold: '已 售 出',
    body: '你永远买得起 —— 因为代价直接记在你的计时器上。',
    total: (total) => `当前总计 ${total} ·`,
    clockNote: '逛店也在计时',
    leave: '离 开 商 店',
    bought: (price, name) => `花费 ${price}s 购入 ${name}`,
  },

  result: {
    clear: '章 节 通 关',
    over: '结 束',
    play: '游戏时间',
    pen: '受击惩罚',
    spend: '秒数消费',
    ref: '击杀返还',
    seed: 'SEED',
    owned: '持有强化',
    none: '无',
    retry: '同 一 SEED 再 跑',
    fresh: '换 一 局',
    copied: 'SEED 已复制',
    listSep: '、',
  },

  pause: {
    title: '已 暂 停',
    note1: '时钟已停。',
    note2: '这块遮罩是故意画满的 —— 暂停不该变成「停表慢慢看清场面」的后门。',
    resume: '继 续',
    quit: '回 标 题',
  },

  upgrades: {
    blade: { name: '利刃', desc: '伤害 +60%，但受击时间惩罚 +40%。' },
    gale: { name: '疾风', desc: '移速 +16%，冲刺冷却 -35%。' },
    tough: { name: '韧体', desc: '受击时间惩罚 -35%，但伤害 -15%。' },
    reach: { name: '长刃', desc: '攻击范围 +45%，挥砍弧度略增。' },
    rapid: { name: '连斩', desc: '攻击速度 +40%，单次伤害 -10%。' },
    exec: { name: '处决', desc: '敌人生命低于 30% 时被斩击立即斩杀。' },
    greed: { name: '贪婪', desc: '此后所有秒数消费 -35%。' },
    stasis: { name: '时停', desc: '冲刺时全场减速 60%，持续 0.55 秒。' },
    riposte: { name: '反击', desc: '受击后 2 秒内伤害 +85%。' },
    abacus: { name: '精算', desc: '每击杀一个敌人返还 0.5 秒。' },
    throw: {
      name: '掷刃',
      desc: '每次挥砍额外向光标方向掷出一枚刃弹（伤害 55%）。<b>你不再必须贴身才有输出。</b>',
    },
    phantom: {
      name: '掠影',
      desc: '冲刺穿过敌人时造成 120% 伤害，每次冲刺对同一敌人只结算一次。<b>冲刺不再只是逃跑键。</b>',
    },
    charge: {
      name: '蓄力',
      desc: '按住左键 0.5 秒蓄力，松开打出 260% 伤害的 360° 全向斩。<b>代价：按住不再自动连砍。</b>',
    },
  },
};

const en: Strings = {
  meta: { title: 'SECONDS', htmlLang: 'en' },

  hud: {
    play: 'Game', pen: 'Hits', spend: 'Spent', ref: 'Refund',
    floor: (floor, total) => `Floor ${floor} / ${total}`,
    seed: (seed) => `SEED ${seed}`,
    tax: (mult, secondsLeft) => `Combo tax ×${mult} · clears in ${secondsLeft}s`,
  },

  help: 'WASD move · mouse aim · LMB slash · Space/RMB dash toward cursor (i-frames) · number keys pick cards · ESC pause',

  title: {
    brand: 'S E C O N D S',
    tagline: 'Time Is the Only Currency',
    line1: "You have no health bar. Getting hit doesn't kill you — it just adds seconds to your clock.",
    line2: 'Upgrades cost seconds. Shortcuts cost seconds. Even patching yourself up costs seconds.',
    line3: 'The map and shop keep the clock running too — hesitating costs you as well.',
    controls: 'WASD move · mouse aim · LMB slash · Space/RMB dash toward cursor (i-frames)',
    seedLabel: 'SEED (leave blank for random)',
    seedPlaceholder: 'Random',
    start: 'S T A R T',
  },

  map: {
    hint: 'Choose a route — the clock is running',
    mendToast: (cost, cut) => `Spent ${cost}s, cleared ${cut}s of penalty`,
    shortcutToast: (cost) => `Spent ${cost}s to skip a whole floor`,
  },

  rooms: {
    combat: { label: 'Combat', hint: 'Regular enemies · clear it for a free pick from 2 upgrades' },
    elite: { label: 'Elite', hint: 'More, tougher enemies · clear it for a free pick from 3 upgrades' },
    shop: { label: 'Shop', hint: 'Spend seconds on upgrades directly · the clock runs while you browse' },
    mend: { label: 'Time Mend', hint: 'Spend seconds to wipe part of your accumulated hit penalty' },
    shortcut: { label: 'Shortcut', hint: 'Spend seconds to skip a whole floor · one less fight, one less upgrade' },
    boss: { label: 'BOSS', hint: 'Final floor' },
  },

  combat: { finalFloor: 'Final Floor' },

  reward: {
    kind: 'Upgrade',
    cleared: 'Room Cleared',
    body: 'You paid for it with game time — take one for free.',
    clockNote: 'The clock is still running.',
    free: 'Free · paid with combat time',
    got: (name) => `Got ${name}`,
    eliteKind: 'Elite Evolution',
    eliteCleared: 'Elite Defeated',
    eliteBody: 'Revealed branches leave this run forever — choose one to deepen your build.',
    evolved: (name) => `Evolved ${name}`,
  },

  evolution: { numeric: 'Sharpened', costRemoval: 'Unburdened' },
  evolutions: {
    blade: { numeric: { desc: 'Total damage becomes 200%.' }, costRemoval: { desc: 'Remove the +40% hit-penalty drawback.' } },
    gale: { numeric: { desc: 'Total move speed becomes +30%; dash cooldown becomes -48%.' } },
    tough: { numeric: { desc: 'Hit penalty becomes -50%.' }, costRemoval: { desc: 'Remove the -15% damage drawback.' } },
    reach: { numeric: { desc: 'Total attack range becomes +80%, with a wider slash arc.' } },
    rapid: { numeric: { desc: 'Attack interval becomes 45% of base.' }, costRemoval: { desc: 'Remove the -10% damage-per-hit drawback.' } },
    exec: { numeric: { desc: 'Execution threshold becomes 45% (still excludes the Boss).' } },
    greed: { numeric: { desc: 'Future second-spending becomes 45% of base price (minimum remains 3s).' } },
    stasis: { numeric: { desc: 'Dash slow lasts 0.85 seconds.' } },
    riposte: { numeric: { desc: 'Damage in the riposte window becomes +140%.' } },
    abacus: { numeric: { desc: 'Refund 1.0 second per non-Boss kill.' } },
    throw: { numeric: { desc: 'Thrown blades deal 85% of the slash damage.' } },
    phantom: { numeric: { desc: 'Dash-through damage becomes 180%.' } },
    charge: { numeric: { desc: 'A full charged slash deals 340% damage.' } },
  },

  shop: {
    title: 'Seconds · Shop',
    sold: 'Sold',
    body: 'You can always afford it — the cost is charged straight to your clock.',
    total: (total) => `Current total ${total} ·`,
    clockNote: 'the clock runs while you browse',
    leave: 'Leave Shop',
    bought: (price, name) => `Spent ${price}s on ${name}`,
  },

  result: {
    clear: 'Chapter Clear',
    over: 'Run Over',
    play: 'Game Time',
    pen: 'Hit Penalty',
    spend: 'Spent',
    ref: 'Kill Refund',
    seed: 'SEED',
    owned: 'Upgrades',
    none: 'None',
    retry: 'Retry Same Seed',
    fresh: 'New Run',
    copied: 'Seed copied',
    listSep: ', ',
  },

  pause: {
    title: 'Paused',
    note1: 'The clock has stopped.',
    note2: "This overlay is deliberately opaque — pausing shouldn't become a back door for studying the battlefield with the clock off.",
    resume: 'Resume',
    quit: 'Quit to Title',
  },

  upgrades: {
    blade: { name: 'Blade', desc: 'Damage +60%, but hit penalty +40%.' },
    gale: { name: 'Gale', desc: 'Move speed +16%, dash cooldown -35%.' },
    tough: { name: 'Grit', desc: 'Hit penalty -35%, but damage -15%.' },
    reach: { name: 'Long Blade', desc: 'Attack range +45%, slash arc slightly wider.' },
    rapid: { name: 'Flurry', desc: 'Attack speed +40%, damage per hit -10%.' },
    exec: { name: 'Execute', desc: 'Enemies below 30% HP are instantly killed by a slash.' },
    greed: { name: 'Greed', desc: 'All future second-spending is -35%.' },
    stasis: { name: 'Stasis', desc: 'Dashing slows the whole battlefield 60% for 0.55s.' },
    riposte: { name: 'Riposte', desc: 'Damage +85% for 2s after getting hit.' },
    abacus: { name: 'Abacus', desc: 'Refund 0.5s for every enemy killed.' },
    throw: {
      name: 'Throwing Blade',
      desc: 'Every slash also throws a blade toward your cursor (55% damage). <b>You no longer have to be in melee range to deal damage.</b>',
    },
    phantom: {
      name: 'Afterimage',
      desc: 'Dashing through an enemy deals 120% damage, once per enemy per dash. <b>Dash is no longer just an escape button.</b>',
    },
    charge: {
      name: 'Charge Slash',
      desc: 'Hold LMB for 0.5s to charge, release for a 260% damage 360° slash. <b>Cost: holding LMB no longer auto-attacks.</b>',
    },
  },
};

export const DICTS: Record<Locale, Strings> = { zh, en };
