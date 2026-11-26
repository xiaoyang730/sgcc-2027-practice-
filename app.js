const DATA_URL = './data/questions.json?v=20';
const COMPUTER_BASICS_URL = './data/computer-basics.json';
const COMPUTER_QUIZ_URL = './data/computer-quiz.json';
const POWER_SYSTEM_BASICS_URL = './data/power-system-basics.json';
const REVIEW_TOPICS_URL = './data/review-topics.json';
const STORAGE_KEY = 'sgcc-question-progress-v1';
const REVIEW_CATEGORY_ORDER = ['单选', '多选两选', '多选三选', '多选全选', '判断对', '判断错'];
const PRACTICE_CATEGORY_ORDER = ['单选题', '多选题', '判断题'];
const SINGLE_CHOICE_REVIEW_PARTS = [
  { key: '单选·第1部分', label: '第1部分', start: 1, end: 88 },
  { key: '单选·第2部分', label: '第2部分', start: 89, end: 176 },
  { key: '单选·第3部分', label: '第3部分', start: 177, end: 264 },
  { key: '单选·第4部分', label: '第4部分', start: 265, end: 352 },
];
const COMPUTER_QUIZ_TYPES = ['全部题型', '单选题', '多选题', '判断题'];
const REVIEW_CATEGORY_DESCRIPTIONS = {
  '单选': '每题选择一个正确答案',
  '多选两选': '每题有两个正确答案',
  '多选三选': '重点识别唯一错误项',
  '多选全选': '四个选项全部正确',
  '判断对': '快速熟悉正确表述',
  '判断错': '重点记忆错误原因',
};
const PRACTICE_CATEGORY_DESCRIPTIONS = {
  '单选题': '每题选择一个正确答案',
  '多选题': '混合两选、三选和全选题',
  '判断题': '正确题与错误题混合练习',
};
const HIDE_EXPLANATION_CATEGORIES = new Set(['判断对', '多选全选']);

const app = document.querySelector('#app');
const backButton = document.querySelector('#backButton');
const homeButton = document.querySelector('#homeButton');
const statsButton = document.querySelector('#statsButton');
const dataButton = document.querySelector('#dataButton');
const importInput = document.querySelector('#importInput');
const toast = document.querySelector('#toast');

let questions = [];
let metadata = {};
let defaultComputerBasics = [];
let defaultPowerSystemBasics = [];
let computerBasics = [];
let powerSystemBasics = [];
let computerQuizQuestions = [];
let reviewTopics = [];
let progress = loadProgress();
let view = { screen: 'home', mode: null, category: null, origin: null, order: 'smart', index: 0, session: [], selected: new Set(), answered: false, correct: false, reviewPresentation: 'study', showQuestionStats: false, optionOrders: {}, randomScope: '全部题库', randomCount: 20, sessionResults: {} };
let lastSwipeAt = 0;

function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.version === 1 && stored.questions) return stored;
  } catch (_) {}
  return { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), questions: {} };
}

function saveProgress() {
  progress.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function normalizeKnowledgeItems(items, defaultItems = []) {
  return items.map((item, index) => {
    const defaultItem = defaultItems[index];
    const sourceId = Object.prototype.hasOwnProperty.call(item, 'sourceId')
      ? item.sourceId
      : (defaultItem && item.title === defaultItem.title ? defaultItem.id : null);
    return {
      id: index + 1,
      title: String(item.title || '').trim(),
      content: String(item.content || '').trim(),
      sourceId,
      custom: Boolean(item.custom),
    };
  }).filter(item => item.title && item.content);
}

function loadKnowledgeLibrary(key, defaultItems) {
  const defaults = defaultItems.map((item, index) => ({ ...item, id: index + 1, sourceId: item.id, custom: false }));
  const saved = progress.knowledgeLibraries?.[key];
  if (!Array.isArray(saved) || !saved.length) return defaults;
  const normalized = normalizeKnowledgeItems(saved);
  return normalized.length ? normalized : defaults;
}

function reloadKnowledgeLibraries() {
  computerBasics = loadKnowledgeLibrary('computer', defaultComputerBasics);
  powerSystemBasics = loadKnowledgeLibrary('powerSystem', defaultPowerSystemBasics);
}

function saveKnowledgeLibrary(key, items) {
  if (!progress.knowledgeLibraries) progress.knowledgeLibraries = {};
  const normalized = normalizeKnowledgeItems(items);
  progress.knowledgeLibraries[key] = normalized;
  if (key === 'computer') computerBasics = normalized;
  else powerSystemBasics = normalized;
  saveProgress();
}

function getRecord(id) {
  const key = String(id);
  if (!progress.questions[key]) {
    progress.questions[key] = { attempts: 0, correct: 0, wrong: 0, views: 0, known: null, favorite: false, customExplanation: null, note: '', recent: [], lastAnswered: null, lastResult: null, lastViewed: null };
  }
  const record = progress.questions[key];
  if (typeof record.favorite !== 'boolean') record.favorite = false;
  if (!Object.prototype.hasOwnProperty.call(record, 'customExplanation')) record.customExplanation = null;
  if (typeof record.note !== 'string') record.note = '';
  return record;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2100);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function shouldShuffleOptions(question) {
  return question?.question_type === '单选题' || question?.question_type === '多选题';
}

function getDisplayOptions(question, namespace) {
  const originalLetters = Object.keys(question.options);
  if (!shouldShuffleOptions(question)) {
    return originalLetters.map(letter => ({ displayLetter: letter, originalLetter: letter, text: question.options[letter] }));
  }
  if (!view.optionOrders) view.optionOrders = {};
  const identifier = question.question_no ?? question.id;
  const key = `${namespace}:${identifier}`;
  const cached = view.optionOrders[key];
  const validCache = Array.isArray(cached) && cached.length === originalLetters.length && cached.every(letter => originalLetters.includes(letter));
  if (!validCache) view.optionOrders[key] = shuffleQuestions(originalLetters);
  return view.optionOrders[key].map((originalLetter, index) => ({
    displayLetter: String.fromCharCode(65 + index),
    originalLetter,
    text: question.options[originalLetter],
  }));
}

function getDisplayedAnswer(question, displayOptions) {
  const correctOptions = displayOptions.filter(option => question.answer.includes(option.originalLetter));
  return {
    letters: correctOptions.map(option => option.displayLetter).join('、'),
    content: correctOptions.map(option => option.text).join('；'),
  };
}

function summaryFor(items = questions) {
  const ids = new Set(items.map(q => String(q.question_no)));
  const records = Object.entries(progress.questions).filter(([id]) => ids.has(id));
  const attempts = records.reduce((sum, [, r]) => sum + (r.attempts || 0), 0);
  const correct = records.reduce((sum, [, r]) => sum + (r.correct || 0), 0);
  const wrong = records.reduce((sum, [, r]) => sum + (r.wrong || 0), 0);
  const touched = records.filter(([, r]) => (r.attempts || 0) > 0).length;
  return { attempts, correct, wrong, touched, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 };
}

function smartScore(q) {
  const r = getRecord(q.question_no);
  const errorRate = r.attempts ? r.wrong / r.attempts : 0;
  const recentErrors = (r.recent || []).filter(x => !x).length;
  return r.wrong * 12 + errorRate * 8 + recentErrors * 4 + (r.attempts === 0 ? 2 : 0) - r.correct * 0.15;
}

function setHeader(canBack) {
  backButton.classList.toggle('hidden', !canBack);
}

function renderHome() {
  view = { ...view, screen: 'home', mode: null, category: null, origin: null, session: [], index: 0, selected: new Set(), answered: false, showQuestionStats: false, sessionResults: {} };
  setHeader(false);
  const s = summaryFor();
  const focus = questions.filter(q => getRecord(q.question_no).wrong > 0).length;
  const favorites = questions.filter(q => getRecord(q.question_no).favorite).length;
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">短期冲刺 · 记录保存在本机</p>
      <h1>先理解，再反复刷错题</h1>
      <p>背题按六类细分，刷题按单选、多选、判断三类练习。刷题结果会自动统计，错误越多的题目会在智能顺序中越靠前。</p>
    </section>
    <section class="summary-grid">
      <article class="summary-card"><strong>${s.touched}</strong><span>已做题目</span></article>
      <article class="summary-card"><strong>${s.accuracy}%</strong><span>累计正确率</span></article>
      <article class="summary-card"><strong>${focus}</strong><span>重点复习</span></article>
    </section>
    <div class="section-title"><div><h2>选择模式</h2><p>进入模式后再选择题目分类</p></div></div>
    <section class="mode-grid">
      <button class="mode-card" data-mode="review">
        <span class="mode-icon">阅</span><h3>背题模式</h3>
        <p>按六类学习，进入题目后可切换显示答案的“背题”或先作答的“做题”。</p>
      </button>
      <button class="mode-card" data-mode="practice">
        <span class="mode-icon">练</span><h3>刷题模式</h3>
        <p>先独立作答，再显示答案和解析，自动记录每题正确与错误次数。</p>
      </button>
      <button class="mode-card" id="randomQuiz">
        <span class="mode-icon">随</span><h3>随机刷题</h3>
        <p>设置题库范围和题目数量，无重复随机抽题，完成后查看本组正确率。</p>
      </button>
      <button class="mode-card" id="computerBasics">
        <span class="mode-icon">机</span><h3>计算机基础（${computerBasics.length}条）</h3>
        <p>逐条学习并随机测试；知识点支持修改，也可以在当前条目后插入新内容。</p>
      </button>
      <button class="mode-card" id="powerSystemBasics">
        <span class="mode-icon">系</span><h3>电力系统基础（${powerSystemBasics.length}条）</h3>
        <p>完整保留原有76条资料，逐条查看；支持修改和在两条之间插入新知识点。</p>
      </button>
    </section>
    <div class="section-title"><div><h2>快速入口</h2><p>按错误频率优先</p></div></div>
    <section class="panel">
      <div class="quick-actions">
        ${focus ? `<button id="focusPractice" class="button button-primary">开始重点复习（${focus}题）</button>` : ''}
        ${favorites ? `<button id="favoriteQuestions" class="button button-secondary">我的收藏（${favorites}题）</button>` : ''}
      </div>
      ${!focus && !favorites ? `<div class="empty">完成做题或收藏题目后，这里会出现快捷入口。</div>` : ''}
    </section>`;
  app.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => renderCategories(button.dataset.mode)));
  app.querySelector('#randomQuiz')?.addEventListener('click', renderRandomSetup);
  app.querySelector('#computerBasics')?.addEventListener('click', renderComputerHub);
  app.querySelector('#powerSystemBasics')?.addEventListener('click', renderPowerSystemHub);
  app.querySelector('#focusPractice')?.addEventListener('click', startFocusPractice);
  app.querySelector('#favoriteQuestions')?.addEventListener('click', startFavoriteSession);
}

function getComputerRecord(id) {
  if (!progress.computerQuestions) progress.computerQuestions = {};
  const key = String(id);
  if (!progress.computerQuestions[key]) {
    progress.computerQuestions[key] = { attempts: 0, correct: 0, wrong: 0, recent: [], lastAnswered: null, lastResult: null };
  }
  return progress.computerQuestions[key];
}

function computerQuizSummary() {
  const records = Object.values(progress.computerQuestions || {});
  const attempts = records.reduce((sum, item) => sum + (item.attempts || 0), 0);
  const correct = records.reduce((sum, item) => sum + (item.correct || 0), 0);
  return { attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 };
}

function renderComputerHub() {
  view = { ...view, screen: 'computerHub', selected: new Set(), answered: false };
  setHeader(true);
  const summary = computerQuizSummary();
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">计算机基础专项</p><h1>先逐条学习，再随机检验</h1><p>当前共${computerBasics.length}条；可以修改原内容或插入新知识点。随机测试仍依据原始57条题库。</p></section>
    <section class="mode-grid computer-mode-grid">
      <button class="mode-card" id="computerStudy">
        <span class="mode-icon">学</span><h3>知识点学习</h3>
        <p>一次查看一条，使用“上一条／下一条”按钮切换，共${computerBasics.length}条。</p>
      </button>
      <button class="mode-card" id="computerTest">
        <span class="mode-icon">测</span><h3>随机测试</h3>
        <p>单选、多选、判断共${computerQuizQuestions.length}题；已答${summary.attempts}次，正确率${summary.accuracy}%。</p>
      </button>
    </section>`;
  app.querySelector('#computerStudy').addEventListener('click', () => renderKnowledgePoint('computer', 0));
  app.querySelector('#computerTest').addEventListener('click', renderComputerQuizSetup);
}

function renderPowerSystemHub() {
  view = { ...view, screen: 'powerSystemHub', selected: new Set(), answered: false };
  setHeader(true);
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">电力系统基础专项</p><h1>逐条掌握电力系统基础</h1><p>当前共${powerSystemBasics.length}条，按原资料顺序呈现。含“待核对”的原始标记，后续可直接修改或插入新知识点。</p></section>
    <section class="mode-grid computer-mode-grid">
      <button class="mode-card" id="powerSystemStudy">
        <span class="mode-icon">学</span><h3>知识点学习</h3>
        <p>使用“上一条／下一条”切换，编辑后保存在当前浏览器。</p>
      </button>
    </section>`;
  app.querySelector('#powerSystemStudy').addEventListener('click', () => renderKnowledgePoint('powerSystem', 0));
}

function renderKnowledgeInline(text = '') {
  return escapeHtml(text)
    .replace(/\\([*._])/g, '$1')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function parseTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

function isTableSeparator(line = '') {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderKnowledgeContent(markdown = '') {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith('|') && isTableSeparator(lines[index + 1])) {
      const headers = parseTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(`<div class="knowledge-table-wrap"><table class="knowledge-table"><thead><tr>${headers.map(cell => `<th>${renderKnowledgeInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, cellIndex) => `<td>${renderKnowledgeInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      let cursor = index;
      while (cursor < lines.length && /^\s*[-*]\s+/.test(lines[cursor])) {
        items.push(lines[cursor].replace(/^\s*[-*]\s+/, ''));
        cursor += 1;
      }
      output.push(`<ul>${items.map(item => `<li>${renderKnowledgeInline(item)}</li>`).join('')}</ul>`);
      index = cursor - 1;
      continue;
    }
    output.push(`<p>${renderKnowledgeInline(line)}</p>`);
  }
  return output.join('');
}

function getKnowledgeModule(moduleKey) {
  if (moduleKey === 'powerSystem') {
    return {
      key: 'powerSystem',
      label: '电力系统基础',
      items: powerSystemBasics,
      defaults: defaultPowerSystemBasics,
    };
  }
  return {
    key: 'computer',
    label: '计算机基础',
    items: computerBasics,
    defaults: defaultComputerBasics,
  };
}

function renderKnowledgePoint(moduleKey = 'computer', index = 0) {
  const module = getKnowledgeModule(moduleKey);
  if (!module.items.length) {
    app.innerHTML = `<section class="panel empty">${module.label}知识点尚未载入。</section>`;
    return;
  }
  const safeIndex = Math.max(0, Math.min(index, module.items.length - 1));
  const point = module.items[safeIndex];
  view = { ...view, screen: 'knowledge', knowledgeModule: moduleKey, knowledgeIndex: safeIndex };
  setHeader(true);
  app.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="pill">${module.label}</span><span class="pill">${safeIndex + 1}/${module.items.length}</span></div>
      <div class="toolbar-right knowledge-tools">
        <button id="editKnowledge" class="mini-button">修改本条</button>
        <button id="insertKnowledge" class="mini-button">在本条后插入</button>
        <button id="restoreKnowledge" class="mini-button">恢复默认</button>
      </div>
    </div>
    <article class="question-card knowledge-card">
      <div class="question-head"><span class="question-number">第 ${safeIndex + 1} 条</span><span class="difficulty">${point.custom ? '新增知识点' : '逐条学习'}</span></div>
      <h2>${escapeHtml(point.title)}</h2>
      <div class="knowledge-content">${renderKnowledgeContent(point.content)}</div>
      <div class="knowledge-nav">
        <button id="previousKnowledge" class="button button-secondary" ${safeIndex === 0 ? 'disabled' : ''}>上一条</button>
        <button id="nextKnowledge" class="button button-primary" ${safeIndex === module.items.length - 1 ? 'disabled' : ''}>下一条</button>
      </div>
    </article>`;
  app.querySelector('#previousKnowledge').addEventListener('click', previousKnowledgePoint);
  app.querySelector('#nextKnowledge').addEventListener('click', nextKnowledgePoint);
  app.querySelector('#editKnowledge').addEventListener('click', () => openKnowledgeEditor('edit'));
  app.querySelector('#insertKnowledge').addEventListener('click', () => openKnowledgeEditor('insert'));
  app.querySelector('#restoreKnowledge').addEventListener('click', restoreKnowledgeDefaults);
}

function nextKnowledgePoint() {
  const module = getKnowledgeModule(view.knowledgeModule);
  if (view.knowledgeIndex >= module.items.length - 1) {
    showToast('已经是最后一条');
    return;
  }
  renderKnowledgePoint(view.knowledgeModule, view.knowledgeIndex + 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previousKnowledgePoint() {
  if (view.knowledgeIndex <= 0) {
    showToast('已经是第一条');
    return;
  }
  renderKnowledgePoint(view.knowledgeModule, view.knowledgeIndex - 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openKnowledgeEditor(mode) {
  const module = getKnowledgeModule(view.knowledgeModule);
  const current = module.items[view.knowledgeIndex];
  if (!current) return;
  const isInsert = mode === 'insert';
  const existing = document.querySelector('#knowledgeEditorDialog');
  if (existing) existing.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'knowledgeEditorDialog';
  dialog.innerHTML = `<div class="dialog-body">
    <h2>${isInsert ? `在第${view.knowledgeIndex + 1}条后插入` : `修改第${view.knowledgeIndex + 1}条`}</h2>
    <p>${isInsert ? '保存后，新条目会成为下一条，后续序号自动顺延。' : '支持普通文字、加粗和Markdown表格。'}</p>
    <div class="question-editor knowledge-editor">
      <label class="field-label" for="knowledgeTitle">标题</label>
      <input id="knowledgeTitle" class="editor-input" type="text" value="${isInsert ? '' : escapeHtml(current.title)}" maxlength="120">
      <label class="field-label" for="knowledgeContent">内容</label>
      <textarea id="knowledgeContent" class="editor-textarea" rows="12">${isInsert ? '' : escapeHtml(current.content)}</textarea>
      <div class="actions editor-actions">
        <button id="saveKnowledge" class="button button-primary">保存</button>
        <button id="cancelKnowledge" class="button button-secondary">取消</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector('#cancelKnowledge').onclick = () => dialog.close();
  dialog.querySelector('#saveKnowledge').onclick = () => {
    const title = dialog.querySelector('#knowledgeTitle').value.trim();
    const content = dialog.querySelector('#knowledgeContent').value.trim();
    if (!title || !content) {
      alert('标题和内容都不能为空。');
      return;
    }
    const items = module.items.map(item => ({ ...item }));
    let targetIndex = view.knowledgeIndex;
    if (isInsert) {
      targetIndex += 1;
      items.splice(targetIndex, 0, { id: targetIndex + 1, title, content, sourceId: null, custom: true });
    } else {
      items[targetIndex] = { ...items[targetIndex], title, content };
    }
    saveKnowledgeLibrary(module.key, items);
    dialog.close();
    renderKnowledgePoint(module.key, targetIndex);
    showToast(isInsert ? '新知识点已插入，序号已更新' : '本条内容已保存');
  };
}

function restoreKnowledgeDefaults() {
  const module = getKnowledgeModule(view.knowledgeModule);
  if (!confirm(`确定恢复${module.label}的默认内容吗？你在本模块中的修改和新增条目将被清除。`)) return;
  if (progress.knowledgeLibraries) delete progress.knowledgeLibraries[module.key];
  reloadKnowledgeLibraries();
  saveProgress();
  renderKnowledgePoint(module.key, Math.min(view.knowledgeIndex, getKnowledgeModule(module.key).items.length - 1));
  showToast(`${module.label}已恢复默认内容`);
}

function getComputerQuizPool(type) {
  return type === '全部题型' ? [...computerQuizQuestions] : computerQuizQuestions.filter(question => question.question_type === type);
}

function renderComputerQuizSetup() {
  const selectedType = view.computerQuizType || '全部题型';
  const selectedCount = view.computerQuizCount || 10;
  view = { ...view, screen: 'computerQuizSetup', computerQuizType: selectedType, computerQuizCount: selectedCount, selected: new Set(), answered: false, computerSessionResults: {} };
  setHeader(true);
  const typeOptions = COMPUTER_QUIZ_TYPES.map(type => `<option value="${type}" ${type === selectedType ? 'selected' : ''}>${type}</option>`).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">计算机基础 · 随机测试</p><h1>从57条知识点中随机组题</h1><p>题库共${computerQuizQuestions.length}题，单选、多选、判断各24题。所有题目与答案仅依据57条原文。</p></section>
    <section class="panel random-panel">
      <label class="field-label" for="computerQuizType">题型范围</label>
      <select id="computerQuizType" class="select random-select">${typeOptions}</select>
      <label class="field-label" for="computerQuizCount">题目数量</label>
      <div class="random-controls">
        <input id="computerQuizCount" class="number-input" type="number" min="1" inputmode="numeric" value="${selectedCount}">
        <button id="startComputerQuiz" class="button button-primary">开始测试</button>
      </div>
      <div class="preset-grid" aria-label="常用题数">
        ${[5, 10, 20].map(count => `<button class="preset-button" data-computer-count="${count}">${count}题</button>`).join('')}
      </div>
      <p id="computerQuizLimit" class="random-note"></p>
      <p class="scope-note">答题后显示对应知识点编号和简要依据；每组题目不重复。</p>
    </section>`;
  const typeSelect = app.querySelector('#computerQuizType');
  const countInput = app.querySelector('#computerQuizCount');
  const limitText = app.querySelector('#computerQuizLimit');
  const updateLimit = () => {
    const poolSize = getComputerQuizPool(typeSelect.value).length;
    countInput.max = poolSize;
    if (Number(countInput.value) > poolSize) countInput.value = poolSize;
    limitText.textContent = `${typeSelect.value}可抽取 ${poolSize} 题。`;
  };
  typeSelect.addEventListener('change', updateLimit);
  app.querySelectorAll('[data-computer-count]').forEach(button => button.addEventListener('click', () => {
    countInput.value = Math.min(Number(button.dataset.computerCount), getComputerQuizPool(typeSelect.value).length);
  }));
  app.querySelector('#startComputerQuiz').addEventListener('click', () => startComputerQuiz(typeSelect.value, Number(countInput.value)));
  updateLimit();
}

function startComputerQuiz(type, requestedCount) {
  const pool = getComputerQuizPool(type);
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    showToast('请输入不少于1的整数题数');
    return;
  }
  if (requestedCount > pool.length) {
    showToast(`${type}最多可抽取${pool.length}题`);
    return;
  }
  view = {
    ...view,
    screen: 'computerQuizQuestion',
    origin: 'computerQuiz',
    computerQuizType: type,
    computerQuizCount: requestedCount,
    computerSession: shuffleQuestions(pool).slice(0, requestedCount),
    computerSessionResults: {},
    index: 0,
    selected: new Set(),
    answered: false,
    correct: false,
    optionOrders: {},
  };
  setHeader(true);
  renderComputerQuestion();
}

function renderComputerQuestion() {
  const question = view.computerSession?.[view.index];
  if (!question) {
    app.innerHTML = `<section class="panel empty">当前范围没有可用题目。</section>`;
    return;
  }
  const record = getComputerRecord(question.id);
  const displayOptions = getDisplayOptions(question, 'computer');
  const displayedAnswer = getDisplayedAnswer(question, displayOptions);
  const options = displayOptions.map(({ displayLetter, originalLetter, text }) => {
    const selected = view.selected.has(originalLetter);
    const correct = view.answered && question.answer.includes(originalLetter);
    const wrong = view.answered && selected && !question.answer.includes(originalLetter);
    return `<button class="option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" data-computer-option="${originalLetter}" ${view.answered ? 'disabled' : ''}>
      <span class="option-letter">${displayLetter}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
  const sourceIndex = computerBasics.findIndex(item => Number(item.sourceId) === Number(question.source_id));
  const source = sourceIndex >= 0 ? computerBasics[sourceIndex] : null;
  const statsText = record.attempts ? `已答${record.attempts}次 · 对${record.correct} · 错${record.wrong}` : '尚未作答';
  const answerBox = view.answered ? `<div class="answer-box">
    <strong class="${view.correct ? 'result-good' : 'result-bad'}">${view.correct ? '回答正确' : '回答错误'} · 正确答案：${displayedAnswer.letters}</strong>
    <p class="correct-answer-content">对应内容：${escapeHtml(displayedAnswer.content)}</p>
    <p>${escapeHtml(question.explanation)}</p>
    <p class="question-source">依据：${source ? `当前第${sourceIndex + 1}条「${escapeHtml(source.title)}」` : `原第${question.source_id}条`}</p>
  </div>` : '';
  const needsSubmit = question.answer_count > 1 && !view.answered;
  const isLast = view.index === view.computerSession.length - 1;
  app.innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><span class="pill">计算机随机测试 · ${question.question_type}</span><span class="pill">${view.index + 1}/${view.computerSession.length}</span>${shouldShuffleOptions(question) ? '<span class="pill">选项随机</span>' : ''}</div></div>
    <article class="question-card">
      <div class="question-head"><span class="question-number">第 ${view.index + 1} 题</span><span class="difficulty">${statsText}</span></div>
      <p class="stem">${escapeHtml(question.stem)}</p>
      <div class="options">${options}</div>
      ${answerBox}
      ${needsSubmit ? `<div class="actions single-action"><button id="submitComputerAnswer" class="button button-primary" ${view.selected.size ? '' : 'disabled'}>提交答案</button></div>` : ''}
      ${view.answered ? `<div class="actions single-action"><button id="nextComputerQuestion" class="button button-primary">${isLast ? '查看本组结果' : '下一题'}</button></div>` : ''}
      <p class="gesture-hint">${question.answer_count === 1 ? '点击选项立即提交' : '选择所有答案后提交'}</p>
    </article>`;
  app.querySelectorAll('[data-computer-option]').forEach(button => button.addEventListener('click', () => toggleComputerOption(button.dataset.computerOption)));
  app.querySelector('#submitComputerAnswer')?.addEventListener('click', submitComputerAnswer);
  app.querySelector('#nextComputerQuestion')?.addEventListener('click', nextComputerQuestion);
}

function toggleComputerOption(letter) {
  if (view.answered) return;
  const question = view.computerSession[view.index];
  if (question.answer_count === 1) {
    view.selected = new Set([letter]);
    submitComputerAnswer();
    return;
  }
  if (view.selected.has(letter)) view.selected.delete(letter);
  else view.selected.add(letter);
  renderComputerQuestion();
}

function submitComputerAnswer() {
  if (view.answered || !view.selected.size) return;
  const question = view.computerSession[view.index];
  const chosen = [...view.selected].sort();
  const answer = [...question.answer].sort();
  const correct = chosen.length === answer.length && chosen.every((letter, index) => letter === answer[index]);
  const record = getComputerRecord(question.id);
  record.attempts += 1;
  record.correct += correct ? 1 : 0;
  record.wrong += correct ? 0 : 1;
  record.lastAnswered = new Date().toISOString();
  record.lastResult = correct;
  record.recent = [...(record.recent || []), correct].slice(-10);
  view.computerSessionResults[String(question.id)] = correct;
  view.answered = true;
  view.correct = correct;
  saveProgress();
  renderComputerQuestion();
}

function nextComputerQuestion() {
  if (view.index >= view.computerSession.length - 1) {
    renderComputerQuizComplete();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  view.index += 1;
  view.selected = new Set();
  view.answered = false;
  view.correct = false;
  renderComputerQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderComputerQuizComplete() {
  view.screen = 'computerQuizComplete';
  setHeader(true);
  const results = Object.values(view.computerSessionResults || {});
  const correct = results.filter(Boolean).length;
  const wrong = results.length - correct;
  const accuracy = results.length ? Math.round(correct / results.length * 100) : 0;
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">计算机基础 · 本组完成</p><h1>${correct}/${results.length} 题正确</h1><p>正确率${accuracy}%。作答记录已保存在当前浏览器，可继续按相同设置随机生成新题组。</p></section>
    <section class="summary-grid"><article class="summary-card"><strong>${view.computerSession.length}</strong><span>本组题数</span></article><article class="summary-card"><strong>${correct}</strong><span>回答正确</span></article><article class="summary-card"><strong>${wrong}</strong><span>回答错误</span></article></section>
    <section class="panel"><div class="actions"><button id="computerQuizSettings" class="button button-secondary">修改设置</button><button id="computerQuizAgain" class="button button-primary">同样设置再来一组</button></div></section>`;
  app.querySelector('#computerQuizSettings').addEventListener('click', renderComputerQuizSetup);
  app.querySelector('#computerQuizAgain').addEventListener('click', () => startComputerQuiz(view.computerQuizType, view.computerQuizCount));
}

function renderCategories(mode) {
  view.mode = mode;
  view.screen = 'categories';
  setHeader(true);
  const isReview = mode === 'review';
  const title = isReview ? '背题模式' : '刷题模式';
  const categories = isReview ? REVIEW_CATEGORY_ORDER : PRACTICE_CATEGORY_ORDER;
  const descriptions = isReview ? REVIEW_CATEGORY_DESCRIPTIONS : PRACTICE_CATEGORY_DESCRIPTIONS;
  const cards = categories.map(category => {
    const items = getCategoryQuestions(mode, category);
    const s = summaryFor(items);
    const percent = Math.round(s.touched / items.length * 100);
    return `<button class="category-card" data-category="${category}">
      <div class="category-top"><h3>${category}</h3><span class="category-count">${items.length}题</span></div>
      <div class="category-meta"><span>${descriptions[category]}</span><span>正确率 ${s.accuracy}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    </button>`;
  }).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">${title}</p><h1>选择题目分类</h1><p>${isReview ? '按答案特征细分为六类；进入题目后可随时切换“背题”或“做题”。' : '按基础题型混合答案结构，不提前透露多选数量或判断正误。'}</p></section>
    <div class="section-title"><div><h2>${isReview ? '六类背题' : '三类刷题'}</h2><p>合计 ${questions.length} 题</p></div></div>
    <section class="category-grid">${cards}</section>
    ${isReview ? `
      <div class="section-title"><div><h2>专题加练</h2><p>从全部题库额外归集，原六类内容保持不变</p></div></div>
      <section class="panel">
        <button id="reviewTopics" class="category-card topic-entry-card">
          <div class="category-top"><h3>进入专题模块</h3><span class="category-count">3类</span></div>
          <div class="category-meta"><span>数字题 · 序号选择题 · 地名相关题</span><span>可背题或做题</span></div>
        </button>
      </section>` : ''}`;
  app.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.category;
    if (mode === 'review' && category === '单选') renderSingleChoiceParts();
    else startSession(mode, category);
  }));
  app.querySelector('#reviewTopics')?.addEventListener('click', renderReviewTopics);
}

function renderReviewTopics() {
  view = { ...view, screen: 'reviewTopics', mode: 'review', category: null, origin: null, showQuestionStats: false };
  setHeader(true);
  const cards = reviewTopics.map(topic => {
    const items = getCategoryQuestions('review', `专题·${topic.key}`);
    const summary = summaryFor(items);
    const percent = items.length ? Math.round(summary.touched / items.length * 100) : 0;
    return `<button class="category-card" data-review-topic="${escapeHtml(topic.key)}">
      <div class="category-top"><h3>${escapeHtml(topic.title)}</h3><span class="category-count">${items.length}题</span></div>
      <div class="category-meta"><span>${escapeHtml(topic.description)}</span><span>已做 ${summary.touched}/${items.length}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    </button>`;
  }).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">背题模式 · 专题加练</p><h1>集中练易混信息</h1><p>专题只是原题库的额外索引，同一道题仍保留在原六类中；作答记录、收藏、个人解析和备注继续共用。</p></section>
    <div class="section-title"><div><h2>选择专题</h2><p>可进入后切换“背题”或“做题”</p></div></div>
    <section class="category-grid">${cards}</section>`;
  app.querySelectorAll('[data-review-topic]').forEach(button => button.addEventListener('click', () => {
    startSession('review', `专题·${button.dataset.reviewTopic}`, 'sequential', 'reviewTopic');
  }));
}

function renderSingleChoiceParts() {
  view = { ...view, screen: 'singleChoiceParts', mode: 'review', category: '单选', origin: null, showQuestionStats: false };
  setHeader(true);
  const cards = SINGLE_CHOICE_REVIEW_PARTS.map(part => {
    const items = getCategoryQuestions('review', part.key);
    const s = summaryFor(items);
    const percent = items.length ? Math.round(s.touched / items.length * 100) : 0;
    return `<button class="category-card" data-single-part="${part.key}">
      <div class="category-top"><h3>${part.label}</h3><span class="category-count">${items.length}题</span></div>
      <div class="category-meta"><span>原题第${part.start}—${part.end}题</span><span>已学 ${s.touched}/${items.length}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    </button>`;
  }).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">背题模式 · 单选题</p><h1>分四部分逐步学习</h1><p>352道单选题平均分成4组，每组88题。每组都可以独立选择智能、题号或随机顺序。</p></section>
    <div class="section-title"><div><h2>选择学习部分</h2><p>每部分88题</p></div></div>
    <section class="category-grid">${cards}</section>`;
  app.querySelectorAll('[data-single-part]').forEach(button => button.addEventListener('click', () => startSession('review', button.dataset.singlePart, 'sequential', 'singleChoicePart')));
}

function renderRandomSetup() {
  view = { ...view, screen: 'randomSetup', mode: 'practice', category: '随机组卷', origin: 'random', session: [], index: 0, selected: new Set(), answered: false, sessionResults: {} };
  setHeader(true);
  const scopeOptions = ['全部题库', ...PRACTICE_CATEGORY_ORDER].map(scope => `<option value="${scope}" ${view.randomScope === scope ? 'selected' : ''}>${scope}</option>`).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">随机刷题</p><h1>自己设置这一组刷多少题</h1><p>从所选范围内无重复随机抽取。选择全部题库时按题型比例组卷，并按单选、多选、判断的顺序作答。</p></section>
    <div class="section-title"><div><h2>组卷设置</h2><p>最多 ${questions.length} 题</p></div></div>
    <section class="panel random-panel">
      <label class="field-label" for="randomScope">题库范围</label>
      <select id="randomScope" class="select random-select">${scopeOptions}</select>
      <label class="field-label" for="randomCount">题目数量</label>
      <div class="random-controls">
        <input id="randomCount" class="number-input" type="number" min="1" max="${questions.length}" inputmode="numeric" value="${view.randomCount}">
        <button id="startRandom" class="button button-primary">开始随机刷题</button>
      </div>
      <div class="preset-grid" aria-label="常用题数">
        ${[10, 20, 30, 50, 100, 200].map(count => `<button class="preset-button" data-random-count="${count}">${count}题</button>`).join('')}
      </div>
      <p id="randomLimit" class="random-note">全部题库可抽取 ${questions.length} 题。</p>
    </section>`;
  const scopeSelect = app.querySelector('#randomScope');
  const countInput = app.querySelector('#randomCount');
  const limitText = app.querySelector('#randomLimit');
  const updateLimit = () => {
    const poolSize = getRandomPool(scopeSelect.value).length;
    countInput.max = poolSize;
    const requestedCount = Number(countInput.value);
    if (scopeSelect.value === '全部题库' && Number.isInteger(requestedCount) && requestedCount >= 1 && requestedCount <= poolSize) {
      const plan = getProportionalRandomPlan(requestedCount);
      limitText.textContent = `本轮：单选${plan[0].count}题 · 多选${plan[1].count}题 · 判断${plan[2].count}题；按此顺序作答。`;
    } else {
      limitText.textContent = `${scopeSelect.value}可抽取 ${poolSize} 题。`;
    }
  };
  scopeSelect.addEventListener('change', updateLimit);
  countInput.addEventListener('input', updateLimit);
  app.querySelectorAll('[data-random-count]').forEach(button => button.addEventListener('click', () => {
    countInput.value = button.dataset.randomCount;
    updateLimit();
  }));
  app.querySelector('#startRandom').addEventListener('click', () => startRandomSession(scopeSelect.value, Number(countInput.value)));
  updateLimit();
}

function getRandomPool(scope) {
  return scope === '全部题库' ? [...questions] : questions.filter(q => q.question_type === scope);
}

function shuffleQuestions(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function getProportionalRandomPlan(requestedCount) {
  const groups = PRACTICE_CATEGORY_ORDER.map((type, index) => ({
    type,
    index,
    pool: questions.filter(question => question.question_type === type),
  }));
  const total = groups.reduce((sum, group) => sum + group.pool.length, 0);
  const plan = groups.map(group => {
    const exactCount = requestedCount * group.pool.length / total;
    return { ...group, count: Math.floor(exactCount), remainder: exactCount % 1 };
  });
  let unassigned = requestedCount - plan.reduce((sum, group) => sum + group.count, 0);
  const remainderOrder = [...plan].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const group of remainderOrder) {
    if (unassigned <= 0) break;
    if (group.count < group.pool.length) {
      group.count += 1;
      unassigned -= 1;
    }
  }
  return plan.sort((a, b) => a.index - b.index);
}

function buildRandomSession(scope, requestedCount) {
  if (scope !== '全部题库') return shuffleQuestions(getRandomPool(scope)).slice(0, requestedCount);
  return getProportionalRandomPlan(requestedCount).flatMap(group => shuffleQuestions(group.pool).slice(0, group.count));
}

function startRandomSession(scope, requestedCount) {
  const pool = getRandomPool(scope);
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    showToast('请输入不少于1的整数题数');
    return;
  }
  if (requestedCount > pool.length) {
    showToast(`${scope}最多可抽取${pool.length}题`);
    return;
  }
  const session = buildRandomSession(scope, requestedCount);
  view = { screen: 'question', mode: 'practice', category: scope === '全部题库' ? '随机组卷' : `随机·${scope}`, origin: 'random', order: 'random', index: 0, session, selected: new Set(), answered: false, correct: false, showQuestionStats: false, optionOrders: {}, randomScope: scope, randomCount: requestedCount, sessionAnswers: {}, sessionResults: {}, randomFinalized: false };
  setHeader(true);
  renderQuestion();
}

function isChosenAnswerCorrect(question, chosenAnswer) {
  const chosen = [...(chosenAnswer || [])].sort();
  const answer = [...question.answer].sort();
  return chosen.length === answer.length && chosen.every((item, index) => item === answer[index]);
}

function finalizeRandomSession() {
  if (view.randomFinalized) return;
  const results = {};
  for (const question of view.session) {
    const key = String(question.question_no);
    const chosen = view.sessionAnswers?.[key];
    if (!chosen?.length) continue;
    const correct = isChosenAnswerCorrect(question, chosen);
    results[key] = correct;
    const record = getRecord(question.question_no);
    record.attempts += 1;
    record.correct += correct ? 1 : 0;
    record.wrong += correct ? 0 : 1;
    record.lastAnswered = new Date().toISOString();
    record.lastResult = correct;
    record.recent = [...(record.recent || []), correct].slice(-10);
  }
  view.sessionResults = results;
  view.randomFinalized = true;
  saveProgress();
}

function renderRandomComplete() {
  finalizeRandomSession();
  view.screen = 'randomComplete';
  setHeader(true);
  const results = Object.values(view.sessionResults || {});
  const answered = results.length;
  const correct = results.filter(Boolean).length;
  const wrong = answered - correct;
  const unanswered = view.session.length - answered;
  const accuracy = view.session.length ? Math.round(correct / view.session.length * 100) : 0;
  const wrongQuestions = view.session.filter(question => view.sessionResults?.[String(question.question_no)] === false);
  const wrongList = wrongQuestions.map(question => `<button class="stat-row random-wrong-row" data-random-wrong="${question.question_no}">
    <strong>第${question.question_no}题</strong><div><span>${question.question_type}</span><small>点击查看你的选择、正确答案和解析</small></div><div class="stat-value">查看</div>
  </button>`).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">本组完成</p><h1>${correct}/${view.session.length || 0} 题正确</h1><p>整体正确率 ${accuracy}%，答错 ${wrong} 题${unanswered ? `，未作答 ${unanswered} 题` : ''}。本轮结果已统一计入个人统计。</p></section>
    <section class="summary-grid"><article class="summary-card"><strong>${view.session.length}</strong><span>本组题数</span></article><article class="summary-card"><strong>${correct}</strong><span>回答正确</span></article><article class="summary-card"><strong>${wrong}</strong><span>回答错误</span></article></section>
    <div class="section-title"><div><h2>本轮错题</h2><p>先看题号，点击后单题复盘</p></div></div>
    <section class="stats-list random-wrong-list">${wrongList || '<div class="panel empty">本轮没有错题。</div>'}</section>
    <section class="panel"><div class="actions"><button id="randomSettings" class="button button-secondary">修改设置</button><button id="randomAgain" class="button button-primary">同样设置再来一组</button></div></section>`;
  app.querySelectorAll('[data-random-wrong]').forEach(button => button.addEventListener('click', () => renderRandomWrongReview(Number(button.dataset.randomWrong))));
  app.querySelector('#randomSettings').addEventListener('click', renderRandomSetup);
  app.querySelector('#randomAgain').addEventListener('click', () => startRandomSession(view.randomScope, view.randomCount));
}

function renderRandomWrongReview(questionNumber) {
  const question = view.session.find(item => item.question_no === questionNumber);
  if (!question || view.sessionResults?.[String(questionNumber)] !== false) {
    renderRandomComplete();
    return;
  }
  view.screen = 'randomWrongReview';
  setHeader(true);
  const record = getRecord(question.question_no);
  const chosen = view.sessionAnswers?.[String(question.question_no)] || [];
  const displayOptions = getDisplayOptions(question, 'public');
  const displayedAnswer = getDisplayedAnswer(question, displayOptions);
  const chosenOptions = displayOptions.filter(option => chosen.includes(option.originalLetter));
  const chosenLetters = chosenOptions.map(option => option.displayLetter).join('、') || '未作答';
  const chosenContent = chosenOptions.map(option => option.text).join('；') || '未作答';
  const originalExplanation = !HIDE_EXPLANATION_CATEGORIES.has(question.practice_category) ? (question.explanation || '').trim() : '';
  const displayExplanation = (record.customExplanation || '').trim() || originalExplanation;
  const personalNote = (record.note || '').trim();
  const options = displayOptions.map(({ displayLetter, originalLetter, text }) => {
    const selected = chosen.includes(originalLetter);
    const correct = question.answer.includes(originalLetter);
    const wrong = selected && !correct;
    return `<button class="option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" disabled>
      <span class="option-letter">${displayLetter}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
  app.innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><span class="pill">本轮错题复盘</span><span class="pill">第${question.question_no}题</span></div></div>
    <article class="question-card">
      <div class="question-head"><span class="question-number">第 ${question.question_no} 题</span><span class="difficulty">${question.question_type}</span></div>
      <p class="stem">${escapeHtml(question.stem)}</p>
      <div class="options">${options}</div>
      <div class="answer-box">
        <strong class="result-bad">你的答案：${chosenLetters}</strong>
        <p>你的选择：${escapeHtml(chosenContent)}</p>
        <p><span class="answer-label">正确答案：</span>${displayedAnswer.letters}</p>
        ${question.practice_category !== '多选三选' ? `<p class="correct-answer-content">对应内容：${escapeHtml(displayedAnswer.content)}</p>` : ''}
        ${displayExplanation ? `<p><span class="answer-label">解析：</span>${escapeHtml(displayExplanation)}</p>` : ''}
        ${personalNote ? `<div class="personal-note"><strong>我的备注／口诀</strong><p>${escapeHtml(personalNote).replace(/\n/g, '<br>')}</p></div>` : ''}
      </div>
      <div class="actions single-action"><button id="backToRandomSummary" class="button button-primary">返回本轮汇总</button></div>
    </article>`;
  app.querySelector('#backToRandomSummary').addEventListener('click', renderRandomComplete);
}

function getCategoryQuestions(mode, category) {
  if (mode === 'review' && category.startsWith('专题·')) {
    const topic = reviewTopics.find(item => item.key === category.slice(3));
    const ids = new Set(topic?.question_ids || []);
    return questions.filter(question => ids.has(question.question_no));
  }
  const singlePart = mode === 'review' ? SINGLE_CHOICE_REVIEW_PARTS.find(part => part.key === category) : null;
  if (singlePart) {
    return questions.filter(q => q.practice_category === '单选' && q.question_no >= singlePart.start && q.question_no <= singlePart.end);
  }
  return mode === 'review'
    ? questions.filter(q => q.practice_category === category)
    : questions.filter(q => q.question_type === category);
}

function buildSession(mode, category, order = 'smart') {
  let items = getCategoryQuestions(mode, category);
  if (order === 'smart') items = [...items].sort((a, b) => smartScore(b) - smartScore(a) || a.question_no - b.question_no);
  if (order === 'random') items = shuffleQuestions(items);
  if (order === 'sequential') items = [...items].sort((a, b) => a.question_no - b.question_no);
  return items;
}

function startSession(mode, category, order = mode === 'practice' ? 'smart' : 'sequential', origin = 'category') {
  const reviewPresentation = mode === 'review' ? (view.reviewPresentation || 'study') : 'study';
  view = { screen: 'question', mode, category, origin, order, index: 0, session: buildSession(mode, category, order), selected: new Set(), answered: false, correct: false, reviewPresentation, showQuestionStats: false, optionOrders: {}, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function startFavoriteSession() {
  const items = questions.filter(q => getRecord(q.question_no).favorite).sort((a, b) => a.question_no - b.question_no);
  view = { screen: 'question', mode: 'review', category: '我的收藏', origin: 'favorites', order: 'sequential', index: 0, session: items, selected: new Set(), answered: false, correct: false, reviewPresentation: 'study', showQuestionStats: false, optionOrders: {}, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function startFocusPractice() {
  const items = questions.filter(q => getRecord(q.question_no).wrong > 0).sort((a, b) => smartScore(b) - smartScore(a));
  view = { screen: 'question', mode: 'practice', category: '重点复习', origin: 'focus', order: 'smart', index: 0, session: items, selected: new Set(), answered: false, correct: false, showQuestionStats: false, optionOrders: {}, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function isQuestionPractice() {
  return view.mode === 'practice' || (view.mode === 'review' && view.reviewPresentation === 'quiz');
}

function setReviewPresentation(presentation) {
  if (view.mode !== 'review' || !['study', 'quiz'].includes(presentation)) return;
  view.reviewPresentation = presentation;
  view.selected = new Set();
  view.answered = false;
  view.correct = false;
  renderQuestion();
}

function toggleFavorite() {
  const question = view.session[view.index];
  if (!question) return;
  const record = getRecord(question.question_no);
  record.favorite = !record.favorite;
  saveProgress();
  showToast(record.favorite ? '已加入收藏' : '已取消收藏');
  renderQuestion();
}

function toggleQuestionStats() {
  view.showQuestionStats = !view.showQuestionStats;
  renderQuestion();
}

function showQuestionEditor() {
  const question = view.session[view.index];
  if (!question) return;
  const record = getRecord(question.question_no);
  document.querySelector('#questionEditorDialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'questionEditorDialog';
  dialog.innerHTML = `<form method="dialog" class="dialog-body question-editor">
    <h2>第${question.question_no}题 · 个人解析与备注</h2>
    <p>修改只保存在当前浏览器，不会更改官方题干、答案或网站原始题库。单选、多选的选项会随机换位，口诀应记选项内容，不要只记A/B/C/D。</p>
    <label class="field-label" for="customExplanation">个人解析</label>
    <textarea id="customExplanation" class="editor-textarea" rows="4" placeholder="可把原解析改成更适合自己的简短表述"></textarea>
    <div class="editor-inline-actions"><button id="restoreExplanation" class="text-button" type="button">恢复原解析</button><span>留空也会恢复原解析</span></div>
    <label class="field-label" for="questionNote">记忆备注／口诀</label>
    <textarea id="questionNote" class="editor-textarea" rows="4" placeholder="例如：关键词、易错点、自己的记忆口诀"></textarea>
    <div class="dialog-actions editor-actions"><button id="saveQuestionEditor" class="button button-primary" type="button">保存</button><button id="closeQuestionEditor" class="button button-secondary" type="button">取消</button></div>
  </form>`;
  document.body.appendChild(dialog);
  const explanationInput = dialog.querySelector('#customExplanation');
  const noteInput = dialog.querySelector('#questionNote');
  explanationInput.value = record.customExplanation ?? question.explanation ?? '';
  noteInput.value = record.note || '';
  dialog.querySelector('#restoreExplanation').addEventListener('click', () => {
    explanationInput.value = question.explanation || '';
    showToast('已恢复原解析内容，保存后生效');
  });
  dialog.querySelector('#closeQuestionEditor').addEventListener('click', () => dialog.close());
  dialog.querySelector('#saveQuestionEditor').addEventListener('click', () => {
    const original = (question.explanation || '').trim();
    const custom = explanationInput.value.trim();
    record.customExplanation = custom && custom !== original ? custom : null;
    record.note = noteInput.value.trim();
    saveProgress();
    dialog.close();
    renderQuestion();
    showToast('个人解析和备注已保存');
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function renderQuestion() {
  const q = view.session[view.index];
  if (!q) {
    app.innerHTML = `<section class="panel empty">当前分类没有题目。</section>`;
    return;
  }
  if (view.mode === 'review' && view.lastViewedQuestion !== q.question_no) {
    const r = getRecord(q.question_no);
    r.views += 1; r.lastViewed = new Date().toISOString(); saveProgress();
    view.lastViewedQuestion = q.question_no;
  }
  const r = getRecord(q.question_no);
  if (view.origin === 'random') {
    const savedSelection = view.sessionAnswers?.[String(q.question_no)] || [];
    if (!view.selected.size && savedSelection.length) view.selected = new Set(savedSelection);
  }
  const practicePresentation = isQuestionPractice();
  const answerVisible = view.origin === 'random' ? false : (!practicePresentation || view.answered);
  const originalExplanation = !HIDE_EXPLANATION_CATEGORIES.has(q.practice_category) ? (q.explanation || '').trim() : '';
  const displayExplanation = (r.customExplanation || '').trim() || originalExplanation;
  const personalNote = (r.note || '').trim();
  const displayOptions = getDisplayOptions(q, 'public');
  const displayedAnswer = getDisplayedAnswer(q, displayOptions);
  const options = displayOptions.map(({ displayLetter, originalLetter, text }) => {
    const selected = view.selected.has(originalLetter);
    const isCorrect = answerVisible && q.answer.includes(originalLetter);
    const isWrong = answerVisible && selected && !q.answer.includes(originalLetter);
    return `<button class="option ${selected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}" data-option="${originalLetter}" ${answerVisible ? 'disabled' : ''}>
      <span class="option-letter">${displayLetter}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
  const statsText = r.attempts ? `已答 ${r.attempts} 次 · 对 ${r.correct} · 错 ${r.wrong} · 正确率 ${Math.round(r.correct / r.attempts * 100)}%` : '尚未作答';
  const answerBox = answerVisible ? `<div class="answer-box">
    ${practicePresentation ? `<strong class="${view.correct ? 'result-good' : 'result-bad'}">${view.correct ? '回答正确' : '回答错误'} · ` : '<strong>'}正确答案：${displayedAnswer.letters}</strong>
    ${q.practice_category !== '多选三选' ? `<p class="correct-answer-content">对应内容：${escapeHtml(displayedAnswer.content)}</p>` : ''}
    ${displayExplanation ? `<p><span class="answer-label">解析：</span>${escapeHtml(displayExplanation)}</p>` : ''}
    ${personalNote ? `<div class="personal-note"><strong>我的备注／口诀</strong><p>${escapeHtml(personalNote).replace(/\n/g, '<br>')}</p></div>` : ''}
  </div>` : '';
  const hasSavedRandomAnswer = view.origin === 'random' && Boolean(view.sessionAnswers?.[String(q.question_no)]?.length);
  const needsSubmitButton = practicePresentation && q.answer_count > 1 && !view.answered;
  const gestureHint = view.origin === 'random'
    ? q.answer_count === 1
      ? '点击选项后自动进入下一题 · 本轮结束后统一判分'
      : '选择所有答案并提交 · 本轮结束后统一判分'
    : !practicePresentation
    ? '左滑下一题 · 右滑上一题'
    : view.answered
      ? '已显示解析 · 左滑下一题 · 右滑上一题'
      : q.answer_count === 1
        ? '点击选项立即提交 · 左右滑动切题'
        : '选择所有答案后提交 · 左右滑动切题';
  const modeLabel = view.mode === 'review' ? (view.reviewPresentation === 'quiz' ? '做题' : '背题') : '刷题';
  app.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="pill">${modeLabel} · ${view.category}</span><span class="pill">${view.index + 1}/${view.session.length}</span>${shouldShuffleOptions(q) ? '<span class="pill">选项随机</span>' : ''}</div>
      <div class="toolbar-right">
        ${view.mode === 'review' ? `<div class="presentation-toggle" aria-label="背题或做题"><button class="toggle-button ${view.reviewPresentation !== 'quiz' ? 'active' : ''}" data-review-presentation="study">背题</button><button class="toggle-button ${view.reviewPresentation === 'quiz' ? 'active' : ''}" data-review-presentation="quiz">做题</button></div>` : ''}
        ${['category', 'singleChoicePart', 'reviewTopic'].includes(view.origin) ? `<select id="orderSelect" class="select" aria-label="题目顺序"><option value="smart" ${view.order === 'smart' ? 'selected' : ''}>智能顺序</option><option value="sequential" ${view.order === 'sequential' ? 'selected' : ''}>题号顺序</option><option value="random" ${view.order === 'random' ? 'selected' : ''}>随机顺序</option></select>` : ''}
      </div>
    </div>
    <article class="question-card">
      <div class="question-head"><span class="question-number">第 ${q.question_no} 题</span><div class="question-tools"><button id="toggleQuestionStats" class="mini-button">${view.showQuestionStats ? '隐藏记录' : '显示记录'}</button><button id="favoriteButton" class="mini-button ${r.favorite ? 'favorite-active' : ''}">${r.favorite ? '★ 已收藏' : '☆ 收藏'}</button><button id="editQuestion" class="mini-button">编辑解析／备注</button></div></div>
      ${view.showQuestionStats ? `<p class="question-meta">${q.difficulty_source || '未标难度'} · ${statsText}</p>` : ''}
      <p class="stem">${escapeHtml(q.stem)}</p>
      <div class="options">${options}</div>
      ${answerBox}
      ${needsSubmitButton ? `<div class="actions single-action"><button id="submitAnswer" class="button button-primary" ${view.selected.size ? '' : 'disabled'}>${hasSavedRandomAnswer ? '更新答案并继续' : '提交答案'}</button></div>` : ''}
      <p class="gesture-hint">${gestureHint}</p>
    </article>`;
  app.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => toggleOption(button.dataset.option)));
  app.querySelectorAll('[data-review-presentation]').forEach(button => button.addEventListener('click', () => setReviewPresentation(button.dataset.reviewPresentation)));
  app.querySelector('#submitAnswer')?.addEventListener('click', submitAnswer);
  app.querySelector('#favoriteButton').addEventListener('click', toggleFavorite);
  app.querySelector('#toggleQuestionStats').addEventListener('click', toggleQuestionStats);
  app.querySelector('#editQuestion').addEventListener('click', showQuestionEditor);
  app.querySelector('#orderSelect')?.addEventListener('change', event => startSession(view.mode, view.category, event.target.value, view.origin));
  bindSwipeNavigation(app.querySelector('.question-card'));
}

function toggleOption(letter) {
  if (Date.now() - lastSwipeAt < 400 || view.answered || !isQuestionPractice()) return;
  const q = view.session[view.index];
  if (q.answer_count === 1) {
    view.selected = new Set([letter]);
    submitAnswer();
    return;
  }
  if (view.selected.has(letter)) view.selected.delete(letter);
  else view.selected.add(letter);
  renderQuestion();
}

function submitAnswer() {
  if (Date.now() - lastSwipeAt < 400 || view.answered || !view.selected.size) return;
  const q = view.session[view.index];
  const chosen = [...view.selected].sort();
  if (view.origin === 'random') {
    if (!view.sessionAnswers) view.sessionAnswers = {};
    view.sessionAnswers[String(q.question_no)] = chosen;
    advanceRandomAfterAnswer();
    return;
  }
  const correct = chosen.length === q.answer.length && chosen.every((item, index) => item === [...q.answer].sort()[index]);
  const r = getRecord(q.question_no);
  r.attempts += 1;
  r.correct += correct ? 1 : 0;
  r.wrong += correct ? 0 : 1;
  r.lastAnswered = new Date().toISOString();
  r.lastResult = correct;
  r.recent = [...(r.recent || []), correct].slice(-10);
  saveProgress();
  view.answered = true;
  view.correct = correct;
  renderQuestion();
}

function advanceRandomAfterAnswer() {
  const unansweredIndex = view.session.findIndex(question => !view.sessionAnswers?.[String(question.question_no)]?.length);
  if (unansweredIndex < 0) {
    renderRandomComplete();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (view.index < view.session.length - 1) view.index += 1;
  else view.index = unansweredIndex;
  view.selected = new Set(view.sessionAnswers?.[String(view.session[view.index].question_no)] || []);
  view.answered = false;
  view.correct = false;
  renderQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextQuestion() {
  if (view.index < view.session.length - 1) view.index += 1;
  else if (view.origin === 'random') {
    const unansweredIndex = view.session.findIndex(question => !view.sessionAnswers?.[String(question.question_no)]?.length);
    if (unansweredIndex >= 0) {
      view.index = unansweredIndex;
      showToast(`还有${view.session.filter(question => !view.sessionAnswers?.[String(question.question_no)]?.length).length}题未作答`);
    } else {
      renderRandomComplete();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  } else view.index = 0;
  view.selected = new Set(view.origin === 'random' ? (view.sessionAnswers?.[String(view.session[view.index].question_no)] || []) : []); view.answered = false; view.correct = false;
  renderQuestion(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previousQuestion() {
  if (view.index > 0) view.index -= 1;
  view.selected = new Set(view.origin === 'random' ? (view.sessionAnswers?.[String(view.session[view.index].question_no)] || []) : []); view.answered = false; view.correct = false;
  renderQuestion(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindSwipeNavigation(element, onNext = nextQuestion, onPrevious = previousQuestion) {
  if (!element) return;
  let start = null;
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  element.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    start = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    lastSwipeAt = Date.now();
    if (deltaX < 0) onNext();
    else onPrevious();
  });
  element.addEventListener('pointercancel', () => { start = null; });
}

function renderStats() {
  view.screen = 'stats'; setHeader(true);
  const s = summaryFor();
  const focus = questions.filter(q => getRecord(q.question_no).wrong > 0).sort((a, b) => smartScore(b) - smartScore(a)).slice(0, 50);
  const categoryRows = REVIEW_CATEGORY_ORDER.map(category => {
    const items = questions.filter(q => q.practice_category === category);
    const stat = summaryFor(items);
    return `<div class="stat-row"><strong>${category}</strong><div><span>${stat.touched}/${items.length} 题已作答</span><small>累计 ${stat.attempts} 次</small></div><div class="stat-value">正确率<br><b>${stat.accuracy}%</b></div></div>`;
  }).join('');
  const focusRows = focus.map(q => {
    const r = getRecord(q.question_no);
    return `<button class="stat-row" data-focus-question="${q.question_no}"><strong>第${q.question_no}题</strong><div><span>${q.practice_category}</span><small>答错 ${r.wrong} 次 / 共答 ${r.attempts} 次</small></div><div class="stat-value">${r.attempts ? Math.round(r.correct / r.attempts * 100) : 0}%</div></button>`;
  }).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">学习统计</p><h1>把时间花在最容易错的题上</h1><p>统计仅来自当前浏览器。智能顺序会综合错误次数、错误率和最近答题结果排序。</p></section>
    <section class="summary-grid"><article class="summary-card"><strong>${s.attempts}</strong><span>累计作答</span></article><article class="summary-card"><strong>${s.correct}</strong><span>回答正确</span></article><article class="summary-card"><strong>${s.wrong}</strong><span>回答错误</span></article></section>
    <div class="section-title"><div><h2>分类进度</h2></div></div><section class="stats-list">${categoryRows}</section>
    <div class="section-title"><div><h2>重点复习</h2><p>最多显示50题</p></div></div><section class="stats-list">${focusRows || '<div class="panel empty">暂时没有错题。</div>'}</section>`;
  app.querySelectorAll('[data-focus-question]').forEach(button => button.addEventListener('click', () => {
    const number = Number(button.dataset.focusQuestion);
    const items = questions.filter(q => getRecord(q.question_no).wrong > 0).sort((a, b) => smartScore(b) - smartScore(a));
    view = { screen: 'question', mode: 'practice', category: '重点复习', origin: 'focus', order: 'smart', index: Math.max(0, items.findIndex(q => q.question_no === number)), session: items, selected: new Set(), answered: false, correct: false, optionOrders: {}, sessionResults: {} };
    renderQuestion();
  }));
}

function showDataDialog() {
  const existing = document.querySelector('#dataDialog');
  if (existing) existing.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'dataDialog';
  dialog.innerHTML = `<div class="dialog-body"><h2>备份与恢复</h2><p>答题记录、收藏、个人解析、备注以及两个知识模块的修改和新增内容，都只保存在当前浏览器。建议偶尔导出备份；导入会替换当前浏览器记录。</p><div class="dialog-actions"><button id="exportData" class="button button-primary">导出全部记录</button><button id="importData" class="button button-secondary">导入全部记录</button><button id="resetData" class="button button-danger">清空记录并恢复知识点</button><button id="closeDialog" class="button button-secondary">关闭</button></div></div>`;
  document.body.appendChild(dialog); dialog.showModal();
  dialog.querySelector('#closeDialog').onclick = () => dialog.close();
  dialog.querySelector('#exportData').onclick = exportData;
  dialog.querySelector('#importData').onclick = () => importInput.click();
  dialog.querySelector('#resetData').onclick = () => {
    if (confirm('确定清空全部学习记录，并撤销两个知识模块中的修改和新增内容吗？此操作无法撤销。')) {
      localStorage.removeItem(STORAGE_KEY); progress = loadProgress(); reloadKnowledgeLibraries(); dialog.close(); renderHome(); showToast('全部记录已清空，知识点已恢复默认');
    }
  };
}

function exportData() {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `国网刷题记录_${new Date().toISOString().slice(0,10)}.json`;
  link.click(); URL.revokeObjectURL(link.href); showToast('学习记录已导出');
}

importInput.addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (imported?.version !== 1 || !imported.questions) throw new Error('格式不正确');
    progress = imported; saveProgress(); reloadKnowledgeLibraries(); showToast('学习记录和知识点已恢复'); renderHome();
  } catch (_) { alert('无法导入：文件格式不正确。'); }
  event.target.value = '';
});

function goBack() {
  if (view.screen === 'question' && view.origin === 'random') renderRandomSetup();
  else if (view.screen === 'question' && view.origin === 'favorites') renderHome();
  else if (view.screen === 'question' && view.origin === 'singleChoicePart') renderSingleChoiceParts();
  else if (view.screen === 'question' && view.origin === 'reviewTopic') renderReviewTopics();
  else if (view.screen === 'question') renderCategories(view.mode);
  else if (view.screen === 'singleChoiceParts') renderCategories('review');
  else if (view.screen === 'reviewTopics') renderCategories('review');
  else if (view.screen === 'randomComplete') renderRandomSetup();
  else if (view.screen === 'randomWrongReview') renderRandomComplete();
  else if (view.screen === 'knowledge') view.knowledgeModule === 'powerSystem' ? renderPowerSystemHub() : renderComputerHub();
  else if (view.screen === 'computerQuizSetup') renderComputerHub();
  else if (view.screen === 'computerQuizQuestion' || view.screen === 'computerQuizComplete') renderComputerQuizSetup();
  else if (view.screen === 'powerSystemHub') renderHome();
  else if (view.screen === 'computerHub') renderHome();
  else renderHome();
}

backButton.addEventListener('click', goBack);
homeButton.addEventListener('click', renderHome);
homeButton.addEventListener('keydown', event => { if (event.key === 'Enter') renderHome(); });
statsButton.addEventListener('click', renderStats);
dataButton.addEventListener('click', showDataDialog);

async function init() {
  try {
    const [questionResponse, basicsResponse, computerQuizResponse, powerSystemResponse, reviewTopicsResponse] = await Promise.all([fetch(DATA_URL), fetch(COMPUTER_BASICS_URL), fetch(COMPUTER_QUIZ_URL), fetch(POWER_SYSTEM_BASICS_URL), fetch(REVIEW_TOPICS_URL)]);
    if (!questionResponse.ok) throw new Error(`题库 HTTP ${questionResponse.status}`);
    if (!basicsResponse.ok) throw new Error(`计算机基础 HTTP ${basicsResponse.status}`);
    if (!computerQuizResponse.ok) throw new Error(`计算机测试题库 HTTP ${computerQuizResponse.status}`);
    if (!powerSystemResponse.ok) throw new Error(`电力系统基础 HTTP ${powerSystemResponse.status}`);
    if (!reviewTopicsResponse.ok) throw new Error(`专题索引 HTTP ${reviewTopicsResponse.status}`);
    const [questionPayload, basicsPayload, computerQuizPayload, powerSystemPayload, reviewTopicsPayload] = await Promise.all([questionResponse.json(), basicsResponse.json(), computerQuizResponse.json(), powerSystemResponse.json(), reviewTopicsResponse.json()]);
    questions = questionPayload.questions;
    metadata = questionPayload.metadata;
    defaultComputerBasics = basicsPayload.items;
    defaultPowerSystemBasics = powerSystemPayload.items;
    reloadKnowledgeLibraries();
    computerQuizQuestions = computerQuizPayload.questions;
    reviewTopics = reviewTopicsPayload.topics;
    renderHome();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (error) {
    app.innerHTML = `<section class="panel empty"><h2>内容载入失败</h2><p>${escapeHtml(error.message)}</p><button class="button button-primary" onclick="location.reload()">重新载入</button></section>`;
  }
}

init();
