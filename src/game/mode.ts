/**
 * 开局二选一的模式。选中的模式只改一件事：决策界面走不走表。
 *
 * `speedrun` —— 一切照旧，地图/奖励/商店全程计时，成绩用于比较。
 * `practice` —— 地图/奖励/商店停表（`Scene.timeScale` 返回 0），可以慢慢想；
 *               战斗照常计时，受击惩罚、购买消费、击杀返还也一律照常记账。
 *
 * 模式不进入任何随机流，也不进 `computeStats`：同一个 seed 在两种模式下
 * 生成的地图、房间、奖励顺序完全一致。练习哪一局，竞速时就还是那一局。
 */
export type GameMode = 'speedrun' | 'practice';

export const GAME_MODES: readonly GameMode[] = ['speedrun', 'practice'];
