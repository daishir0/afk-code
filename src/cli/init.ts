/**
 * Initialize ~/.afk-code/ memory and personality files.
 */

import { mkdir, writeFile, access, readdir, symlink, lstat, readlink } from 'fs/promises';
import { homedir } from 'os';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const AFK_CODE_DIR = `${homedir()}/.afk-code`;
const CLAUDE_SKILLS_DIR = `${homedir()}/.claude/skills`;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const FILES: Record<string, string> = {
  'SOUL.md': `# SOUL.md - Claudeの魂

## アイデンティティ
名前: Claude（あなたのパーソナルAIアシスタント）
性格: 明るく前向きで誠実。要件に柔軟に対応。
<!-- 呼びかけ方をカスタマイズ: 例「必ず『○○さん！』」 -->

## コアバリュー
1. ユーザーの時間を大切にする。不要な報告はしない。
2. 自律的に行動しつつ、重要な判断はユーザーに委ねる。
3. 学んだことを記憶に残し、同じ説明を繰り返さない。
4. 率直で曖昧さを避ける。

## 自律行動の指針
- Heartbeat時: 必要最小限の確認。問題なければ短く。
- 問題検出時: 即座にSlack報告。解決案も添える。
- 学習時: MEMORY.mdに記録。次回以降に活用。
`,
  'HEARTBEAT.md': `# HEARTBEAT.md - 定期チェックリスト

## 毎回確認
- [ ] 今日の天気 - weatherスキル使用
- [ ] Apple Remindersに今日期限のタスクがないか
- [ ] 日次ノート（memory/YYYY-MM-DD.md）が存在するか。なければ作成。

## 条件付き
- [ ] MEMORY.mdの最終更新が3日以上前なら、日次ノートからキュレーション
- [ ] 前回Heartbeatで未完了アクションがあれば確認

## 報告基準
- 天気に大きな変化（警報等）がある場合のみ報告
- 期限切れ・当日期限のリマインダーがある場合のみ報告
- 特筆事項なし → 「Heartbeat完了、特記事項なし」
`,
  'MEMORY.md': `# MEMORY.md - 長期記憶

## ユーザープロファイル
<!-- カスタマイズ: 名前、拠点などを記入 -->

## 重要な設定・環境
<!-- 環境情報をここに蓄積 -->

## 学んだこと
<!-- Heartbeatや日常のやり取りで学んだことをここに蓄積 -->

## フォローアップ
<!-- 継続的に追跡すべき事項 -->
`,
  'scheduler.yaml': `heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23
    end: 7
  max_consecutive_skips: 3
`,
  'cron.yaml': `jobs:
  - id: morning-briefing
    name: 朝のブリーフィング
    schedule: "0 8 * * *"
    prompt: |
      おはようございます。朝のブリーフィングの時間です。
      1. 今日の天気
      2. 昨日のメモリから重要なフォローアップ
      3. 今日の予定があればリマインド
    enabled: true

  - id: evening-summary
    name: 夕方のサマリー
    schedule: "0 18 * * 1-5"
    prompt: |
      今日の活動サマリーを作成してください。
      1. 日次ノートを確認
      2. 完了タスク・進捗を要約
      3. 明日への持ち越し事項を整理
    enabled: true

  - id: weekly-review
    name: 週次レビュー
    schedule: "0 10 * * 0"
    prompt: |
      週次レビュー。今週の日次ノートを全て確認し、
      重要な学び・成果を要約。MEMORY.mdを更新。
    enabled: true
`,
};

export async function initFiles(): Promise<void> {
  console.log('Initializing AFK Code files...\n');

  await mkdir(`${AFK_CODE_DIR}/memory`, { recursive: true });

  let created = 0;
  let skipped = 0;

  for (const [filename, content] of Object.entries(FILES)) {
    const path = `${AFK_CODE_DIR}/${filename}`;
    if (await fileExists(path)) {
      console.log(`  [skip] ${filename} (already exists)`);
      skipped++;
    } else {
      await writeFile(path, content);
      console.log(`  [created] ${filename}`);
      created++;
    }
  }

  console.log(`\nDone! Created ${created} files, skipped ${skipped}.`);
  console.log(`Files location: ${AFK_CODE_DIR}/`);

  // Install skills as symlinks to ~/.claude/skills/
  await installSkills();

  console.log('\nNext: Start the Telegram bot with `afk-code telegram`');
}

async function installSkills(): Promise<void> {
  // Find the skills/ directory relative to the package install location
  // When installed globally: <prefix>/lib/node_modules/afk-code/skills/
  // When running from source: <repo>/skills/
  const __filename = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(__filename), '..', '..');
  const bundledSkillsDir = join(packageRoot, 'skills');

  if (!(await fileExists(bundledSkillsDir))) {
    console.log('\nSkills: No bundled skills directory found.');
    return;
  }

  await mkdir(CLAUDE_SKILLS_DIR, { recursive: true });

  let linked = 0;
  let skippedSkills = 0;

  const entries = await readdir(bundledSkillsDir);
  for (const name of entries) {
    const source = join(bundledSkillsDir, name);
    const target = join(CLAUDE_SKILLS_DIR, name);

    // Check if target already exists
    try {
      const stats = await lstat(target);
      if (stats.isSymbolicLink()) {
        const existing = await readlink(target);
        if (resolve(existing) === resolve(source)) {
          skippedSkills++;
          continue; // Already linked correctly
        }
      }
      // Exists but is not our symlink - don't overwrite
      console.log(`  [skip] skill: ${name} (already exists in ~/.claude/skills/)`);
      skippedSkills++;
      continue;
    } catch {
      // Does not exist - create symlink
    }

    try {
      await symlink(source, target, 'dir');
      linked++;
    } catch (err) {
      console.error(`  [error] skill: ${name} - ${err}`);
    }
  }

  console.log(`\nSkills: ${linked} linked, ${skippedSkills} skipped (to ~/.claude/skills/).`);
}
