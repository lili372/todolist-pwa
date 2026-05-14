/* ===== 数据层 ===== */
const STORAGE_KEY = 'todolist-data';
const DEFAULT_LISTS = [
  { id: 'inbox', name: '收件箱', color: '#4a9eff' },
  { id: 'work', name: '工作', color: '#ef4444' },
  { id: 'life', name: '生活', color: '#10b981' }
];

const state = {
  lists: [],
  tasks: [],
  view: 'today',
  filterListId: 'all',
  editingId: null,
  editingListId: null,
  selectedPrio: 4,
  selectedColor: '#4a9eff',
  selectedRecurring: null
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.lists = Array.isArray(data.lists) && data.lists.length ? data.lists : [...DEFAULT_LISTS];
      state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      return;
    }
  } catch (e) {
    console.error('数据读取失败', e);
    // 数据损坏时必须立即让用户看到，否则后续任何操作都会把空数据覆盖写回
    try {
      alert('数据读取失败！\n\n' + e.message + '\n\n为防止覆盖原始数据，请先截图并刷新页面。如仍无法恢复，请用之前导出的备份文件导入。');
    } catch (_) {}
  }
  state.lists = [...DEFAULT_LISTS];
  state.tasks = [];
}

function save() {
  // 空写拦截：如果内存里有任务，但要写入的 tasks 是空数组，说明出异常了
  // 除非调用方通过 __allowEmpty 明确允许（用户删到最后一条、覆盖导入空备份）
  const prevRaw = localStorage.getItem(STORAGE_KEY);
  if (prevRaw && !state.__allowEmpty) {
    try {
      const prev = JSON.parse(prevRaw);
      const prevCount = Array.isArray(prev.tasks) ? prev.tasks.length : 0;
      const nextCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
      if (prevCount > 0 && nextCount === 0) {
        console.error('[save] 拦截空写入', { prevCount, nextCount });
        alert('检测到异常的空写入，已拦截保存。\n\n请截图当前页面，然后刷新页面重新加载数据。如问题复现，请用之前导出的备份文件恢复。');
        return;
      }
    } catch (_) {
      // prevRaw 解析失败属于独立问题，不影响本次写入决策
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lists: state.lists,
      tasks: state.tasks
    }));
  } catch (e) {
    alert('存储空间已满，请删除一些已完成的任务后再试。');
    console.error('保存失败', e);
  }
}

/* ===== 工具 ===== */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  if (dateStr === today) return '今天';
  if (dateStr === tomorrow) return '明天';
  if (dateStr === yesterday) return '昨天';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(dateStr) {
  return dateStr && dateStr < todayStr();
}

function sameDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 把 'YYYY-MM-DD' 转成相对今天的天数差（今天=0，昨天=1，前天=2）
// 加 T00:00:00 强制按本地时区解析，避免时区漂移
function daysSince(dateStr) {
  if (!dateStr) return null;
  const past = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((today - past) / 86400000);
}

// 时间戳 → 'YYYY-MM-DD'，用于把 createdAt 接入 daysSince
function tsToDateStr(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getList(listId) {
  return state.lists.find(l => l.id === listId) || state.lists[0];
}

/* ===== 重复任务工具 ===== */
function isDaily(task) {
  return task.recurring === 'daily';
}

function isFollowup(task) {
  return task.recurring === 'followup';
}

function isAnyRecurring(task) {
  return isDaily(task) || isFollowup(task);
}

function isDoneToday(task) {
  if (isDaily(task)) {
    return Array.isArray(task.completedDates) && task.completedDates.includes(todayStr());
  }
  return !!task.done;
}

function getStreakStats(completedDates) {
  if (!Array.isArray(completedDates) || completedDates.length === 0) {
    return { current: 0, best: 0, total: 0 };
  }
  const sorted = [...new Set(completedDates)].sort();
  const total = sorted.length;

  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
    if (Math.round(diff) === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  const set = new Set(sorted);
  const today = todayStr();
  const yesterday = addDays(today, -1);
  let cursor = set.has(today) ? today : (set.has(yesterday) ? yesterday : null);
  let current = 0;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, best, total };
}

/* ===== 过滤 ===== */
function filteredTasks() {
  const today = todayStr();
  const weekLater = addDays(today, 7);
  let tasks = state.tasks.slice();

  if (state.filterListId !== 'all') {
    tasks = tasks.filter(t => t.listId === state.filterListId);
  }

  if (state.view === 'today') {
    tasks = tasks.filter(t => {
      if (isDaily(t)) return true;
      if (!t.done) return t.dueDate && t.dueDate <= today;
      return t.completedAt && sameDay(t.completedAt, Date.now());
    });
  } else if (state.view === 'upcoming') {
    tasks = tasks.filter(t => {
      if (isDaily(t)) return false;
      if (!t.done) return t.dueDate && t.dueDate <= weekLater;
      return t.completedAt && Date.now() - t.completedAt <= 7 * 24 * 3600 * 1000;
    });
  }

  return tasks.sort((a, b) => {
    const aDone = isDoneToday(a);
    const bDone = isDoneToday(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const ad = a.dueDate || '9999-12-31';
    const bd = b.dueDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.createdAt - a.createdAt;
  });
}

/* ===== 渲染 ===== */
const el = {
  viewTabs: document.getElementById('viewTabs'),
  listFilter: document.getElementById('listFilter'),
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  fab: document.getElementById('fab'),
  taskModal: document.getElementById('taskModal'),
  taskForm: document.getElementById('taskForm'),
  modalTitle: document.getElementById('modalTitle'),
  closeModal: document.getElementById('closeModal'),
  taskIdInput: document.getElementById('taskId'),
  taskTitle: document.getElementById('taskTitle'),
  taskListSelect: document.getElementById('taskList-select'),
  taskDate: document.getElementById('taskDate'),
  dateFieldLabel: document.getElementById('dateFieldLabel'),
  clearDate: document.getElementById('clearDate'),
  priorityRow: document.getElementById('priorityRow'),
  recurringSegment: document.getElementById('recurringSegment'),
  recurringHint: document.getElementById('recurringHint'),
  dateField: document.getElementById('dateField'),
  deleteTaskBtn: document.getElementById('deleteTaskBtn'),
  listModal: document.getElementById('listModal'),
  closeListModal: document.getElementById('closeListModal'),
  listManage: document.getElementById('listManage'),
  listForm: document.getElementById('listForm'),
  newListName: document.getElementById('newListName'),
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMsg: document.getElementById('confirmMsg'),
  confirmOk: document.getElementById('confirmOk'),
  confirmCancel: document.getElementById('confirmCancel'),
  importBtn: document.getElementById('importBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  colorRow: document.getElementById('colorRow'),
  listSubmitBtn: document.getElementById('listSubmitBtn'),
  cancelEditListBtn: document.getElementById('cancelEditListBtn'),
  versionLine: document.getElementById('versionLine'),
  followupModal: document.getElementById('followupModal'),
  followupGrid: document.getElementById('followupGrid'),
  followupActualDate: document.getElementById('followupActualDate'),
  followupCustomWrap: document.getElementById('followupCustomWrap'),
  followupCustomInput: document.getElementById('followupCustomInput'),
  followupCustomOk: document.getElementById('followupCustomOk'),
  followupCancel: document.getElementById('followupCancel'),
  followupEnd: document.getElementById('followupEnd')
};

const LIST_COLORS = ['#4a9eff', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#9ca3af'];

/* ===== 顺延弹窗 ===== */
// 返回 null（取消） / { kind: 'days', days: N, actualDate } / { kind: 'end', actualDate }
function chooseFollowupAction() {
  return new Promise(resolve => {
    el.followupCustomWrap.hidden = true;
    el.followupCustomInput.value = '';
    el.followupActualDate.value = todayStr();
    el.followupActualDate.max = todayStr(); // 实际完成日期不能是未来
    el.followupModal.hidden = false;

    const cleanup = () => {
      el.followupModal.hidden = true;
      el.followupCustomWrap.hidden = true;
      el.followupGrid.removeEventListener('click', onGrid);
      el.followupCustomOk.removeEventListener('click', onCustomOk);
      el.followupCancel.removeEventListener('click', onCancel);
      el.followupEnd.removeEventListener('click', onEnd);
      el.followupModal.removeEventListener('click', onBackdrop);
    };
    const getActual = () => el.followupActualDate.value || todayStr();
    const done = v => { cleanup(); resolve(v); };
    const onGrid = e => {
      const btn = e.target.closest('.fu-btn');
      if (!btn) return;
      if (btn.dataset.days === 'custom') {
        el.followupCustomWrap.hidden = false;
        setTimeout(() => el.followupCustomInput.focus(), 50);
        return;
      }
      done({ kind: 'days', days: Number(btn.dataset.days), actualDate: getActual() });
    };
    const onCustomOk = () => {
      const n = parseInt(el.followupCustomInput.value, 10);
      if (!n || n < 1 || n > 365) return;
      done({ kind: 'days', days: n, actualDate: getActual() });
    };
    const onCancel = () => done(null);
    const onEnd = () => done({ kind: 'end', actualDate: getActual() });
    const onBackdrop = e => { if (e.target === el.followupModal) done(null); };

    el.followupGrid.addEventListener('click', onGrid);
    el.followupCustomOk.addEventListener('click', onCustomOk);
    el.followupCancel.addEventListener('click', onCancel);
    el.followupEnd.addEventListener('click', onEnd);
    el.followupModal.addEventListener('click', onBackdrop);
  });
}

/* ===== 自定义确认弹窗 ===== */
function confirmDialog({ title = '确认', message = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise(resolve => {
    el.confirmTitle.textContent = title;
    el.confirmMsg.textContent = message;
    el.confirmOk.textContent = okText;
    el.confirmCancel.textContent = cancelText;
    el.confirmCancel.hidden = !cancelText;
    el.confirmOk.classList.toggle('danger', danger);
    el.confirmModal.hidden = false;

    const close = result => {
      el.confirmModal.hidden = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onCancel);
      el.confirmModal.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = e => { if (e.target === el.confirmModal) close(false); };

    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onCancel);
    el.confirmModal.addEventListener('click', onBackdrop);
  });
}

function renderListFilter() {
  const allChip = `<button class="list-chip ${state.filterListId === 'all' ? 'active' : ''}" data-list="all">全部</button>`;
  const listChips = state.lists.map(l => `
    <button class="list-chip ${state.filterListId === l.id ? 'active' : ''}" data-list="${l.id}">
      <span class="dot" style="background:${l.color}"></span>${l.name}
    </button>
  `).join('');
  const manageChip = `<button class="list-chip manage" id="manageListsBtn">⚙ 管理</button>`;
  el.listFilter.innerHTML = allChip + listChips + manageChip;
}

function renderTasks() {
  const tasks = filteredTasks();
  if (tasks.length === 0) {
    el.taskList.innerHTML = '';
    el.emptyState.hidden = false;
    return;
  }
  el.emptyState.hidden = true;
  el.taskList.innerHTML = tasks.map(t => {
    const list = getList(t.listId);
    const doneToday = isDoneToday(t);
    const daily = isDaily(t);
    const followup = isFollowup(t);
    const dateClass = isOverdue(t.dueDate) && !doneToday ? 'date overdue' : 'date';
    const dueHtml = !daily && t.dueDate
      ? `<span class="${dateClass}"><span class="date-label">截止</span><span class="date-value">${formatDate(t.dueDate)}</span></span>`
      : '';
    const listHtml = state.filterListId === 'all'
      ? `<span class="list-tag"><span class="dot" style="background:${list.color}"></span>${list.name}</span>`
      : '';
    let streakHtml = '';
    if (daily) {
      const s = getStreakStats(t.completedDates);
      if (s.total > 0) {
        streakHtml = `<span class="streak">连续 ${s.current} 天 · 最高 ${s.best} · 累计 ${s.total}</span>`;
      } else {
        streakHtml = `<span class="streak streak-empty">每日</span>`;
      }
    } else if (followup) {
      // 顺延任务的"距上次/距创建 D 天"放下方独立位置，这里只保留"顺延"小标签
      streakHtml = `<span class="streak streak-empty">顺延</span>`;
    }
    // 下方时间区域：
    //   一次性任务 → 创建时间（精确到秒）
    //   每日任务 → 不显示
    //   顺延任务做过 → 距上次 D 天
    //   顺延任务从未做过 → 距创建 D 天（用日期差，让"距创建"语义和"距上次"统一）
    let createdHtml = '';
    if (followup) {
      const lastDate = Array.isArray(t.completedDates) && t.completedDates.length > 0
        ? t.completedDates[t.completedDates.length - 1]
        : null;
      if (lastDate) {
        const d = daysSince(lastDate);
        const label = d === 0 ? '今天' : `${d} 天`;
        createdHtml = `<span class="created"><span class="created-value">距上次 ${label}</span></span>`;
      } else {
        const d = daysSince(tsToDateStr(t.createdAt));
        const label = d === 0 ? '今天' : `${d} 天`;
        createdHtml = `<span class="created"><span class="created-value">距创建 ${label}</span></span>`;
      }
    } else if (!daily) {
      createdHtml = `<span class="created"><span class="created-value">${formatDateTime(t.createdAt)}</span></span>`;
    }
    return `
      <li class="task-item ${doneToday ? 'done' : ''}" data-id="${t.id}">
        <button class="task-check" data-prio="${t.priority}" data-action="toggle" aria-label="完成"></button>
        <div class="task-body" data-action="edit">
          <div class="task-title-wrap"><span class="task-title">${escapeHtml(t.title)}</span></div>
          <div class="task-meta">${dueHtml}${listHtml}${streakHtml}${createdHtml}</div>
        </div>
      </li>
    `;
  }).join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderListSelect() {
  el.taskListSelect.innerHTML = state.lists.map(l =>
    `<option value="${l.id}">${escapeHtml(l.name)}</option>`
  ).join('');
}

function renderListManage() {
  el.listManage.innerHTML = state.lists.map(l => {
    const count = state.tasks.filter(t => t.listId === l.id).length;
    const canDelete = state.lists.length > 1;
    return `
      <li>
        <span class="dot" style="background:${l.color}"></span>
        <span class="name">${escapeHtml(l.name)}</span>
        <span class="count">${count}</span>
        <button class="edit-btn" data-edit-list="${l.id}" aria-label="编辑">✎</button>
        <button class="remove-btn" data-remove-list="${l.id}" ${canDelete ? '' : 'disabled'} aria-label="删除">×</button>
      </li>
    `;
  }).join('');
}

function render() {
  renderListFilter();
  renderTasks();
}

/* ===== 弹窗 ===== */
function openTaskModal(taskId = null) {
  state.editingId = taskId;
  renderListSelect();
  if (taskId) {
    const t = state.tasks.find(x => x.id === taskId);
    if (!t) return;
    el.modalTitle.textContent = '编辑任务';
    el.taskIdInput.value = t.id;
    el.taskTitle.value = t.title;
    el.taskListSelect.value = t.listId;
    el.taskDate.value = t.dueDate || '';
    setPriority(t.priority);
    setRecurring(t.recurring || null);
    el.deleteTaskBtn.hidden = false;
  } else {
    el.modalTitle.textContent = '新建任务';
    el.taskIdInput.value = '';
    el.taskTitle.value = '';
    el.taskListSelect.value = state.filterListId !== 'all' ? state.filterListId : state.lists[0].id;
    el.taskDate.value = '';
    setPriority(4);
    setRecurring(null);
    el.deleteTaskBtn.hidden = true;
  }
  el.taskModal.hidden = false;
  setTimeout(() => el.taskTitle.focus(), 100);
}

function closeTaskModal() {
  el.taskModal.hidden = true;
  state.editingId = null;
}

function setPriority(p) {
  state.selectedPrio = p;
  el.priorityRow.querySelectorAll('.prio-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.prio) === p);
  });
}

function setRecurring(value) {
  const v = value === 'daily' || value === 'followup' ? value : null;
  state.selectedRecurring = v;
  el.recurringSegment.querySelectorAll('.seg-btn').forEach(btn => {
    const match = (btn.dataset.recurring === 'none' && v === null) || btn.dataset.recurring === v;
    btn.classList.toggle('active', match);
    btn.setAttribute('aria-checked', match);
  });
  el.dateField.hidden = v === 'daily';
  if (v === 'followup') {
    el.dateFieldLabel.textContent = '下次做';
    el.taskDate.min = todayStr();
    if (!state.editingId && !el.taskDate.value) {
      el.taskDate.value = todayStr();
    }
  } else {
    el.dateFieldLabel.textContent = '截止日期';
    el.taskDate.removeAttribute('min');
  }
  if (v === 'daily') {
    el.recurringHint.textContent = '每天自动出现在"今天"，忽略截止日期';
  } else if (v === 'followup') {
    el.recurringHint.textContent = '完成时可以顺延到几天后，或选择"结束"归档';
  } else {
    el.recurringHint.textContent = '';
  }
}

function openListModal() {
  exitListEdit();
  renderListManage();
  renderColorPicker();
  el.newListName.value = '';
  state.selectedColor = LIST_COLORS[0];
  el.listModal.hidden = false;
  renderVersion();
}

// 从 Service Worker 缓存名反推当前激活版本，显示 SW 层的事实而非代码声明
async function renderVersion() {
  if (!el.versionLine) return;
  try {
    if (!('caches' in self)) {
      el.versionLine.textContent = '（无 SW 支持）';
      return;
    }
    const keys = await caches.keys();
    const match = keys.find(k => k.startsWith('todolist-v'));
    el.versionLine.textContent = match ? match.replace('todolist-', '') + ' · todolist' : '（SW 未激活）';
  } catch {
    el.versionLine.textContent = '—';
  }
}

function enterListEdit(listId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  state.editingListId = listId;
  el.newListName.value = list.name;
  el.newListName.placeholder = '清单名称';
  state.selectedColor = list.color;
  renderColorPicker();
  el.listSubmitBtn.textContent = '保存修改';
  el.cancelEditListBtn.hidden = false;
  el.newListName.focus();
}

function exitListEdit() {
  state.editingListId = null;
  el.newListName.value = '';
  el.newListName.placeholder = '新清单名称';
  state.selectedColor = LIST_COLORS[0];
  renderColorPicker();
  el.listSubmitBtn.textContent = '添加清单';
  el.cancelEditListBtn.hidden = true;
}

function renderColorPicker() {
  el.colorRow.innerHTML = LIST_COLORS.map(c => `
    <button type="button" class="color-btn ${c === state.selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>
  `).join('');
}

function closeListModal() {
  el.listModal.hidden = true;
}

/* ===== 任务操作 ===== */
function saveTask(e) {
  e.preventDefault();
  const title = el.taskTitle.value.trim();
  if (!title) return;
  const recurring = state.selectedRecurring; // null | 'daily' | 'followup'
  let dueDate;
  if (recurring === 'daily') {
    dueDate = null;
  } else if (recurring === 'followup') {
    // 顺延任务必须有"下次做"日期，没填则默认今天，避免任务在今天/最近视图失踪
    dueDate = el.taskDate.value || todayStr();
  } else {
    dueDate = el.taskDate.value || null;
  }
  const payload = {
    title,
    listId: el.taskListSelect.value,
    dueDate,
    priority: state.selectedPrio,
    recurring: recurring
  };
  if (state.editingId) {
    const t = state.tasks.find(x => x.id === state.editingId);
    if (t) {
      const wasRecurring = t.recurring || null;
      Object.assign(t, payload);
      if (!Array.isArray(t.completedDates)) t.completedDates = [];
      if (wasRecurring !== recurring) {
        t.done = false;
        t.completedAt = null;
      }
    }
  } else {
    state.tasks.push({
      id: uid(),
      done: false,
      createdAt: Date.now(),
      completedAt: null,
      completedDates: [],
      ...payload
    });
  }
  save();
  render();
  closeTaskModal();
}

async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (isDaily(t)) {
    const today = todayStr();
    if (!Array.isArray(t.completedDates)) t.completedDates = [];
    if (t.completedDates.includes(today)) {
      t.completedDates = t.completedDates.filter(d => d !== today);
    } else {
      t.completedDates.push(today);
    }
    save();
    render();
    return;
  }
  if (isFollowup(t)) {
    if (t.done) {
      // 取消结束：回滚当日点击时追加的那次打卡，避免"已做 N 次"虚高
      t.done = false;
      t.completedAt = null;
      const today = todayStr();
      if (Array.isArray(t.completedDates) && t.completedDates.length > 0
          && t.completedDates[t.completedDates.length - 1] === today) {
        t.completedDates.pop();
      }
      save();
      render();
      return;
    }
    const choice = await chooseFollowupAction();
    if (choice === null) return;
    if (!Array.isArray(t.completedDates)) t.completedDates = [];
    const actual = choice.actualDate || todayStr();
    t.completedDates.push(actual);
    if (choice.kind === 'end') {
      t.done = true;
      t.completedAt = Date.now();
    } else {
      // 下次提醒从用户填的实际完成日期算起，不是从今天，避免长期偏移
      t.dueDate = addDays(actual, choice.days);
      t.done = false;
      t.completedAt = null;
    }
    save();
    render();
    return;
  }
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : null;
  save();
  render();
}

async function deleteTask(id) {
  const ok = await confirmDialog({
    title: '删除任务',
    message: '确定要删除这个任务吗？',
    okText: '删除',
    danger: true
  });
  if (!ok) return;
  state.tasks = state.tasks.filter(x => x.id !== id);
  // 合法的空写入：用户主动删到最后一条
  state.__allowEmpty = true;
  save();
  delete state.__allowEmpty;
  render();
  closeTaskModal();
}

/* ===== 清单操作 ===== */
function addList(name, color) {
  state.lists.push({ id: uid(), name, color });
  save();
  renderListManage();
  renderListFilter();
}

function updateList(listId, name, color) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  list.name = name;
  list.color = color;
  save();
  render();
  renderListManage();
}

async function removeList(listId) {
  if (state.lists.length <= 1) return;
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  const count = state.tasks.filter(t => t.listId === listId).length;
  const fallbackList = state.lists.find(l => l.id !== listId);
  const msg = count > 0
    ? `清单「${list.name}」下有 ${count} 个任务，删除后任务会移到「${fallbackList.name}」。`
    : `清单「${list.name}」将被删除。`;
  const ok = await confirmDialog({
    title: '删除清单',
    message: msg,
    okText: '删除',
    danger: true
  });
  if (!ok) return;
  state.tasks.forEach(t => { if (t.listId === listId) t.listId = fallbackList.id; });
  state.lists = state.lists.filter(l => l.id !== listId);
  if (state.filterListId === listId) state.filterListId = 'all';
  save();
  render();
  renderListManage();
}

/* ===== 导出导入 ===== */
const DATA_VERSION = 1;

function exportData() {
  const payload = {
    app: 'todolist',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    lists: state.lists,
    tasks: state.tasks
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `todolist-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  let payload;
  try {
    const text = await file.text();
    payload = JSON.parse(text);
  } catch {
    await confirmDialog({
      title: '导入失败',
      message: '文件不是有效的 JSON 格式',
      okText: '知道了',
      cancelText: ''
    });
    return;
  }

  if (payload.app !== 'todolist' || !Array.isArray(payload.lists) || !Array.isArray(payload.tasks)) {
    await confirmDialog({
      title: '导入失败',
      message: '文件格式不匹配，请确认是本应用导出的备份',
      okText: '知道了',
      cancelText: ''
    });
    return;
  }

  const mode = await chooseImportMode(payload);
  if (!mode) return;

  if (mode === 'replace') {
    state.lists = payload.lists;
    state.tasks = payload.tasks;
  } else {
    const existingListIds = new Set(state.lists.map(l => l.id));
    const existingTaskIds = new Set(state.tasks.map(t => t.id));
    payload.lists.forEach(l => { if (!existingListIds.has(l.id)) state.lists.push(l); });
    payload.tasks.forEach(t => { if (!existingTaskIds.has(t.id)) state.tasks.push(t); });
  }
  if (state.lists.length === 0) state.lists = [...DEFAULT_LISTS];
  state.filterListId = 'all';
  // 合法的空写入：用户主动导入了空备份（覆盖模式）
  state.__allowEmpty = true;
  save();
  delete state.__allowEmpty;
  render();
  renderListManage();
  await confirmDialog({
    title: '导入成功',
    message: `已导入 ${payload.lists.length} 个清单、${payload.tasks.length} 个任务`,
    okText: '好',
    cancelText: ''
  });
}

function chooseImportMode(payload) {
  return new Promise(resolve => {
    const summary = `备份包含 ${payload.lists.length} 个清单、${payload.tasks.length} 个任务。\n\n覆盖：删除当前所有数据后导入\n合并：保留当前数据，追加不重复的内容`;
    el.confirmTitle.textContent = '导入方式';
    el.confirmMsg.textContent = summary;
    el.confirmOk.textContent = '覆盖';
    el.confirmCancel.textContent = '合并';
    el.confirmOk.classList.add('danger');
    el.confirmModal.hidden = false;

    const cleanup = () => {
      el.confirmModal.hidden = true;
      el.confirmOk.classList.remove('danger');
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onMerge);
      el.confirmModal.removeEventListener('click', onBackdrop);
    };
    const onOk = async () => {
      cleanup();
      const confirmed = await confirmDialog({
        title: '确定覆盖？',
        message: '当前所有任务和清单会被删除，此操作不可撤销',
        okText: '覆盖',
        danger: true
      });
      resolve(confirmed ? 'replace' : null);
    };
    const onMerge = () => { cleanup(); resolve('merge'); };
    const onBackdrop = e => {
      if (e.target === el.confirmModal) { cleanup(); resolve(null); }
    };

    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onMerge);
    el.confirmModal.addEventListener('click', onBackdrop);
  });
}

/* ===== 事件绑定 ===== */
el.viewTabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  state.view = btn.dataset.view;
  el.viewTabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  renderTasks();
});

el.listFilter.addEventListener('click', e => {
  if (e.target.closest('#manageListsBtn')) {
    openListModal();
    return;
  }
  const chip = e.target.closest('.list-chip');
  if (!chip || !chip.dataset.list) return;
  state.filterListId = chip.dataset.list;
  render();
});

el.taskList.addEventListener('click', e => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle') {
    toggleTask(id);
  } else if (action === 'edit') {
    openTaskModal(id);
  }
});

el.fab.addEventListener('click', () => openTaskModal());
el.closeModal.addEventListener('click', closeTaskModal);
el.taskModal.addEventListener('click', e => {
  if (e.target === el.taskModal) closeTaskModal();
});
el.taskForm.addEventListener('submit', saveTask);
el.deleteTaskBtn.addEventListener('click', () => {
  if (state.editingId) deleteTask(state.editingId);
});

el.clearDate.addEventListener('click', () => { el.taskDate.value = ''; });
document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.quick;
    if (q === 'today') el.taskDate.value = todayStr();
    else if (q === 'tomorrow') el.taskDate.value = addDays(todayStr(), 1);
    else if (q === 'week') el.taskDate.value = addDays(todayStr(), 7);
  });
});

el.priorityRow.addEventListener('click', e => {
  const btn = e.target.closest('.prio-btn');
  if (btn) setPriority(Number(btn.dataset.prio));
});

el.recurringSegment.addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  const v = btn.dataset.recurring === 'none' ? null : btn.dataset.recurring;
  setRecurring(v);
});

el.closeListModal.addEventListener('click', closeListModal);
el.listModal.addEventListener('click', e => {
  if (e.target === el.listModal) closeListModal();
});
el.listForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = el.newListName.value.trim();
  if (!name) return;
  if (state.editingListId) {
    updateList(state.editingListId, name, state.selectedColor);
  } else {
    addList(name, state.selectedColor);
  }
  exitListEdit();
});
el.cancelEditListBtn.addEventListener('click', exitListEdit);
el.colorRow.addEventListener('click', e => {
  const btn = e.target.closest('.color-btn');
  if (!btn) return;
  state.selectedColor = btn.dataset.color;
  renderColorPicker();
});
el.listManage.addEventListener('click', e => {
  const editBtn = e.target.closest('[data-edit-list]');
  if (editBtn) {
    enterListEdit(editBtn.dataset.editList);
    return;
  }
  const btn = e.target.closest('[data-remove-list]');
  if (btn && !btn.disabled) removeList(btn.dataset.removeList);
});

el.exportBtn.addEventListener('click', exportData);
el.importBtn.addEventListener('click', () => el.importFile.click());
el.importFile.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  closeListModal();
  await importData(file);
  el.importFile.value = '';
});

/* ===== Service Worker ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 注册失败', err));
  });
}

/* ===== 启动 ===== */
load();
render();
