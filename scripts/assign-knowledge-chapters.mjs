import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const computerChapters = [
  { key: 'hardware', label: '计算机硬件基础', ids: range(1, 17) },
  { key: 'software', label: '计算机软件基础', ids: range(18, 25) },
  { key: 'network', label: '网络技术基础', ids: range(26, 46) },
  { key: 'security', label: '信息安全基础', ids: range(47, 53) },
  { key: 'emerging', label: '信息新技术', ids: range(54, 57) },
];

const powerSystemChapters = [
  { key: 'system-basics', label: '电力系统的基本概念和运行的基本要求', ids: [1, 3, 4, 5, ...range(14, 18)] },
  { key: 'energy-flow', label: '电能的生产、传输、分配和使用的基本概念', ids: range(19, 34) },
  { key: 'voltage-quality', label: '电力系统的电压等级和电能质量', ids: range(35, 43) },
  { key: 'storage', label: '新型储能技术的作用、分类和工作原理', ids: range(66, 70) },
  { key: 'protection', label: '电力系统继电保护的基本概念和作用', ids: [...range(44, 51), ...range(71, 75)] },
  { key: 'equipment', label: '输变配设备的主要类型和作用', ids: [2, ...range(6, 13), ...range(52, 65), 76] },
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function updateFile(filename, chapters, version) {
  const file = path.join(root, 'data', filename);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chapterById = new Map();
  chapters.forEach(chapter => chapter.ids.forEach(id => {
    if (chapterById.has(id)) throw new Error(`${filename}: ${id}重复归类`);
    chapterById.set(id, chapter.key);
  }));
  payload.items.forEach(item => {
    if (!chapterById.has(item.id)) throw new Error(`${filename}: ${item.id}未归类`);
    item.chapter = chapterById.get(item.id);
  });
  if (chapterById.size !== payload.items.length) throw new Error(`${filename}: 章节索引数量与条目数量不一致`);
  payload.metadata.version = version;
  payload.metadata.presentation = 'chaptered_single_item_editable';
  payload.metadata.chapters = chapters.map(({ key, label, ids }) => ({ key, label, count: ids.length }));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

updateFile('computer-basics.json', computerChapters, 'computer_basics_57_chapters_v2');
updateFile('power-system-basics.json', powerSystemChapters, 'power_system_basics_76_chapters_v2');
