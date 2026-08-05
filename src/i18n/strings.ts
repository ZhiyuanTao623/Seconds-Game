import type { RoomKind } from '../game/map';
import type { ModuleId } from '../game/modules';
import type { DamageTag } from '../game/entities';

export type Locale = 'zh' | 'en';

export interface RoomText { label: string; hint: string }
export interface UpgradeText { name: string; desc: string }
export interface EvolutionText { name: string; desc: string }
export interface ModuleText { name: string; desc: string }

/**
 * 强化 id 联合类型。这里是唯一真相源 —— upgrades.ts 里每个
 * `mkUpgrade({ id: ... })` 的 id 都必须落在这个联合里，拼错字会在编译期报错，
 * 而不是运行时显示一个 undefined 的名字。
 *
 * 4 个通用强化 + 三个模组各 3 个专属强化，第一版规模到此为止。
 */
export type UpgradeId =
  | 'un_gale' | 'un_blade' | 'un_tough' | 'un_abacus'
  | 'bl_pierce' | 'bl_return' | 'bl_mark'
  | 'da_flash' | 'da_break' | 'da_ghost'
  | 'ch_release' | 'ch_shock' | 'ch_after';

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
    /** 模组名 + 已持有强化数 + 已完成进化数，rightbox 顶部常驻一行。 */
    module: (moduleName: string, upgradeCount: number, evolutionCount: number) => string;
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

  moduleSelect: {
    title: string;
    body: string;
    kind: string;
    pick: string;
  };

  modules: Record<ModuleId, ModuleText>;

  map: {
    hint: string;
    mendToast: (cost: number, cut: string) => string;
    /** `skippedLabel` 是被跳过那一层的房型名字；为空串表示这一层没有内容（极端情况）。 */
    shortcutToast: (cost: number, skippedLabel: string, elite: boolean) => string;
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
    total: string;
    clockNote: string;
    free: string;
    got: (name: string) => string;
    evolved: (name: string) => string;
  };

  evolutions: Record<UpgradeId, { a: EvolutionText; b: EvolutionText }>;

  shop: {
    title: string;
    sold: string;
    body: string;
    /** `total` 参数已经带好单位（比如 `8.4s`），只管往句子里嵌 */
    total: (total: string) => string;
    clockNote: string;
    leave: string;
    /** 第 4 槽「随机折扣强化」价签前缀 */
    discount: string;
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
    module: string;
    owned: string;
    none: string;
    retry: string;
    fresh: string;
    copied: string;
    listSep: string;
    /** 「模组核心伤害占比」小节标题；具体标签名走 damageTag。 */
    damage: string;
    damageNone: string;
    damageTag: Record<DamageTag, string>;
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
    module: (moduleName, upgradeCount, evolutionCount) =>
      `${moduleName} · 强化 ${upgradeCount} · 进化 ${evolutionCount}`,
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

  moduleSelect: {
    title: '选 择 模 组',
    body: '本局不可更改。三个模组各自动了一条不同的操作前提。',
    kind: '模组',
    pick: '选择',
  },

  modules: {
    blade: {
      name: '飞刃',
      desc: '每次挥砍同时向瞄准方向发射一枚飞刃（伤害 40%）。近战挥砍仍是主要输出，飞刃用来提前削血、追击射手、隔墙消耗。',
    },
    dash: {
      name: '掠影',
      desc: '冲刺穿过敌人时造成 85% 伤害，每次冲刺对同一敌人只结算一次。把原本纯防御的冲刺变成一份可以主动兑现的输出资源。',
    },
    charge: {
      name: '蓄势',
      desc: '左键改为蓄力键：按住 0.6 秒松开打出 220% 伤害的 360° 全向斩，蓄力中移速 -28%。重点不是等待，是判断安全窗口。',
    },
  },

  map: {
    hint: '选 择 路 线 —— 时 钟 正 在 走',
    mendToast: (cost, cut) => `花费 ${cost}s，消除了 ${cut}s 惩罚`,
    shortcutToast: (cost, skippedLabel, elite) =>
      elite
        ? `花费 ${cost}s 跳过一层精英房 —— 失去一次进化机会`
        : skippedLabel
          ? `花费 ${cost}s 跳过一层「${skippedLabel}」`
          : `花费 ${cost}s 跳过一整层`,
  },

  rooms: {
    combat: { label: '战斗房', hint: '常规敌人 · 清空后 3 选 1 免费强化' },
    elite: { label: '精英房', hint: '更多更硬的敌人 · 清空后 3 选 1，稳定拿到进化' },
    shop: { label: '秒 · 商店', hint: '用秒数直接买强化 · 逛店期间时钟在走' },
    mend: { label: '时间修复站', hint: '花秒数抹掉一部分已累计的受击惩罚' },
    shortcut: { label: '捷径门', hint: '花秒数跳过一整层 · 少打一场，也少拿一次奖励' },
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
    eliteKind: '进化',
    eliteCleared: '精英已击破',
    eliteBody: '选一个强化你的构筑；另一条分支不会因此消失，但选定之后这个强化就完成进化了。',
    total: '当前总计',
    evolved: (name) => `进化 ${name}`,
  },

  evolutions: {
    un_gale: {
      a: { name: '迅捷', desc: '总移速提升至 +22%，冲刺距离额外 +12%。' },
      b: { name: '轻步', desc: '移速维持 +12%，冲刺冷却总缩短至 -32%，冲刺距离 -8%。' },
    },
    un_blade: {
      a: { name: '孤注', desc: '总伤害提升至 +52%，受击时间惩罚提升至 +40%。' },
      b: { name: '稳刃', desc: '总伤害提升至 +34%，移除受击时间惩罚的增加。' },
    },
    un_tough: {
      a: { name: '铁壁', desc: '受击时间惩罚降至 -42%，伤害降至 -16%。' },
      b: { name: '适应', desc: '受击时间惩罚维持 -22%，连击税窗口从 5.0s 缩短到 3.2s。' },
    },
    un_abacus: {
      a: { name: '薄利多销', desc: '所有非 Boss 击杀统一返还 0.45s（重甲/医疗兵不再额外加成）。' },
      b: { name: '高额结算', desc: '普通敌人仍返还 0.25s，重甲/医疗兵返还 0.75s，精英房清空额外返还 1.0s。' },
    },
    bl_pierce: {
      a: { name: '无阻', desc: '最多穿透 3 个敌人，每次穿透后伤害仅降低 15%。适合敌人密集的房间。' },
      b: { name: '贯心', desc: '穿透第一个敌人后，对第二个敌人造成 +80% 伤害，命中后立即消失。' },
    },
    bl_return: {
      a: { name: '归刃', desc: '飞刃返回速度提升至 820px/s，返回伤害 +35%。' },
      b: { name: '环身', desc: '飞刃返回玩家后环绕 0.8 秒，环绕期间触碰敌人各造成一次飞刃伤害。' },
    },
    bl_mark: {
      a: { name: '猎印', desc: '刃印最多提升至 5 层，每层使普通挥砍伤害 +5%，消耗时仍造成额外伤害。' },
      b: { name: '爆印', desc: '刃印叠满 3 层时自动引爆：对目标造成 90% 伤害，周围 90px 内敌人溅射 45% 伤害。' },
    },
    da_flash: {
      a: { name: '无间', desc: '单次冲刺最多减少 0.75s 冷却；穿过至少 3 个敌人时冲刺结束获得 0.15s 额外无敌。' },
      b: { name: '精准闪避', desc: '在险境中起跳（敌方弹即将命中/冲锋兵正在冲刺）的这次冲刺，结束后返还 55% 冷却。' },
    },
    da_break: {
      a: { name: '碎甲', desc: '破阵状态下的敌人受到所有伤害来源 +30%（Boss +18%），持续时间不变。' },
      b: { name: '追杀', desc: '击杀处于破阵状态的敌人时，冲刺冷却 -0.35s，移速 +20% 持续 1.5s（不叠加，只刷新）。' },
    },
    da_ghost: {
      a: { name: '双生残影', desc: '冲刺起点和终点各留一个残影，每个伤害为 dmg × 65%，同一敌人可以各中一次。' },
      b: { name: '延迟猎杀', desc: '残影延迟提升至 0.75s，伤害提升至 dmg × 135%，爆发前显示清晰的警示范围。' },
    },
    ch_release: {
      a: { name: '完美时机', desc: '精准窗口缩短至 0.58–0.64s，伤害提升至 dmg × 360%，命中 ≥2 个敌人额外减 0.30s 冲刺冷却。' },
      b: { name: '宽容节拍', desc: '精准窗口扩大至 0.48–0.78s，伤害为 dmg × 300%，一个敌人都没命中时后摇再打对折。' },
    },
    ch_shock: {
      a: { name: '封招', desc: '被打断的敌人额外硬直 1.2 秒（完全冻结），下一次冷却延长至 ×1.4。' },
      b: { name: '反震', desc: '每成功打断一个敌人，本次蓄力斩额外造成 dmg × 35% 伤害，最多按 3 层计算。' },
    },
    ch_after: {
      a: { name: '二重余震', desc: '第一段伤害降至 dmg × 55%，额外在 0.75s 时触发第二段 dmg × 85% 伤害。' },
      b: { name: '扩散余震', desc: '余震半径提升至蓄力范围 × 135%，伤害不变，命中敌人时附带一次强击退。' },
    },
  },

  shop: {
    title: '秒 · 商 店',
    sold: '已 售 出',
    body: '你永远买得起 —— 因为代价直接记在你的计时器上。',
    total: (total) => `当前总计 ${total} ·`,
    clockNote: '逛店也在计时',
    leave: '离 开 商 店',
    discount: '折扣',
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
    module: '模组',
    owned: '持有强化',
    none: '无',
    retry: '同 一 SEED 再 跑',
    fresh: '换 一 局',
    copied: 'SEED 已复制',
    listSep: '、',
    damage: '伤害占比',
    damageNone: '本局未造成伤害',
    damageTag: {
      MELEE: '普通攻击',
      BLADE: '飞刃',
      DASH: '掠影',
      CHARGE: '蓄势',
      EXPLOSION: '引爆',
      AFTEREFFECT: '延迟打击',
    },
  },

  pause: {
    title: '已 暂 停',
    note1: '时钟已停。',
    note2: '这块遮罩是故意画满的 —— 暂停不该变成「停表慢慢看清场面」的后门。',
    resume: '继 续',
    quit: '回 标 题',
  },

  upgrades: {
    un_gale: { name: '疾风', desc: '移速 +12%，冲刺冷却 -12%。' },
    un_blade: { name: '利刃', desc: '伤害 +22%，受击时间惩罚 +15%。' },
    un_tough: { name: '韧体', desc: '受击时间惩罚 -22%，伤害 -6%。' },
    un_abacus: { name: '精算', desc: '每击杀一个非 Boss 敌人返还 0.25s。' },
    bl_pierce: { name: '贯刃', desc: '飞刃可以穿透 1 个敌人，穿透后伤害降至 75%。' },
    bl_return: { name: '回旋', desc: '飞刃达到最大距离或撞墙时飞回玩家，去程和回程各能命中一次。' },
    bl_mark: { name: '刃印', desc: '飞刃命中敌人施加刃印（最多 3 层，持续 3.0s），普通挥砍消耗时每层多打 20% 伤害。' },
    da_flash: { name: '连闪', desc: '每穿过一个新敌人，冲刺冷却 -0.15s，单次冲刺最多减 0.45s。' },
    da_break: { name: '破阵', desc: '被冲刺穿过的敌人进入破阵状态：普通挥砍伤害 +20%（Boss +12%），持续 1.6s。' },
    da_ghost: { name: '残影', desc: '冲刺结束后在起点留下残影，0.45s 后爆发，半径 75px，伤害 dmg × 75%。' },
    ch_release: { name: '精准释放', desc: '蓄力达到 0.55–0.68s 时松开：伤害提升至 dmg × 280%，后摇降至 atkCd × 1.3。' },
    ch_shock: { name: '震荡', desc: '蓄力攻击可以打断冲锋兵/射手/重甲/医疗兵的预警动作（Boss 无效）。' },
    ch_after: { name: '余震', desc: '蓄力攻击释放后原地留一个余震区域，0.35s 后触发，伤害 dmg × 65%。' },
  },
};

const en: Strings = {
  meta: { title: 'SECONDS', htmlLang: 'en' },

  hud: {
    play: 'Game', pen: 'Hits', spend: 'Spent', ref: 'Refund',
    floor: (floor, total) => `Floor ${floor} / ${total}`,
    seed: (seed) => `SEED ${seed}`,
    tax: (mult, secondsLeft) => `Combo tax ×${mult} · clears in ${secondsLeft}s`,
    module: (moduleName, upgradeCount, evolutionCount) =>
      `${moduleName} · Upgrades ${upgradeCount} · Evolutions ${evolutionCount}`,
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

  moduleSelect: {
    title: 'Choose a Module',
    body: 'This choice is locked in for the run. Each module rewrites a different core action.',
    kind: 'Module',
    pick: 'Pick',
  },

  modules: {
    blade: {
      name: 'Bladecast',
      desc: 'Every slash also throws a blade toward your cursor (40% damage). Melee is still your main damage — the blade chips in, chases shooters, and reaches through walls of enemies.',
    },
    dash: {
      name: 'Afterimage',
      desc: 'Dashing through an enemy deals 85% damage, once per enemy per dash. Turns the dash from a pure escape button into something you can cash in for damage.',
    },
    charge: {
      name: 'Overcharge',
      desc: 'LMB becomes a charge button: hold 0.6s and release for a 220% damage 360° slash; move speed -28% while charging. The skill is reading the safe window, not just holding the button.',
    },
  },

  map: {
    hint: 'Choose a route — the clock is running',
    mendToast: (cost, cut) => `Spent ${cost}s, cleared ${cut}s of penalty`,
    shortcutToast: (cost, skippedLabel, elite) =>
      elite
        ? `Spent ${cost}s to skip a floor of Elite — one evolution chance gone`
        : skippedLabel
          ? `Spent ${cost}s to skip a floor of ${skippedLabel}`
          : `Spent ${cost}s to skip a whole floor`,
  },

  rooms: {
    combat: { label: 'Combat', hint: 'Regular enemies · clear it for a free pick from 3 upgrades' },
    elite: { label: 'Elite', hint: 'More, tougher enemies · clear it for a free pick from 3, weighted toward evolutions' },
    shop: { label: 'Shop', hint: 'Spend seconds on upgrades directly · the clock runs while you browse' },
    mend: { label: 'Time Mend', hint: 'Spend seconds to wipe part of your accumulated hit penalty' },
    shortcut: { label: 'Shortcut', hint: 'Spend seconds to skip a whole floor · one less fight, one less reward' },
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
    eliteKind: 'Evolution',
    eliteCleared: 'Elite Defeated',
    eliteBody: "Pick one to deepen your build. The branch you don't pick doesn't vanish on its own — but once you choose, this upgrade is done evolving.",
    total: 'Current total',
    evolved: (name) => `Evolved ${name}`,
  },

  evolutions: {
    un_gale: {
      a: { name: 'Fleetfoot', desc: 'Total move speed becomes +22%; dash distance gets an extra +12%.' },
      b: { name: 'Featherstep', desc: 'Move speed stays +12%; dash cooldown becomes -32% total; dash distance -8%.' },
    },
    un_blade: {
      a: { name: 'All In', desc: 'Total damage becomes +52%; hit penalty becomes +40%.' },
      b: { name: 'Steady Edge', desc: 'Total damage becomes +34%; removes the hit-penalty increase entirely.' },
    },
    un_tough: {
      a: { name: 'Bulwark', desc: 'Hit penalty drops to -42%; damage drops to -16%.' },
      b: { name: 'Adapt', desc: 'Hit penalty stays -22%; combo tax window shortens from 5.0s to 3.2s.' },
    },
    un_abacus: {
      a: { name: 'Volume Discount', desc: 'Every non-Boss kill refunds a flat 0.45s (brutes/medics lose their extra bonus).' },
      b: { name: 'Premium Settlement', desc: 'Regular kills still refund 0.25s; brutes/medics refund 0.75s; clearing an Elite room refunds an extra 1.0s.' },
    },
    bl_pierce: {
      a: { name: 'Unhindered', desc: 'Pierces up to 3 enemies; damage drops only 15% per pierce. Great in crowded rooms.' },
      b: { name: 'Heartpierce', desc: 'After piercing the first enemy, deals +80% damage to a second target, then disappears.' },
    },
    bl_return: {
      a: { name: 'Homing Edge', desc: 'Return speed increases to 820px/s; return-hit damage +35%.' },
      b: { name: 'Ring Guard', desc: 'After returning, the blade orbits you for 0.8s, dealing one hit to each enemy it touches.' },
    },
    bl_mark: {
      a: { name: "Hunter's Mark", desc: 'Marks cap at 5 stacks; each stack adds +5% melee damage against the target, and consuming still deals bonus damage.' },
      b: { name: 'Detonating Mark', desc: 'At 3 stacks the mark auto-detonates: 90% damage to the target, 45% splash to enemies within 90px.' },
    },
    da_flash: {
      a: { name: 'Slipstream', desc: 'Dash cooldown reduction caps at 0.75s per dash; hitting 3+ enemies grants 0.15s bonus i-frames when the dash ends.' },
      b: { name: 'Perfect Dodge', desc: 'If you dash while a hostile bullet is about to land or a charger is mid-charge, this dash refunds 55% of its cooldown when it ends.' },
    },
    da_break: {
      a: { name: 'Shatter Armor', desc: 'Broken enemies take +30% damage from every source (+18% for the Boss); duration unchanged.' },
      b: { name: 'Finishing Rush', desc: 'Killing a broken enemy cuts dash cooldown by 0.35s and grants +20% move speed for 1.5s (refreshes, does not stack).' },
    },
    da_ghost: {
      a: { name: 'Twin Afterimage', desc: 'Leaves an afterimage at both the dash start and end points, each dealing dmg × 65%; the same enemy can be hit by both.' },
      b: { name: 'Delayed Ambush', desc: 'Detonation delay increases to 0.75s and damage to dmg × 135%; a clear warning ring shows the blast radius beforehand.' },
    },
    ch_release: {
      a: { name: 'Perfect Timing', desc: 'Precise window narrows to 0.58–0.64s; damage rises to dmg × 360%; hitting 2+ enemies cuts an extra 0.30s off dash cooldown.' },
      b: { name: 'Generous Tempo', desc: 'Precise window widens to 0.48–0.78s; damage is dmg × 300%; whiffing entirely halves the recovery again.' },
    },
    ch_shock: {
      a: { name: 'Stunning Blow', desc: 'Interrupted enemies are fully stunned for 1.2s on top of a cooldown extended to ×1.4.' },
      b: { name: 'Rebound', desc: 'Each enemy interrupted this swing adds dmg × 35% bonus damage to it, capped at 3 stacks.' },
    },
    ch_after: {
      a: { name: 'Double Aftershock', desc: 'First hit drops to dmg × 55%; a second hit fires at 0.75s dealing dmg × 85%.' },
      b: { name: 'Spreading Aftershock', desc: 'Radius grows to 135% of the charged swing range, damage unchanged, and it adds a strong knockback on hit.' },
    },
  },

  shop: {
    title: 'Seconds · Shop',
    sold: 'Sold',
    body: 'You can always afford it — the cost is charged straight to your clock.',
    total: (total) => `Current total ${total} ·`,
    clockNote: 'the clock runs while you browse',
    leave: 'Leave Shop',
    discount: 'Discount',
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
    module: 'Module',
    owned: 'Upgrades',
    none: 'None',
    retry: 'Retry Same Seed',
    fresh: 'New Run',
    copied: 'Seed copied',
    listSep: ', ',
    damage: 'Damage Breakdown',
    damageNone: 'No damage dealt this run',
    damageTag: {
      MELEE: 'Melee',
      BLADE: 'Blade',
      DASH: 'Dash',
      CHARGE: 'Charge',
      EXPLOSION: 'Detonation',
      AFTEREFFECT: 'Delayed Strike',
    },
  },

  pause: {
    title: 'Paused',
    note1: 'The clock has stopped.',
    note2: "This overlay is deliberately opaque — pausing shouldn't become a back door for studying the battlefield with the clock off.",
    resume: 'Resume',
    quit: 'Quit to Title',
  },

  upgrades: {
    un_gale: { name: 'Gale', desc: 'Move speed +12%, dash cooldown -12%.' },
    un_blade: { name: 'Blade', desc: 'Damage +22%, hit penalty +15%.' },
    un_tough: { name: 'Grit', desc: 'Hit penalty -22%, damage -6%.' },
    un_abacus: { name: 'Abacus', desc: 'Refund 0.25s for every non-Boss kill.' },
    bl_pierce: { name: 'Pierce', desc: 'Your blade pierces 1 enemy; damage after piercing drops to 75%.' },
    bl_return: { name: 'Return', desc: 'The blade flies back after reaching max range or hitting a wall; can hit once on the way out and once on the way back.' },
    bl_mark: { name: 'Mark', desc: 'Blade hits apply a mark (up to 3 stacks, 3.0s). A normal slash consumes all stacks for +20% damage per stack.' },
    da_flash: { name: 'Flash Step', desc: 'Each new enemy pierced during a dash cuts 0.15s off cooldown, capped at 0.45s per dash.' },
    da_break: { name: 'Break Formation', desc: 'Enemies dashed through are broken: melee damage +20% (+12% for the Boss) for 1.6s.' },
    da_ghost: { name: 'Afterimage', desc: 'Leaves an afterimage at the dash start point that detonates 0.45s later, radius 75px, dealing dmg × 75%.' },
    ch_release: { name: 'Precise Release', desc: 'Releasing between 0.55–0.68s charge: damage rises to dmg × 280%, recovery drops to atkCd × 1.3.' },
    ch_shock: { name: 'Shockwave', desc: 'Charged swings interrupt the telegraph of chargers, shooters, brutes, and medics (not the Boss).' },
    ch_after: { name: 'Aftershock', desc: 'A charged swing leaves an aftershock at your feet, triggering 0.35s later for dmg × 65%.' },
  },
};

export const DICTS: Record<Locale, Strings> = { zh, en };
