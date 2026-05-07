import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ocrksbjzfsucrxevxqzo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M_hx-J4B6YmgVoSJSyNtmg_4zCfPjPY';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const SETUP_SQL = `-- Run in Supabase SQL Editor → New Query

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  client_name text default '',
  status text default 'active',
  project_type text default '',
  phase text default '',
  color text default 'blue',
  team_members text default '',
  position int default 0
);

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text default '',
  assignee text default '',
  status text default 'not_started',
  due_at date,
  notes text default '',
  archived boolean default false
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  event_date date not null,
  description text default ''
);

alter table projects enable row level security;
alter table deliverables enable row level security;
alter table events enable row level security;

-- Allow all authenticated team members full access
create policy "team_projects" on projects
  for all to authenticated using (true) with check (true);
create policy "team_deliverables" on deliverables
  for all to authenticated using (true) with check (true);
create policy "team_events" on events
  for all to authenticated using (true) with check (true);`;

const PROJECT_COLORS = [
  { key: 'red',    hex: '#e03131', bg: 'rgba(224,49,49,.15)'   },
  { key: 'orange', hex: '#e8590c', bg: 'rgba(232,89,12,.15)'   },
  { key: 'amber',  hex: '#e67700', bg: 'rgba(230,119,0,.15)'   },
  { key: 'green',  hex: '#2f9e44', bg: 'rgba(47,158,68,.15)'   },
  { key: 'teal',   hex: '#0c8599', bg: 'rgba(12,133,153,.15)'  },
  { key: 'blue',   hex: '#1971c2', bg: 'rgba(25,113,194,.15)'  },
  { key: 'indigo', hex: '#3b5bdb', bg: 'rgba(59,91,219,.15)'   },
  { key: 'violet', hex: '#7048e8', bg: 'rgba(112,72,232,.15)'  },
  { key: 'pink',   hex: '#c2255c', bg: 'rgba(194,37,92,.15)'   },
  { key: 'slate',  hex: '#495057', bg: 'rgba(73,80,87,.15)'    },
];

const STATUSES = {
  not_started: { label: 'Not Started', color: '#868e96' },
  in_progress:  { label: 'In Progress',  color: '#1971c2' },
  review:       { label: 'In Review',    color: '#e67700' },
  done:         { label: 'Done',         color: '#2f9e44' },
  blocked:      { label: 'Blocked',      color: '#e03131' },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── STATE ──────────────────────────────────────────────────────────────────
let state = { user: null, projects: [], deliverables: [], events: [] };
let calDate = new Date();
let selectedDay = null; // 'YYYY-MM-DD'
let hiddenProjects = loadHiddenProjects();
let statusFilter = null; // null = all
let currentView = 'month'; // 'month' | 'week'
let weekStart = getWeekStart(new Date());
let editingDelId = null;
let editingProjId = null;
let addingForDate = null;
let dragDelId = null;
let activeCtxMenu = null;

function loadHiddenProjects() {
  try { return new Set(JSON.parse(localStorage.getItem('hz:hidden') || '[]')); }
  catch { return new Set(); }
}
function saveHiddenProjects() {
  localStorage.setItem('hz:hidden', JSON.stringify([...hiddenProjects]));
}

function colorOf(proj) {
  return PROJECT_COLORS.find(c => c.key === proj?.color) || PROJECT_COLORS.find(c => c.key === 'blue');
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() { return dateToStr(new Date()); }
function parseDate(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function formatDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function formatShort(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
function getWeekStart(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function isOverdue(due_at) {
  if (!due_at) return false;
  return due_at < todayStr();
}

// ── AUTH ───────────────────────────────────────────────────────────────────
const authMsg = document.getElementById('auth-msg');
document.getElementById('auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('auth-pw').focus(); });
document.getElementById('auth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('auth-login-btn').addEventListener('click', doLogin);
document.getElementById('auth-signup-btn').addEventListener('click', doSignup);
document.getElementById('logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

async function doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-pw').value;
  if (!email || !pw) { authMsg.textContent = 'Email and password required.'; return; }
  authMsg.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) { authMsg.textContent = error.message; return; }
  state.user = data.user;
  enterApp();
}
async function doSignup() {
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-pw').value;
  if (!email || !pw) { authMsg.textContent = 'Email and password required.'; return; }
  if (pw.length < 6) { authMsg.textContent = 'Password must be at least 6 characters.'; return; }
  authMsg.textContent = 'Creating account…';
  const { data, error } = await sb.auth.signUp({ email, password: pw });
  if (error) { authMsg.textContent = error.message; return; }
  if (data.user && !data.session) { authMsg.textContent = 'Check your email to confirm your account.'; return; }
  state.user = data.user;
  enterApp();
}

async function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const email = state.user.email;
  document.getElementById('user-label').textContent = email;
  document.getElementById('user-av').textContent = email[0].toUpperCase();
  selectedDay = todayStr();
  await loadData();
}

// ── DATA ───────────────────────────────────────────────────────────────────
async function loadData() {
  showLoad(true);
  const [pRes, dRes, eRes] = await Promise.all([
    sb.from('projects').select('*').order('position'),
    sb.from('deliverables').select('*').eq('archived', false).order('due_at'),
    sb.from('events').select('*').order('event_date'),
  ]);
  showLoad(false);

  if (pRes.error || dRes.error) {
    if (pRes.error?.code === '42P01' || dRes.error?.code === '42P01') {
      showSetupModal();
      return;
    }
    console.error(pRes.error || dRes.error);
    return;
  }

  hideSetupModal();
  state.projects = pRes.data || [];
  state.deliverables = dRes.data || [];
  state.events = eRes.data || [];
  render();
}

function showLoad(on) { document.getElementById('loading').classList.toggle('show', on); }

async function createProject(data) {
  const pos = state.projects.length;
  const { data: row, error } = await sb.from('projects').insert({ ...data, user_id: state.user.id, position: pos }).select().single();
  if (error) { alert(error.message); return; }
  state.projects.push(row);
  render();
}
async function updateProject(id, data) {
  const { error } = await sb.from('projects').update(data).eq('id', id);
  if (error) { alert(error.message); return; }
  const p = state.projects.find(p => p.id === id);
  if (p) Object.assign(p, data);
  render();
}
async function deleteProject(id) {
  if (!confirm('Delete this project and all its deliverables? This cannot be undone.')) return;
  await sb.from('deliverables').delete().eq('project_id', id);
  await sb.from('projects').delete().eq('id', id);
  state.projects = state.projects.filter(p => p.id !== id);
  state.deliverables = state.deliverables.filter(d => d.project_id !== id);
  render();
}
async function createDeliverable(data) {
  const { data: row, error } = await sb.from('deliverables').insert({ ...data, user_id: state.user.id, archived: false }).select().single();
  if (error) { alert(error.message); return; }
  state.deliverables.push(row);
  render();
}
async function updateDeliverable(id, data) {
  const { error } = await sb.from('deliverables').update(data).eq('id', id);
  if (error) { alert(error.message); return; }
  const d = state.deliverables.find(d => d.id === id);
  if (d) Object.assign(d, data);
  render();
}
async function deleteDeliverable(id) {
  if (!confirm('Delete this deliverable?')) return;
  await sb.from('deliverables').delete().eq('id', id);
  state.deliverables = state.deliverables.filter(d => d.id !== id);
  render();
}
async function archiveDeliverable(id) {
  await sb.from('deliverables').update({ archived: true }).eq('id', id);
  state.deliverables = state.deliverables.filter(d => d.id !== id);
  render();
}
async function createEvent(title, date, projectId) {
  const { data: row, error } = await sb.from('events').insert({ user_id: state.user.id, title, event_date: date, project_id: projectId || null }).select().single();
  if (error) { alert(error.message); return; }
  state.events.push(row);
  render();
}
async function deleteEvent(id) {
  await sb.from('events').delete().eq('id', id);
  state.events = state.events.filter(e => e.id !== id);
  render();
}
async function updateDeliverableDate(id, due_at) {
  await sb.from('deliverables').update({ due_at }).eq('id', id);
  const d = state.deliverables.find(d => d.id === id);
  if (d) d.due_at = due_at;
  render();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function render() {
  renderSidebar();
  if (currentView === 'month') renderMonthCalendar();
  else renderWeekView();
  renderRightPanel();
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('proj-list');
  list.innerHTML = '';

  if (state.projects.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text-dim);font-size:12px;padding:6px 8px;';
    empty.textContent = 'No projects yet';
    list.appendChild(empty);
  }

  state.projects.forEach(p => {
    const col = colorOf(p);
    const item = document.createElement('div');
    item.className = 'proj-item' + (hiddenProjects.has(p.id) ? ' proj-hidden' : '');

    const dot = document.createElement('div');
    dot.className = 'proj-dot';
    dot.style.background = col.hex;

    const name = document.createElement('div');
    name.className = 'proj-name';
    name.textContent = p.name;

    const client = document.createElement('div');
    client.className = 'proj-client-tag';
    client.textContent = p.client_name || '';

    const editBtn = document.createElement('button');
    editBtn.className = 'proj-edit-btn';
    editBtn.title = 'Edit project';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openProjModal(p); });

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'proj-eye';
    eyeBtn.title = hiddenProjects.has(p.id) ? 'Show on calendar' : 'Hide from calendar';
    eyeBtn.textContent = hiddenProjects.has(p.id) ? '👁' : '◉';
    eyeBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (hiddenProjects.has(p.id)) hiddenProjects.delete(p.id);
      else hiddenProjects.add(p.id);
      saveHiddenProjects();
      render();
    });

    item.appendChild(dot);
    item.appendChild(name);
    if (p.client_name) item.appendChild(client);
    item.appendChild(editBtn);
    item.appendChild(eyeBtn);
    list.appendChild(item);
  });

  // Status filters
  const sfList = document.getElementById('status-filter-list');
  sfList.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'filter-item' + (statusFilter === null ? ' active' : '');
  allItem.innerHTML = `<div class="filter-dot" style="background:var(--text-dim)"></div><span>All</span><span class="filter-count">${state.deliverables.length}</span>`;
  allItem.addEventListener('click', () => { statusFilter = null; render(); });
  sfList.appendChild(allItem);

  Object.entries(STATUSES).forEach(([key, st]) => {
    const count = state.deliverables.filter(d => d.status === key).length;
    const item = document.createElement('div');
    item.className = 'filter-item' + (statusFilter === key ? ' active' : '');
    item.innerHTML = `<div class="filter-dot" style="background:${st.color}"></div><span>${st.label}</span><span class="filter-count">${count}</span>`;
    item.addEventListener('click', () => { statusFilter = key; render(); });
    sfList.appendChild(item);
  });
}

// ── MONTH CALENDAR ─────────────────────────────────────────────────────────
function renderMonthCalendar() {
  document.getElementById('cal-grid-wrap').style.display = 'flex';
  document.getElementById('week-wrap').classList.remove('show');

  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('cal-title').textContent = `${MONTHS[m]} ${y}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  const numWeeks = Math.ceil((firstDow + daysInMonth) / 7);
  grid.style.gridTemplateRows = `repeat(${numWeeks}, 1fr)`;

  const today = todayStr();
  const totalCells = numWeeks * 7;

  for (let i = 0; i < totalCells; i++) {
    let day, y2, m2, isOther;
    if (i < firstDow) {
      day = daysInPrev - firstDow + i + 1; y2 = m === 0 ? y-1 : y; m2 = m === 0 ? 11 : m-1; isOther = true;
    } else if (i < firstDow + daysInMonth) {
      day = i - firstDow + 1; y2 = y; m2 = m; isOther = false;
    } else {
      day = i - firstDow - daysInMonth + 1; y2 = m === 11 ? y+1 : y; m2 = m === 11 ? 0 : m+1; isOther = true;
    }
    const ds = `${y2}-${String(m2+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    grid.appendChild(buildMonthCell(ds, day, isOther, ds === today));
  }
}

function visibleDeliverables() {
  return state.deliverables.filter(d => {
    if (hiddenProjects.has(d.project_id)) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    return true;
  });
}

function buildMonthCell(ds, day, isOther, isToday) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell'
    + (isOther ? ' other-month' : '')
    + (isToday ? ' today' : '')
    + (ds === selectedDay ? ' selected' : '');
  cell.dataset.date = ds;

  const num = document.createElement('div');
  num.className = 'cal-num';
  num.textContent = day;
  cell.appendChild(num);

  const items = document.createElement('div');
  items.className = 'cal-cell-items';

  const dayDels = visibleDeliverables().filter(d => d.due_at === ds);
  const dayEvts = state.events.filter(e => e.event_date === ds);
  const total = dayDels.length + dayEvts.length;
  const MAX_CHIPS = 3;
  let shown = 0;

  dayDels.forEach(d => {
    if (shown >= MAX_CHIPS) return;
    const proj = state.projects.find(p => p.id === d.project_id);
    const col = colorOf(proj);
    const chip = document.createElement('div');
    chip.className = 'cal-chip' + (d.status === 'done' ? ' done' : '') + (isOverdue(d.due_at) && d.status !== 'done' ? ' overdue' : '');
    chip.style.cssText = `background:${col.bg};color:${col.hex};`;
    chip.textContent = d.title;
    chip.title = d.title + (proj ? ` · ${proj.name}` : '');
    chip.addEventListener('click', e => { e.stopPropagation(); openDelModal(d); });
    chip.draggable = true;
    chip.addEventListener('dragstart', e => {
      dragDelId = d.id;
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    items.appendChild(chip);
    shown++;
  });

  dayEvts.forEach(ev => {
    if (shown >= MAX_CHIPS) return;
    const chip = document.createElement('div');
    chip.className = 'cal-chip';
    chip.style.cssText = 'background:rgba(112,72,232,.18);color:#9775fa;';
    chip.textContent = '◆ ' + ev.title;
    chip.title = ev.title;
    items.appendChild(chip);
    shown++;
  });

  if (total > MAX_CHIPS) {
    const more = document.createElement('div');
    more.className = 'cal-more';
    more.textContent = `+${total - MAX_CHIPS} more`;
    items.appendChild(more);
  }

  cell.appendChild(items);

  cell.addEventListener('click', e => {
    closeCtxMenu();
    document.querySelectorAll('.cal-cell.selected').forEach(el => el.classList.remove('selected'));
    cell.classList.add('selected');
    selectedDay = ds;
    renderRightPanel();
  });

  cell.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    openCtxMenu(e.clientX, e.clientY, ds);
  });

  cell.addEventListener('dragover', e => { if (!dragDelId) return; e.preventDefault(); cell.classList.add('drag-over'); });
  cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
  cell.addEventListener('drop', async e => {
    e.preventDefault();
    cell.classList.remove('drag-over');
    if (dragDelId) {
      await updateDeliverableDate(dragDelId, ds);
      dragDelId = null;
      selectedDay = ds;
    }
  });

  return cell;
}

// ── WEEK VIEW ──────────────────────────────────────────────────────────────
function renderWeekView() {
  document.getElementById('cal-grid-wrap').style.display = 'none';
  const wrap = document.getElementById('week-wrap');
  wrap.classList.add('show');

  const y = weekStart.getFullYear(), m = weekStart.getMonth(), d = weekStart.getDate();
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  document.getElementById('cal-title').textContent =
    `${MONTHS_SHORT[y === endDate.getFullYear() ? m : m]} ${d} – ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;

  const cols = document.getElementById('week-cols');
  cols.innerHTML = '';
  const today = todayStr();

  for (let i = 0; i < 7; i++) {
    const d2 = new Date(weekStart);
    d2.setDate(d2.getDate() + i);
    const ds = dateToStr(d2);
    const isToday = ds === today;

    const col = document.createElement('div');
    col.className = 'week-col';

    const hdr = document.createElement('div');
    hdr.className = 'week-col-hdr' + (ds === selectedDay ? '' : '');
    hdr.style.background = ds === selectedDay ? 'rgba(255,255,255,.03)' : '';
    const dow = document.createElement('div');
    dow.className = 'week-col-dow';
    dow.textContent = DAYS_LONG[d2.getDay()].slice(0,3).toUpperCase();
    const num = document.createElement('div');
    num.className = 'week-col-num' + (isToday ? ' today-num' : '');
    num.textContent = d2.getDate();
    hdr.appendChild(dow); hdr.appendChild(num);
    hdr.addEventListener('click', () => { selectedDay = ds; renderRightPanel(); });
    col.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'week-col-body';

    const dayDels = visibleDeliverables().filter(d => d.due_at === ds);
    dayDels.forEach(d => {
      const proj = state.projects.find(p => p.id === d.project_id);
      const cl = colorOf(proj);
      const chip = document.createElement('div');
      chip.className = 'week-chip' + (d.status === 'done' ? ' done' : '');
      chip.style.cssText = `background:${cl.bg};border-left:3px solid ${cl.hex};`;
      const title = document.createElement('div');
      title.className = 'week-chip-title';
      title.style.color = cl.hex;
      title.textContent = d.title;
      const meta = document.createElement('div');
      meta.className = 'week-chip-meta';
      meta.style.color = cl.hex;
      meta.textContent = [proj?.name, d.assignee].filter(Boolean).join(' · ');
      chip.appendChild(title);
      if (meta.textContent) chip.appendChild(meta);
      chip.addEventListener('click', () => openDelModal(d));
      body.appendChild(chip);
    });

    state.events.filter(e => e.event_date === ds).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'week-chip';
      chip.style.cssText = 'background:rgba(112,72,232,.15);border-left:3px solid #9775fa;';
      const title = document.createElement('div');
      title.className = 'week-chip-title';
      title.style.color = '#9775fa';
      title.textContent = '◆ ' + ev.title;
      chip.appendChild(title);
      body.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'week-add';
    addBtn.textContent = '+ Add deliverable';
    addBtn.addEventListener('click', () => { addingForDate = ds; openDelModal(null); });
    body.appendChild(addBtn);

    col.appendChild(body);
    cols.appendChild(col);
  }
}

// ── RIGHT PANEL ────────────────────────────────────────────────────────────
function renderRightPanel() {
  if (!selectedDay) { return; }
  const d = parseDate(selectedDay);
  const isToday = selectedDay === todayStr();
  document.getElementById('panel-date').textContent = isToday ? 'Today' : formatDate(selectedDay);
  document.getElementById('panel-sub').textContent = `${DAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const body = document.getElementById('panel-body');
  body.innerHTML = '';

  // Deliverables for selected day
  const dayDels = state.deliverables.filter(del => del.due_at === selectedDay);
  const visibleDayDels = dayDels.filter(del => !hiddenProjects.has(del.project_id) && (!statusFilter || del.status === statusFilter));

  const delHdr = document.createElement('div');
  delHdr.className = 'panel-sec-hdr';
  const delHdrLabel = document.createElement('span');
  delHdrLabel.textContent = `Deliverables (${dayDels.length})`;
  const delAddBtn = document.createElement('button');
  delAddBtn.className = 'panel-add';
  delAddBtn.title = 'Add deliverable for this day';
  delAddBtn.textContent = '+';
  delAddBtn.addEventListener('click', () => { addingForDate = selectedDay; openDelModal(null); });
  delHdr.appendChild(delHdrLabel);
  delHdr.appendChild(delAddBtn);
  body.appendChild(delHdr);

  if (visibleDayDels.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent = dayDels.length > 0 ? 'All filtered out' : 'Nothing due on this day';
    body.appendChild(empty);
  } else {
    visibleDayDels.forEach(del => body.appendChild(buildDelCard(del)));
  }

  // Events for selected day
  const dayEvts = state.events.filter(e => e.event_date === selectedDay);
  if (dayEvts.length > 0) {
    const evtHdr = document.createElement('div');
    evtHdr.className = 'panel-sec-hdr';
    evtHdr.textContent = `Events (${dayEvts.length})`;
    body.appendChild(evtHdr);
    dayEvts.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'del-card';
      card.style.borderLeftColor = '#9775fa';
      card.innerHTML = `<div class="del-card-title"><div class="del-status-dot" style="background:#9775fa;margin-top:4px;"></div><span>◆ ${escHtml(ev.title)}</span></div>`;
      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;position:absolute;top:8px;right:8px;';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', e => { e.stopPropagation(); deleteEvent(ev.id); });
      card.appendChild(delBtn);
      card.style.position = 'relative';
      body.appendChild(card);
    });
  }

  // Upcoming section (next 14 days)
  const upHdr = document.createElement('div');
  upHdr.className = 'panel-sec-hdr';
  upHdr.textContent = 'Upcoming (14 days)';
  body.appendChild(upHdr);

  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const cutoff = new Date(todayD); cutoff.setDate(cutoff.getDate() + 14);
  const upDels = state.deliverables
    .filter(d => d.due_at && d.due_at > selectedDay && parseDate(d.due_at) <= cutoff && d.status !== 'done')
    .filter(d => !hiddenProjects.has(d.project_id) && (!statusFilter || d.status === statusFilter))
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, 12);

  if (upDels.length === 0) {
    const e = document.createElement('div');
    e.className = 'panel-empty';
    e.textContent = 'Nothing in the next 14 days';
    body.appendChild(e);
  } else {
    let lastDate = null;
    upDels.forEach(del => {
      if (del.due_at !== lastDate) {
        const dh = document.createElement('div');
        dh.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-dim);letter-spacing:.4px;padding:4px 0 2px;text-transform:uppercase;';
        const dObj = parseDate(del.due_at);
        dh.textContent = dObj.toDateString() === new Date().toDateString() ? 'Today' : formatShort(del.due_at);
        body.appendChild(dh);
        lastDate = del.due_at;
      }
      body.appendChild(buildUpcomingItem(del));
    });
  }
}

function buildDelCard(del) {
  const proj = state.projects.find(p => p.id === del.project_id);
  const col = colorOf(proj);
  const st = STATUSES[del.status] || STATUSES.not_started;
  const overdue = isOverdue(del.due_at) && del.status !== 'done';

  const card = document.createElement('div');
  card.className = 'del-card' + (del.status === 'done' ? ' done' : '');
  card.style.borderLeftColor = col.hex;

  const titleRow = document.createElement('div');
  titleRow.className = 'del-card-title';
  const dot = document.createElement('div');
  dot.className = 'del-status-dot';
  dot.style.background = st.color;
  dot.title = st.label;
  const titleText = document.createElement('span');
  titleText.textContent = del.title;
  titleRow.appendChild(dot);
  titleRow.appendChild(titleText);
  card.appendChild(titleRow);

  const meta = document.createElement('div');
  meta.className = 'del-card-meta';
  if (proj) {
    const badge = document.createElement('div');
    badge.className = 'del-proj-badge';
    badge.style.cssText = `background:${col.bg};color:${col.hex};`;
    badge.textContent = proj.name;
    meta.appendChild(badge);
  }
  if (del.assignee) {
    const a = document.createElement('div');
    a.className = 'del-assignee';
    a.textContent = del.assignee;
    meta.appendChild(a);
  }
  if (overdue) {
    const od = document.createElement('div');
    od.className = 'del-overdue-tag';
    od.textContent = 'Overdue';
    meta.appendChild(od);
  }
  card.appendChild(meta);

  card.addEventListener('click', () => openDelModal(del));
  return card;
}

function buildUpcomingItem(del) {
  const proj = state.projects.find(p => p.id === del.project_id);
  const col = colorOf(proj);
  const item = document.createElement('div');
  item.className = 'upcoming-item';
  item.addEventListener('click', () => { selectedDay = del.due_at; calDate = new Date(parseDate(del.due_at).getFullYear(), parseDate(del.due_at).getMonth(), 1); render(); });

  const date = document.createElement('div');
  date.className = 'upcoming-date';
  date.textContent = formatShort(del.due_at);

  const bdy = document.createElement('div');
  bdy.className = 'upcoming-body';
  const t = document.createElement('div');
  t.className = 'upcoming-title';
  t.textContent = del.title;
  const p = document.createElement('div');
  p.className = 'upcoming-proj';
  p.style.color = col.hex;
  p.textContent = [proj?.name, del.assignee].filter(Boolean).join(' · ');

  bdy.appendChild(t);
  if (p.textContent) bdy.appendChild(p);
  item.appendChild(date);
  item.appendChild(bdy);
  return item;
}

// ── CONTEXT MENU ───────────────────────────────────────────────────────────
function openCtxMenu(x, y, ds) {
  closeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  menu.addEventListener('click', e => e.stopPropagation());

  const addDel = document.createElement('div');
  addDel.className = 'ctx-item';
  addDel.innerHTML = '<span>+</span> New deliverable';
  addDel.addEventListener('click', () => { closeCtxMenu(); selectedDay = ds; addingForDate = ds; openDelModal(null); });

  const addEvt = document.createElement('div');
  addEvt.className = 'ctx-item';
  addEvt.innerHTML = '<span>◆</span> New event';
  addEvt.addEventListener('click', () => {
    closeCtxMenu();
    const title = prompt('Event name:');
    if (title?.trim()) createEvent(title.trim(), ds, null);
  });

  menu.appendChild(addDel);
  menu.appendChild(addEvt);
  document.body.appendChild(menu);
  activeCtxMenu = menu;
}

function closeCtxMenu() {
  if (activeCtxMenu) { activeCtxMenu.remove(); activeCtxMenu = null; }
}
document.addEventListener('click', closeCtxMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCtxMenu(); closeProjModal(); closeDelModal(); } });

// ── PROJECT MODAL ──────────────────────────────────────────────────────────
let selectedProjColor = 'blue';

function openProjModal(proj) {
  editingProjId = proj?.id || null;
  document.getElementById('proj-modal-title').textContent = proj ? 'Edit Project' : 'New Project';
  document.getElementById('pm-name').value = proj?.name || '';
  document.getElementById('pm-client').value = proj?.client_name || '';
  document.getElementById('pm-type').value = proj?.project_type || '';
  document.getElementById('pm-phase').value = proj?.phase || '';
  document.getElementById('pm-status').value = proj?.status || 'active';
  document.getElementById('pm-team').value = proj?.team_members || '';
  document.getElementById('pm-delete').style.display = proj ? 'block' : 'none';
  selectedProjColor = proj?.color || 'blue';
  buildColorRow();
  document.getElementById('proj-modal').classList.add('open');
  document.getElementById('pm-name').focus();
}
function closeProjModal() { document.getElementById('proj-modal').classList.remove('open'); }

function buildColorRow() {
  const row = document.getElementById('pm-color-row');
  row.innerHTML = '';
  PROJECT_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'cswatch' + (c.key === selectedProjColor ? ' sel' : '');
    sw.style.background = c.hex;
    sw.title = c.key;
    sw.addEventListener('click', () => {
      selectedProjColor = c.key;
      row.querySelectorAll('.cswatch').forEach(s => s.classList.toggle('sel', s.title === c.key));
    });
    row.appendChild(sw);
  });
}

document.getElementById('proj-modal-x').addEventListener('click', closeProjModal);
document.getElementById('pm-cancel').addEventListener('click', closeProjModal);
document.getElementById('pm-delete').addEventListener('click', async () => {
  closeProjModal(); await deleteProject(editingProjId);
});
document.getElementById('pm-save').addEventListener('click', async () => {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { document.getElementById('pm-name').focus(); return; }
  const data = {
    name,
    client_name: document.getElementById('pm-client').value.trim(),
    project_type: document.getElementById('pm-type').value,
    phase: document.getElementById('pm-phase').value,
    status: document.getElementById('pm-status').value,
    team_members: document.getElementById('pm-team').value.trim(),
    color: selectedProjColor,
  };
  closeProjModal();
  if (editingProjId) await updateProject(editingProjId, data);
  else await createProject(data);
});
document.getElementById('add-proj-btn').addEventListener('click', () => openProjModal(null));

// ── DELIVERABLE MODAL ──────────────────────────────────────────────────────
function openDelModal(del) {
  editingDelId = del?.id || null;
  document.getElementById('del-modal-title').textContent = del ? 'Edit Deliverable' : 'New Deliverable';
  document.getElementById('dm-title').value = del?.title || '';
  document.getElementById('dm-assignee').value = del?.assignee || '';
  document.getElementById('dm-status').value = del?.status || 'not_started';
  document.getElementById('dm-due').value = del?.due_at || addingForDate || '';
  document.getElementById('dm-desc').value = del?.description || '';
  document.getElementById('dm-notes').value = del?.notes || '';
  document.getElementById('dm-delete').style.display = del ? 'block' : 'none';

  // Populate project select
  const sel = document.getElementById('dm-project');
  sel.innerHTML = '<option value="">— No project —</option>';
  state.projects.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name + (p.client_name ? ` (${p.client_name})` : '');
    if (del ? del.project_id === p.id : false) o.selected = true;
    sel.appendChild(o);
  });
  if (!del && state.projects.length === 1) sel.value = state.projects[0].id;

  document.getElementById('del-modal').classList.add('open');
  document.getElementById('dm-title').focus();
}
function closeDelModal() {
  document.getElementById('del-modal').classList.remove('open');
  addingForDate = null;
}

document.getElementById('del-modal-x').addEventListener('click', closeDelModal);
document.getElementById('dm-cancel').addEventListener('click', closeDelModal);
document.getElementById('dm-delete').addEventListener('click', async () => {
  closeDelModal(); await deleteDeliverable(editingDelId);
});
document.getElementById('dm-save').addEventListener('click', async () => {
  const title = document.getElementById('dm-title').value.trim();
  if (!title) { document.getElementById('dm-title').focus(); return; }
  const due = document.getElementById('dm-due').value || null;
  const data = {
    title,
    project_id: document.getElementById('dm-project').value || null,
    assignee: document.getElementById('dm-assignee').value.trim(),
    status: document.getElementById('dm-status').value,
    due_at: due,
    description: document.getElementById('dm-desc').value.trim(),
    notes: document.getElementById('dm-notes').value.trim(),
  };
  closeDelModal();
  if (editingDelId) await updateDeliverable(editingDelId, data);
  else await createDeliverable(data);
  if (due) selectedDay = due;
});

// ── CALENDAR NAV ───────────────────────────────────────────────────────────
document.getElementById('cal-prev').addEventListener('click', () => {
  if (currentView === 'month') {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
  } else {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() - 7);
  }
  render();
});
document.getElementById('cal-next').addEventListener('click', () => {
  if (currentView === 'month') {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
  } else {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() + 7);
  }
  render();
});
document.getElementById('cal-today-btn').addEventListener('click', () => {
  const now = new Date();
  calDate = new Date(now.getFullYear(), now.getMonth(), 1);
  weekStart = getWeekStart(now);
  selectedDay = todayStr();
  render();
});

document.getElementById('view-month-btn').addEventListener('click', () => {
  currentView = 'month';
  document.getElementById('view-month-btn').classList.add('active');
  document.getElementById('view-week-btn').classList.remove('active');
  render();
});
document.getElementById('view-week-btn').addEventListener('click', () => {
  currentView = 'week';
  weekStart = selectedDay ? getWeekStart(parseDate(selectedDay)) : getWeekStart(new Date());
  document.getElementById('view-week-btn').classList.add('active');
  document.getElementById('view-month-btn').classList.remove('active');
  render();
});

// ── SETUP MODAL ────────────────────────────────────────────────────────────
document.getElementById('setup-sql-block').textContent = SETUP_SQL;
document.getElementById('setup-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(SETUP_SQL).then(() => {
    const btn = document.getElementById('setup-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy SQL', 2000);
  });
});
document.getElementById('setup-dismiss').addEventListener('click', hideSetupModal);

function showSetupModal() {
  document.getElementById('setup-modal').classList.add('open');
  document.getElementById('setup-dismiss').style.display = 'block';
}
function hideSetupModal() {
  document.getElementById('setup-modal').classList.remove('open');
}

// ── UTILS ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Auto-refresh deadline statuses every 5 minutes
setInterval(() => { if (state.user) render(); }, 300000);

// ── INIT ───────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    await enterApp();
  } else {
    hideSetupModal();
  }
})();

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') location.reload();
});
