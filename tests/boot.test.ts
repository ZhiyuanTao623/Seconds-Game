// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from '../src/app';
import { nodePos } from '../src/render/drawMap';
import { setLocale, toggleLocale } from '../src/i18n/i18n';

/**
 * 启动冒烟测试。
 *
 * 类型检查管不到 DOM 接线：少一个 id、场景跳转接错、暂停把界面顶掉之后
 * 没重建 —— 这些都只会在真的跑起来的时候炸。这里用 jsdom 把整个 App
 * 从标题页一路开到战斗房，专门抓这一类问题。
 */

const CANVAS_RECT = { left: 0, top: 0, width: 1000, height: 620, right: 1000, bottom: 620, x: 0, y: 0 };

let frame: FrameRequestCallback | null = null;
let now = 0;

function pump(ms = 20): void {
  now += ms;
  const cb = frame;
  frame = null;
  cb?.(now);
}

function mouse(canvas: HTMLCanvasElement, type: string, x: number, y: number, button = 0): void {
  canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }));
}

beforeEach(() => {
  // 用真的 index.html，这样删掉某个必需的元素 id 会立刻在这里暴露
  const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

  // i18n 模块内的 current locale 是模块级单例，会跨 test 存活；
  // jsdom 的 navigator.language 也不受我们控制。显式定死一个初始语言，
  // 不然这些断言会跟着运行环境的语言设置飘。
  setLocale('zh');

  frame = null;
  // App 的 last 用 performance.now() 初始化，假时钟必须从同一个原点起步，
  // 否则第一帧的 dt 是个大负数
  now = performance.now();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1; });

  // jsdom 没有 2D 上下文，也不做布局；两样都补上桩
  const noop = new Proxy({}, {
    get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => undefined),
    set: (t: Record<string, unknown>, k: string, v: unknown) => { t[k] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.getBoundingClientRect = (() => CANVAS_RECT) as never;
});

afterEach(() => { vi.unstubAllGlobals(); });

const canvasEl = (): HTMLCanvasElement => document.getElementById('c') as HTMLCanvasElement;
const overlayText = (): string => document.getElementById('ovinner')?.textContent ?? '';
const overlayOpen = (): boolean => document.getElementById('ov')?.classList.contains('on') ?? false;

/** 开局并停在地图上。 */
function startRun(seed = '20260802'): { app: App; canvas: HTMLCanvasElement } {
  const canvas = canvasEl();
  const app = new App(canvas);

  (document.getElementById('seed') as HTMLInputElement).value = seed;
  document.getElementById('start')!.click();
  pump();

  return { app, canvas };
}

describe('启动与场景流转', () => {
  it('打开就是标题页，SEED 输入框和开始按钮都在', () => {
    new App(canvasEl());
    expect(overlayOpen()).toBe(true);
    expect(overlayText()).toContain('时间即货币');
    expect(document.getElementById('seed')).not.toBeNull();
    expect(document.getElementById('start')).not.toBeNull();
  });

  it('开局后进入地图，HUD 显示 seed 与层数', () => {
    startRun('20260802');

    expect(overlayOpen(), '地图界面不该有覆盖层').toBe(false);
    expect(document.getElementById('seedinfo')!.textContent).toBe('SEED 20260802');
    expect(document.getElementById('nodeinfo')!.textContent).toContain('第 1 层');
  });

  it('地图界面在计时 —— 犹豫也是要付钱的', () => {
    const { app } = startRun();
    const before = app.run.ledger.total;

    for (let i = 0; i < 30; i++) pump(20);

    expect(app.run.ledger.total, '停在地图上时钟没走').toBeGreaterThan(before);
  });

  it('点第 1 层的节点能进战斗房，敌人真的生成了', () => {
    const { app, canvas } = startRun();

    const entry = app.run.map.nodes.get(app.run.available[0]!)!;
    const pos = nodePos(entry);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    expect(app.run.current?.id).toBe(entry.id);
    expect(app.scene.player, '战斗场景应该有玩家').toBeTruthy();
    expect(overlayOpen()).toBe(false);
  });

  it('战斗中时钟继续走，玩家会随输入移动', () => {
    const { app, canvas } = startRun();
    const entry = app.run.map.nodes.get(app.run.available[0]!)!;
    const pos = nodePos(entry);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    const player = app.scene.player!;
    const startX = player.x;
    const before = app.run.ledger.total;

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    for (let i = 0; i < 20; i++) pump(20);

    expect(player.x, '按住 D 没有向右移动').toBeGreaterThan(startX);
    expect(app.run.ledger.total).toBeGreaterThan(before);
  });
});

describe('一整局跑到底', () => {
  /** 走到某个节点并进入它。 */
  function enter(app: App, canvas: HTMLCanvasElement, nodeId: string): void {
    app.run.available = [nodeId];
    pump();
    const pos = nodePos(app.run.map.nodes.get(nodeId)!);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();
  }

  /** 清场并把过场时间推完。 */
  function clearRoom(app: App): void {
    (app.scene as unknown as { world: { enemies: unknown[] } }).world.enemies = [];
    for (let i = 0; i < 60; i++) pump(20);
  }

  it('战斗清空 → 奖励界面 → 拿卡 → 回到地图', () => {
    const { app, canvas } = startRun();
    enter(app, canvas, app.run.available[0]!);
    clearRoom(app);

    expect(overlayText()).toContain('房 间 已 清 空');
    const cards = document.querySelectorAll('#ovinner .card');
    expect(cards.length).toBe(2); // 战斗房 2 选 1

    (cards[0] as HTMLElement).click();
    pump();

    expect(app.run.owned.length).toBe(1);
    expect(overlayOpen(), '拿完卡该回到地图').toBe(false);
    expect(app.run.available.length).toBeGreaterThan(0);
  });

  it('打完 Boss 进结算页，停表并给出评级', () => {
    const { app, canvas } = startRun();
    enter(app, canvas, app.run.map.bossId);
    clearRoom(app);

    expect(app.run.won).toBe(true);
    expect(overlayText()).toContain('章 节 通 关');
    expect(document.getElementById('grade')!.textContent).toMatch(/^[SABCD]$/);

    const frozen = app.run.ledger.total;
    for (let i = 0; i < 30; i++) pump(20);
    expect(app.run.ledger.total, '结算页该停表').toBe(frozen);
  });

  it('结算页可以用同一个 seed 直接再跑一次', () => {
    const { app, canvas } = startRun('4242');
    enter(app, canvas, app.run.map.bossId);
    clearRoom(app);

    document.getElementById('again')!.click();
    pump();

    expect(app.run.seed).toBe(4242);
    expect(app.run.ledger.total, '重跑要从 0 开始').toBeLessThan(1);
    expect(app.run.owned.length).toBe(0);
  });
});

describe('遮蔽式暂停', () => {
  it('ESC 停表，且遮罩是不透明的', () => {
    const { app } = startRun();
    for (let i = 0; i < 5; i++) pump(20);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    pump();

    const ov = document.getElementById('ov')!;
    expect(overlayText()).toContain('已 暂 停');
    expect(ov.classList.contains('opaque'), '暂停遮罩必须完全不透明，否则就是「停表观察」的后门').toBe(true);

    const frozen = app.run.ledger.total;
    for (let i = 0; i < 30; i++) pump(20);
    expect(app.run.ledger.total, '暂停期间时钟不该走').toBe(frozen);
  });

  it('恢复后时钟重新走，界面回到原来的场景', () => {
    const { app } = startRun();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    pump();

    document.getElementById('resume')!.click();
    pump();

    expect(overlayOpen(), '恢复后覆盖层该收起来').toBe(false);
    const before = app.run.ledger.total;
    for (let i = 0; i < 20; i++) pump(20);
    expect(app.run.ledger.total).toBeGreaterThan(before);
  });
});

describe('商店与奖励界面', () => {
  it('商店界面会摆出货架，并且照常计时', () => {
    const { app, canvas } = startRun();

    // 直接找一个商店节点，把它塞进可选列表（跳过中间层的战斗）
    const shop = [...app.run.map.nodes.values()].find((n) => n.kind === 'shop')!;
    app.run.available = [shop.id];
    pump();

    const pos = nodePos(shop);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    expect(overlayText()).toContain('秒 · 商 店');
    expect(document.querySelectorAll('#ovinner .card').length).toBeGreaterThan(0);

    const before = app.run.ledger.total;
    for (let i = 0; i < 20; i++) pump(20);
    expect(app.run.ledger.total, '逛店期间时钟该走').toBeGreaterThan(before);
  });

  it('买东西会记在消费账上，并真的拿到强化', () => {
    const { app, canvas } = startRun();
    const shop = [...app.run.map.nodes.values()].find((n) => n.kind === 'shop')!;
    app.run.available = [shop.id];
    pump();

    const pos = nodePos(shop);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    const spendBefore = app.run.ledger.spend;
    (document.querySelector('#ovinner .card') as HTMLElement).click();
    pump();

    expect(app.run.owned.length).toBe(1);
    expect(app.run.ledger.spend).toBeGreaterThan(spendBefore);
    expect(document.getElementById('upglist')!.textContent).toContain(app.run.owned[0]!.name);
  });

  it('时间修复站抹掉一部分受击惩罚，并留在地图上', () => {
    const { app, canvas } = startRun();
    app.run.ledger.addPenalty(20);

    const mend = [...app.run.map.nodes.values()].find((n) => n.kind === 'mend')!;
    app.run.available = [mend.id];
    pump();

    const pos = nodePos(mend);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    expect(app.run.ledger.penalty).toBeCloseTo(12, 9);
    expect(app.run.ledger.spend).toBeGreaterThan(0);
    expect(app.run.available.length, '修复完应该摊开下一批节点').toBeGreaterThan(0);
  });
});

describe('语言开关', () => {
  // 只在标题页真的可见可点，用真实的 DOM 点击
  const toggle = (): void => { document.getElementById('langToggle')!.click(); };

  it('不挂在 #hud 或 #ov 里面 —— 挂进去就会被任何覆盖层（包括标题页）盖住', () => {
    // 这条 bug 曾经真实发生过：单元测试里用 getElementById().click() 直接触发，
    // 绕过了浏览器的层级/遮挡判定，所以行为测试全过，人在浏览器里点却点不到。
    // 这里改成断言 DOM 结构本身，防止以后又被塞回某个 z-index 更低的容器里。
    const toggleEl = document.getElementById('langToggle')!;
    expect(toggleEl.closest('#hud'), 'langToggle 不该在 #hud 里').toBeNull();
    expect(toggleEl.closest('#ov'), 'langToggle 不该在 #ov 里').toBeNull();
    expect(toggleEl.parentElement).toBe(document.getElementById('wrap'));
  });

  it('只在标题页显示，开局后立刻隐藏，回标题又出现', () => {
    const { app } = startRun();
    expect(document.getElementById('langToggle')!.style.display, '开局后应该隐藏').toBe('none');

    app.toTitle();
    expect(document.getElementById('langToggle')!.style.display, '回标题应该重新出现').not.toBe('none');
  });

  it('默认中文；标题页文案、<html lang>、按钮标签都对得上', () => {
    new App(canvasEl());
    expect(overlayText()).toContain('时间即货币');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.getElementById('langToggle')!.textContent).toBe('EN');
  });

  it('点一下切到英文：标题页文案、帮助条、<html lang> 全部跟着变', () => {
    new App(canvasEl());
    toggle();

    expect(overlayText()).toContain('Time Is the Only Currency');
    expect(overlayText()).not.toContain('时间即货币');
    expect(document.documentElement.lang).toBe('en');
    expect(document.getElementById('help')!.textContent).toContain('WASD move');
    expect(document.getElementById('langToggle')!.textContent).toBe('中文');
  });

  it('再点一下切回中文', () => {
    new App(canvasEl());
    toggle();
    toggle();

    expect(overlayText()).toContain('时间即货币');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('切换语言不打断正在输入的 SEED', () => {
    new App(canvasEl());
    (document.getElementById('seed') as HTMLInputElement).value = '999';
    toggle();

    expect((document.getElementById('seed') as HTMLInputElement).value).toBe('999');
  });

  // 下面几个测的是「万一语言在游戏中途变了，重绘会不会正确响应」这条
  // 内部管线——不是通过点按钮（按钮开局后就隐藏了，见上面那条可见性测试），
  // 而是直接调 toggleLocale() 模拟变化本身。这条管线仍然值得保护：
  // App.onLocaleChange/Hud 的响应逻辑本身没有变，只是现在唯一的触发入口
  // 被收窄到了标题页。

  it('HUD 静态标签和层数文案会响应语言变化', () => {
    const { app } = startRun();
    toggleLocale();

    expect(document.getElementById('lblPlay')!.textContent).toBe('Game');
    expect(document.getElementById('lblPen')!.textContent).toBe('Hits');
    expect(app.run.floorLabel).toContain('Floor');
  });

  it('强化的 name/desc 是取值时查词典，不是构造时定死的', () => {
    const { app, canvas } = startRun();
    const entry = app.run.map.nodes.get(app.run.available[0]!)!;
    const pos = nodePos(entry);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();
    (app.scene as unknown as { world: { enemies: unknown[] } }).world.enemies = [];
    for (let i = 0; i < 60; i++) pump(20);

    const card = document.querySelector('#ovinner .card') as HTMLElement;
    card.click();
    pump();

    const upgrade = app.run.owned[0]!;
    expect(upgrade.name).toMatch(/[一-龥]/);

    toggleLocale();
    expect(upgrade.name).not.toMatch(/[一-龥]/);

    // upglist 的重画挂在下一次 Hud.update()（即下一帧）上，不是语言变化那一刻
    pump();
    expect(document.getElementById('upglist')!.textContent).toBe(upgrade.name);
  });

  it('暂停界面文案会响应语言变化', () => {
    const { app } = startRun();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    pump();
    expect(app.scene).toBeTruthy();

    toggleLocale();
    expect(overlayText()).toContain('Paused');
    expect(overlayText()).toContain('Resume');
  });

  it('商店卡片和已购强化的名字会响应语言变化', () => {
    const { app, canvas } = startRun();
    const shop = [...app.run.map.nodes.values()].find((n) => n.kind === 'shop')!;
    app.run.available = [shop.id];
    pump();
    const pos = nodePos(shop);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    toggleLocale();
    expect(overlayText()).toContain('Seconds · Shop');
    expect(overlayText()).not.toContain('秒 · 商 店');
  });
});

describe('医疗兵渲染路径', () => {
  // 单元测试只跑过 World.step，从没真的调用过 drawWorld 里医疗兵的
  // 五边形/橙色预警分支——canvas 是桩，画错了也不报错，但代码里的
  // 逻辑错误（比如访问了不存在的字段）还是会真的抛异常。这里通过一整个
  // App 走一遍完整渲染循环，唯一的断言就是「跑得完、不抛」。
  it('floor≥2 战斗房里带着医疗兵完整跑一轮渲染循环不报错', () => {
    const { app, canvas } = startRun();
    const node = [...app.run.map.nodes.values()].find((n) => n.kind === 'combat' && n.floor >= 2)!;
    expect(node, '这个 seed 的地图上应该至少有一个 floor>=2 的战斗房').toBeDefined();

    app.run.available = [node.id];
    pump();
    const pos = nodePos(node);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    const world = (app.scene as unknown as { world: { enemies: { kind: string }[] } }).world;
    expect(world.enemies.some((e) => e.kind === 'medic'), '房间里应该真的生成了医疗兵').toBe(true);

    // 推够久，让医疗兵至少完整走一轮 idle → telegraph → recover
    for (let i = 0; i < 250; i++) pump(20);
  });

  it('精英房带着医疗兵完整跑一轮渲染循环不报错', () => {
    const { app, canvas } = startRun();
    const node = [...app.run.map.nodes.values()].find((n) => n.kind === 'elite')!;

    app.run.available = [node.id];
    pump();
    const pos = nodePos(node);
    mouse(canvas, 'mousemove', pos.x, pos.y);
    mouse(canvas, 'mousedown', pos.x, pos.y);
    pump();

    for (let i = 0; i < 250; i++) pump(20);
  });
});
