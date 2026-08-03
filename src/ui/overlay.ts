export interface CardSpec {
  kind: string;
  name: string;
  desc: string;
  price: { cls: 'cost' | 'free' | 'est'; text: string };
  disabled?: boolean;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/**
 * 全屏覆盖层：菜单、奖励、商店、结算、暂停都走这里。
 *
 * `opaque` 是给暂停用的 —— 决策界面开始计时之后，一个半透明的暂停界面
 * 就成了「停表慢慢观察战场」的后门。完全不透明才能让暂停没有信息收益。
 */
export class Overlay {
  private root = el('ov');
  private inner = el('ovinner');
  private toastEl = el('toast');
  private toastTimer = 0;

  get isOpen(): boolean { return this.root.classList.contains('on'); }

  show(html: string, opts: { opaque?: boolean } = {}): void {
    this.inner.innerHTML = html;
    this.root.classList.add('on');
    this.root.classList.toggle('opaque', opts.opaque === true);
  }

  hide(): void {
    this.root.classList.remove('on', 'opaque');
    this.inner.innerHTML = '';
  }

  /** 绑定卡片点击；同时把数字键 1–4 接到同样的回调上。 */
  onCards(handler: (index: number) => void): void {
    this.inner.querySelectorAll<HTMLElement>('.card').forEach((node) => {
      node.addEventListener('click', () => {
        if (node.classList.contains('taken')) return;
        handler(Number(node.dataset.i));
      });
    });
  }

  onClick(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener('click', handler);
  }

  /** 数字键选卡。返回 true 表示这次按键被消费掉了。 */
  pressCard(index: number): boolean {
    const cards = this.inner.querySelectorAll<HTMLElement>('.card');
    const node = cards[index];
    if (!node || node.classList.contains('taken')) return false;
    node.click();
    return true;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), 1800);
  }
}

export function cardHtml(index: number, c: CardSpec): string {
  return `
    <div class="card${c.disabled ? ' taken' : ''}" data-i="${index}">
      <div class="k"><span class="key">${index + 1}</span>${c.kind}</div>
      <div class="n">${c.name}</div>
      <div class="d">${c.desc}</div>
      <div class="p ${c.price.cls}">${c.price.text}</div>
    </div>`;
}

export const cardsHtml = (cards: readonly CardSpec[]): string =>
  `<div class="cards">${cards.map((c, i) => cardHtml(i, c)).join('')}</div>`;
