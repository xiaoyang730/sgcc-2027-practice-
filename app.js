const DATA_URL = './data/questions.json';
const COMPUTER_BASICS_URL = './data/computer-basics.json';
const COMPUTER_QUIZ_URL = './data/computer-quiz.json';
const STORAGE_KEY = 'sgcc-question-progress-v1';
const REVIEW_CATEGORY_ORDER = ['单选', '多选两选', '多选三选', '多选全选', '判断对', '判断错'];
const PRACTICE_CATEGORY_ORDER = ['单选题', '多选题', '判断题'];
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
let computerBasics = [];
let computerQuizQuestions = [];
let progress = loadProgress();
let view = { screen: 'home', mode: null, category: null, origin: null, order: 'smart', index: 0, session: [], selected: new Set(), answered: false, correct: false, randomScope: '全部题库', randomCount: 20, sessionResults: {} };
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

function getRecord(id) {
  const key = String(id);
  if (!progress.questions[key]) {
    progress.questions[key] = { attempts: 0, correct: 0, wrong: 0, views: 0, known: null, recent: [], lastAnswered: null, lastResult: null, lastViewed: null };
  }
  return progress.questions[key];
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
  view = { ...view, screen: 'home', mode: null, category: null, origin: null, session: [], index: 0, selected: new Set(), answered: false, sessionResults: {} };
  setHeader(false);
  const s = summaryFor();
  const focus = questions.filter(q => getRecord(q.question_no).wrong > 0).length;
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
        <p>题干、正确答案和解析同时显示，左右滑动即可快速切换题目。</p>
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
        <span class="mode-icon">机</span><h3>计算机基础57条</h3>
        <p>分为知识点学习和随机测试：按钮逐条学习，再用单选、多选、判断检验掌握情况。</p>
      </button>
    </section>
    <div class="section-title"><div><h2>快速入口</h2><p>按错误频率优先</p></div></div>
    <section class="panel">
      ${focus ? `<button id="focusPractice" class="button button-primary" style="width:100%">开始重点复习（${focus}题）</button>` : `<div class="empty">完成一些刷题后，这里会出现你的重点复习题。</div>`}
    </section>`;
  app.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => renderCategories(button.dataset.mode)));
  app.querySelector('#randomQuiz')?.addEventListener('click', renderRandomSetup);
  app.querySelector('#computerBasics')?.addEventListener('click', renderComputerHub);
  app.querySelector('#focusPractice')?.addEventListener('click', startFocusPractice);
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
    <section class="hero"><p class="eyebrow">计算机基础专项</p><h1>先逐条学习，再随机检验</h1><p>学习模块完整呈现57条原文；测试模块只依据这57条组题，每道题均标注对应知识点。</p></section>
    <section class="mode-grid computer-mode-grid">
      <button class="mode-card" id="computerStudy">
        <span class="mode-icon">学</span><h3>知识点学习</h3>
        <p>一次查看一条，使用“上一条／下一条”按钮切换，共57条。</p>
      </button>
      <button class="mode-card" id="computerTest">
        <span class="mode-icon">测</span><h3>随机测试</h3>
        <p>单选、多选、判断共${computerQuizQuestions.length}题；已答${summary.attempts}次，正确率${summary.accuracy}%。</p>
      </button>
    </section>`;
  app.querySelector('#computerStudy').addEventListener('click', () => renderKnowledgePoint(0));
  app.querySelector('#computerTest').addEventListener('click', renderComputerQuizSetup);
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

function renderKnowledgePoint(index = 0) {
  if (!computerBasics.length) {
    app.innerHTML = `<section class="panel empty">计算机基础知识点尚未载入。</section>`;
    return;
  }
  const safeIndex = Math.max(0, Math.min(index, computerBasics.length - 1));
  const point = computerBasics[safeIndex];
  view = { ...view, screen: 'knowledge', knowledgeIndex: safeIndex };
  setHeader(true);
  app.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="pill">计算机基础57条</span><span class="pill">${safeIndex + 1}/${computerBasics.length}</span></div>
    </div>
    <article class="question-card knowledge-card">
      <div class="question-head"><span class="question-number">第 ${point.id} 条</span><span class="difficulty">逐条学习</span></div>
      <h2>${escapeHtml(point.title)}</h2>
      <div class="knowledge-content">${renderKnowledgeContent(point.content)}</div>
      <div class="knowledge-nav">
        <button id="previousKnowledge" class="button button-secondary" ${safeIndex === 0 ? 'disabled' : ''}>上一条</button>
        <button id="nextKnowledge" class="button button-primary" ${safeIndex === computerBasics.length - 1 ? 'disabled' : ''}>下一条</button>
      </div>
    </article>`;
  app.querySelector('#previousKnowledge').addEventListener('click', previousKnowledgePoint);
  app.querySelector('#nextKnowledge').addEventListener('click', nextKnowledgePoint);
}

function nextKnowledgePoint() {
  if (view.knowledgeIndex >= computerBasics.length - 1) {
    showToast('已经是最后一条');
    return;
  }
  renderKnowledgePoint(view.knowledgeIndex + 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previousKnowledgePoint() {
  if (view.knowledgeIndex <= 0) {
    showToast('已经是第一条');
    return;
  }
  renderKnowledgePoint(view.knowledgeIndex - 1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  const options = Object.entries(question.options).map(([letter, text]) => {
    const selected = view.selected.has(letter);
    const correct = view.answered && question.answer.includes(letter);
    const wrong = view.answered && selected && !question.answer.includes(letter);
    return `<button class="option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" data-computer-option="${letter}" ${view.answered ? 'disabled' : ''}>
      <span class="option-letter">${letter}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
  const source = computerBasics.find(item => item.id === question.source_id);
  const statsText = record.attempts ? `已答${record.attempts}次 · 对${record.correct} · 错${record.wrong}` : '尚未作答';
  const answerBox = view.answered ? `<div class="answer-box">
    <strong class="${view.correct ? 'result-good' : 'result-bad'}">${view.correct ? '回答正确' : '回答错误'} · 正确答案：${question.answer.join('、')}</strong>
    <p>${escapeHtml(question.explanation)}</p>
    <p class="question-source">依据：第${question.source_id}条${source ? `「${escapeHtml(source.title)}」` : ''}</p>
  </div>` : '';
  const needsSubmit = question.answer_count > 1 && !view.answered;
  const isLast = view.index === view.computerSession.length - 1;
  app.innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><span class="pill">计算机随机测试 · ${question.question_type}</span><span class="pill">${view.index + 1}/${view.computerSession.length}</span></div></div>
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
    <section class="hero"><p class="eyebrow">${title}</p><h1>选择题目分类</h1><p>${isReview ? '答案和解析始终显示，按答案特征细分为六类。' : '按基础题型混合答案结构，不提前透露多选数量或判断正误。'}</p></section>
    <div class="section-title"><div><h2>${isReview ? '六类背题' : '三类刷题'}</h2><p>合计 ${questions.length} 题</p></div></div>
    <section class="category-grid">${cards}</section>`;
  app.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => startSession(mode, button.dataset.category)));
}

function renderRandomSetup() {
  view = { ...view, screen: 'randomSetup', mode: 'practice', category: '随机组卷', origin: 'random', session: [], index: 0, selected: new Set(), answered: false, sessionResults: {} };
  setHeader(true);
  const scopeOptions = ['全部题库', ...PRACTICE_CATEGORY_ORDER].map(scope => `<option value="${scope}" ${view.randomScope === scope ? 'selected' : ''}>${scope}</option>`).join('');
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">随机刷题</p><h1>自己设置这一组刷多少题</h1><p>从所选范围内无重复随机抽取。每次重新开始都会生成一组新题，作答结果照常计入个人统计。</p></section>
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
        ${[10, 20, 30, 50, 100].map(count => `<button class="preset-button" data-random-count="${count}">${count}题</button>`).join('')}
      </div>
      <p id="randomLimit" class="random-note">全部题库可抽取 ${questions.length} 题。</p>
    </section>`;
  const scopeSelect = app.querySelector('#randomScope');
  const countInput = app.querySelector('#randomCount');
  const limitText = app.querySelector('#randomLimit');
  const updateLimit = () => {
    const poolSize = getRandomPool(scopeSelect.value).length;
    countInput.max = poolSize;
    limitText.textContent = `${scopeSelect.value}可抽取 ${poolSize} 题。`;
  };
  scopeSelect.addEventListener('change', updateLimit);
  app.querySelectorAll('[data-random-count]').forEach(button => button.addEventListener('click', () => { countInput.value = button.dataset.randomCount; }));
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
  const session = shuffleQuestions(pool).slice(0, requestedCount);
  view = { screen: 'question', mode: 'practice', category: scope === '全部题库' ? '随机组卷' : `随机·${scope}`, origin: 'random', order: 'random', index: 0, session, selected: new Set(), answered: false, correct: false, randomScope: scope, randomCount: requestedCount, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function renderRandomComplete() {
  view.screen = 'randomComplete';
  setHeader(true);
  const results = Object.values(view.sessionResults || {});
  const answered = results.length;
  const correct = results.filter(Boolean).length;
  const wrong = answered - correct;
  const unanswered = view.session.length - answered;
  const accuracy = answered ? Math.round(correct / answered * 100) : 0;
  app.innerHTML = `
    <section class="hero"><p class="eyebrow">本组完成</p><h1>${correct}/${answered || 0} 题正确</h1><p>已作答 ${answered} 题，正确率 ${accuracy}%${unanswered ? `，另有 ${unanswered} 题未作答` : ''}。结果已计入当前浏览器的个人统计。</p></section>
    <section class="summary-grid"><article class="summary-card"><strong>${view.session.length}</strong><span>本组题数</span></article><article class="summary-card"><strong>${correct}</strong><span>回答正确</span></article><article class="summary-card"><strong>${wrong}</strong><span>回答错误</span></article></section>
    <section class="panel"><div class="actions"><button id="randomSettings" class="button button-secondary">修改设置</button><button id="randomAgain" class="button button-primary">同样设置再来一组</button></div></section>`;
  app.querySelector('#randomSettings').addEventListener('click', renderRandomSetup);
  app.querySelector('#randomAgain').addEventListener('click', () => startRandomSession(view.randomScope, view.randomCount));
}

function getCategoryQuestions(mode, category) {
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

function startSession(mode, category, order = mode === 'practice' ? 'smart' : 'sequential') {
  view = { screen: 'question', mode, category, origin: 'category', order, index: 0, session: buildSession(mode, category, order), selected: new Set(), answered: false, correct: false, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function startFocusPractice() {
  const items = questions.filter(q => getRecord(q.question_no).wrong > 0).sort((a, b) => smartScore(b) - smartScore(a));
  view = { screen: 'question', mode: 'practice', category: '重点复习', origin: 'focus', order: 'smart', index: 0, session: items, selected: new Set(), answered: false, correct: false, sessionResults: {} };
  setHeader(true);
  renderQuestion();
}

function renderQuestion() {
  const q = view.session[view.index];
  if (!q) {
    app.innerHTML = `<section class="panel empty">当前分类没有题目。</section>`;
    return;
  }
  if (view.mode === 'review') {
    const r = getRecord(q.question_no);
    r.views += 1; r.lastViewed = new Date().toISOString(); saveProgress();
  }
  const r = getRecord(q.question_no);
  const answerVisible = view.mode === 'review' || view.answered;
  const explanationVisible = Boolean(q.explanation?.trim()) && !HIDE_EXPLANATION_CATEGORIES.has(q.practice_category);
  const options = Object.entries(q.options).map(([letter, text]) => {
    const selected = view.selected.has(letter);
    const isCorrect = answerVisible && q.answer.includes(letter);
    const isWrong = answerVisible && selected && !q.answer.includes(letter);
    return `<button class="option ${selected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}" data-option="${letter}" ${answerVisible ? 'disabled' : ''}>
      <span class="option-letter">${letter}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
  const statsText = r.attempts ? `已答 ${r.attempts} 次 · 对 ${r.correct} · 错 ${r.wrong} · 正确率 ${Math.round(r.correct / r.attempts * 100)}%` : '尚未作答';
  const answerBox = answerVisible ? `<div class="answer-box">
    ${view.mode === 'practice' ? `<strong class="${view.correct ? 'result-good' : 'result-bad'}">${view.correct ? '回答正确' : '回答错误'} · ` : '<strong>'}正确答案：${q.answer.join('、')}</strong>
    ${explanationVisible ? `<p>${escapeHtml(q.explanation)}</p>` : ''}
  </div>` : '';
  const needsSubmitButton = view.mode === 'practice' && q.answer_count > 1 && !view.answered;
  const gestureHint = view.mode === 'review'
    ? '左滑下一题 · 右滑上一题'
    : view.answered
      ? '已显示解析 · 左滑下一题 · 右滑上一题'
      : q.answer_count === 1
        ? '点击选项立即提交 · 左右滑动切题'
        : '选择所有答案后提交 · 左右滑动切题';
  app.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><span class="pill">${view.mode === 'review' ? '背题' : '刷题'} · ${view.category}</span><span class="pill">${view.index + 1}/${view.session.length}</span></div>
      <div class="toolbar-right">
        ${view.category !== '重点复习' && view.origin !== 'random' ? `<select id="orderSelect" class="select" aria-label="题目顺序"><option value="smart" ${view.order === 'smart' ? 'selected' : ''}>智能顺序</option><option value="sequential" ${view.order === 'sequential' ? 'selected' : ''}>题号顺序</option><option value="random" ${view.order === 'random' ? 'selected' : ''}>随机顺序</option></select>` : ''}
      </div>
    </div>
    <article class="question-card">
      <div class="question-head"><span class="question-number">第 ${q.question_no} 题</span><span class="difficulty">${q.difficulty_source || '未标难度'} · ${statsText}</span></div>
      <p class="stem">${escapeHtml(q.stem)}</p>
      <div class="options">${options}</div>
      ${answerBox}
      ${needsSubmitButton ? `<div class="actions single-action"><button id="submitAnswer" class="button button-primary" ${view.selected.size ? '' : 'disabled'}>提交答案</button></div>` : ''}
      <p class="gesture-hint">${gestureHint}</p>
    </article>`;
  app.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => toggleOption(button.dataset.option)));
  app.querySelector('#submitAnswer')?.addEventListener('click', submitAnswer);
  app.querySelector('#orderSelect')?.addEventListener('change', event => startSession(view.mode, view.category, event.target.value));
  bindSwipeNavigation(app.querySelector('.question-card'));
}

function toggleOption(letter) {
  if (Date.now() - lastSwipeAt < 400 || view.answered || view.mode === 'review') return;
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
  const correct = chosen.length === q.answer.length && chosen.every((item, index) => item === [...q.answer].sort()[index]);
  const r = getRecord(q.question_no);
  r.attempts += 1;
  r.correct += correct ? 1 : 0;
  r.wrong += correct ? 0 : 1;
  r.lastAnswered = new Date().toISOString();
  r.lastResult = correct;
  r.recent = [...(r.recent || []), correct].slice(-10);
  if (view.origin === 'random') view.sessionResults[String(q.question_no)] = correct;
  saveProgress();
  view.answered = true;
  view.correct = correct;
  renderQuestion();
}

function nextQuestion() {
  if (view.index < view.session.length - 1) view.index += 1;
  else if (view.origin === 'random') {
    renderRandomComplete();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  } else view.index = 0;
  view.selected = new Set(); view.answered = false; view.correct = false;
  renderQuestion(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previousQuestion() {
  if (view.index > 0) view.index -= 1;
  view.selected = new Set(); view.answered = false; view.correct = false;
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
    view = { screen: 'question', mode: 'practice', category: '重点复习', origin: 'focus', order: 'smart', index: Math.max(0, items.findIndex(q => q.question_no === number)), session: items, selected: new Set(), answered: false, correct: false, sessionResults: {} };
    renderQuestion();
  }));
}

function showDataDialog() {
  const existing = document.querySelector('#dataDialog');
  if (existing) existing.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'dataDialog';
  dialog.innerHTML = `<div class="dialog-body"><h2>备份与恢复</h2><p>学习记录只保存在当前浏览器。建议偶尔导出备份；导入会合并并覆盖同题记录。</p><div class="dialog-actions"><button id="exportData" class="button button-primary">导出学习记录</button><button id="importData" class="button button-secondary">导入学习记录</button><button id="resetData" class="button button-danger">清空全部学习记录</button><button id="closeDialog" class="button button-secondary">关闭</button></div></div>`;
  document.body.appendChild(dialog); dialog.showModal();
  dialog.querySelector('#closeDialog').onclick = () => dialog.close();
  dialog.querySelector('#exportData').onclick = exportData;
  dialog.querySelector('#importData').onclick = () => importInput.click();
  dialog.querySelector('#resetData').onclick = () => {
    if (confirm('确定清空当前浏览器中的全部学习记录吗？此操作无法撤销。')) {
      localStorage.removeItem(STORAGE_KEY); progress = loadProgress(); dialog.close(); renderHome(); showToast('学习记录已清空');
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
    progress = imported; saveProgress(); showToast('学习记录已恢复'); renderHome();
  } catch (_) { alert('无法导入：文件格式不正确。'); }
  event.target.value = '';
});

function goBack() {
  if (view.screen === 'question' && view.origin === 'random') renderRandomSetup();
  else if (view.screen === 'question') renderCategories(view.mode);
  else if (view.screen === 'randomComplete') renderRandomSetup();
  else if (view.screen === 'knowledge' || view.screen === 'computerQuizSetup') renderComputerHub();
  else if (view.screen === 'computerQuizQuestion' || view.screen === 'computerQuizComplete') renderComputerQuizSetup();
  else renderHome();
}

backButton.addEventListener('click', goBack);
homeButton.addEventListener('click', renderHome);
homeButton.addEventListener('keydown', event => { if (event.key === 'Enter') renderHome(); });
statsButton.addEventListener('click', renderStats);
dataButton.addEventListener('click', showDataDialog);

async function init() {
  try {
    const [questionResponse, basicsResponse, computerQuizResponse] = await Promise.all([fetch(DATA_URL), fetch(COMPUTER_BASICS_URL), fetch(COMPUTER_QUIZ_URL)]);
    if (!questionResponse.ok) throw new Error(`题库 HTTP ${questionResponse.status}`);
    if (!basicsResponse.ok) throw new Error(`计算机基础 HTTP ${basicsResponse.status}`);
    if (!computerQuizResponse.ok) throw new Error(`计算机测试题库 HTTP ${computerQuizResponse.status}`);
    const [questionPayload, basicsPayload, computerQuizPayload] = await Promise.all([questionResponse.json(), basicsResponse.json(), computerQuizResponse.json()]);
    questions = questionPayload.questions;
    metadata = questionPayload.metadata;
    computerBasics = basicsPayload.items;
    computerQuizQuestions = computerQuizPayload.questions;
    renderHome();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (error) {
    app.innerHTML = `<section class="panel empty"><h2>内容载入失败</h2><p>${escapeHtml(error.message)}</p><button class="button button-primary" onclick="location.reload()">重新载入</button></section>`;
  }
}

init();
