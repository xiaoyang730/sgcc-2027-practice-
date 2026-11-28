import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(siteRoot, '..', '..');
const sourceDir = path.join(projectRoot, '_知识模块源文件', '03_数学基础');
const desktopSource = path.join(process.env.USERPROFILE || '', 'Desktop', '数学.txt');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : desktopSource;

const SUBJECTS = [
  { source: '高数', key: 'calculus', label: '高等数学' },
  { source: '线性代数', key: 'linear-algebra', label: '线性代数' },
  { source: '概率论', key: 'probability-statistics', label: '概率论与数理统计' },
  { source: '大学数学的应用与实践', key: 'applications', label: '大学数学的应用与实践' },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(inputPath)) fail(`找不到数学源文件：${inputPath}`);

const raw = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
const lines = raw.split('\n');
const subjectBySource = new Map(SUBJECTS.map(item => [item.source, item]));
const subjects = [];
const items = [];
let currentSubject = null;
let currentChapter = null;
let currentItem = null;

function ensureSubject(sourceLabel) {
  const definition = subjectBySource.get(sourceLabel);
  if (!definition) fail(`无法识别学科标题：${sourceLabel}`);
  currentSubject = { ...definition, chapters: [] };
  subjects.push(currentSubject);
  currentChapter = null;
  currentItem = null;
}

function addChapter(label) {
  if (!currentSubject) fail(`章节“${label}”之前缺少学科标题`);
  currentChapter = {
    key: `${currentSubject.key}-${currentSubject.chapters.length + 1}`,
    label,
    description: '',
    count: 0,
  };
  currentSubject.chapters.push(currentChapter);
  currentItem = null;
}

function addItem(title) {
  if (!currentChapter) fail(`知识点“${title}”之前缺少章节标题`);
  currentItem = {
    id: items.length + 1,
    stableId: `MATH-${String(items.length + 1).padStart(3, '0')}`,
    uid: `math-source-${items.length + 1}`,
    title: title.trim(),
    contentLines: [],
    subject: currentSubject.key,
    chapter: currentChapter.key,
  };
  items.push(currentItem);
  currentChapter.count += 1;
}

for (const sourceLine of lines) {
  const trimmed = sourceLine.trim();
  if (!trimmed) continue;
  if (subjectBySource.has(trimmed)) {
    ensureSubject(trimmed);
    continue;
  }
  const chapterMatch = trimmed.match(/^[一二三四五六七八九十]+、\s*(.+)$/);
  if (chapterMatch) {
    addChapter(chapterMatch[1].trim());
    continue;
  }
  const itemMatch = trimmed.match(/^\d+[、.]\s*(.+)$/);
  if (itemMatch) {
    addItem(itemMatch[1]);
    continue;
  }
  if (currentSubject?.key === 'applications' && !currentChapter && trimmed === '人工智能的数学基础') {
    addChapter(trimmed);
    continue;
  }
  if (!currentItem) fail(`无法归属的内容：${trimmed}`);
  currentItem.contentLines.push(trimmed);
}

for (const expected of SUBJECTS) {
  if (!subjects.some(subject => subject.key === expected.key)) fail(`缺少学科：${expected.source}`);
}
if (!items.length) fail('未解析到任何数学知识点');

const outputItems = items.map(item => ({
  id: item.id,
  stableId: item.stableId,
  uid: item.uid,
  title: item.title,
  content: item.contentLines.join('\n'),
  subject: item.subject,
  chapter: item.chapter,
}));

const payload = {
  metadata: {
    title: '数学基础知识点',
    version: 'math_basics_desktop_source_v1',
    record_count: outputItems.length,
    presentation: 'subject_chapter_single_item_readonly',
    source_note: '由桌面“数学.txt”同步生成；仅做结构化整理，未改写原知识内容。',
    subjects,
  },
  items: outputItems,
};

const txtParts = ['【模块】数学基础', ''];
const mdParts = ['# 数学基础', '', '> 本文件由桌面“数学.txt”同步生成。日常修改请编辑桌面TXT，再执行同步。', ''];
for (const subject of subjects) {
  txtParts.push(`【学科】${subject.label}`, '');
  mdParts.push(`## ${subject.label}`, '');
  for (const chapter of subject.chapters) {
    txtParts.push(`【章节】${chapter.label}`, '');
    mdParts.push(`### ${chapter.label}`, '');
    const chapterItems = outputItems.filter(item => item.chapter === chapter.key);
    if (!chapterItems.length) {
      txtParts.push('（暂无知识点）', '');
      mdParts.push('（暂无知识点）', '');
      continue;
    }
    for (const item of chapterItems) {
      txtParts.push(`[${item.stableId}] ${item.title}`);
      mdParts.push(`#### [${item.stableId}] ${item.title}`);
      if (item.content) {
        txtParts.push(item.content);
        mdParts.push('', item.content);
      }
      txtParts.push('');
      mdParts.push('');
    }
  }
}

fs.mkdirSync(sourceDir, { recursive: true });
fs.writeFileSync(path.join(sourceDir, '数学.txt'), `${txtParts.join('\n').trimEnd()}\n`, 'utf8');
fs.writeFileSync(path.join(sourceDir, '数学.md'), `${mdParts.join('\n').trimEnd()}\n`, 'utf8');
fs.writeFileSync(path.join(siteRoot, 'data', 'math-basics.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  source: inputPath,
  subjects: subjects.map(subject => ({ label: subject.label, chapters: subject.chapters.length, items: outputItems.filter(item => item.subject === subject.key).length })),
  totalChapters: subjects.reduce((sum, subject) => sum + subject.chapters.length, 0),
  totalItems: outputItems.length,
  outputs: [
    path.join(sourceDir, '数学.txt'),
    path.join(sourceDir, '数学.md'),
    path.join(siteRoot, 'data', 'math-basics.json'),
  ],
}, null, 2));
