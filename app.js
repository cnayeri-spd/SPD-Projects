import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ocrksbjzfsucrxevxqzo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M_hx-J4B6YmgVoSJSyNtmg_4zCfPjPY';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const SETUP_SQL = `-- SPD Projects — Supabase Setup
-- Run in: Supabase Dashboard → SQL Editor → New Query

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  client_name text default '',
  status text default 'active',
  phase text default '',
  color text default 'blue',
  position int default 0,
  categories text[] default '{}',
  phases jsonb default '[]',
  team_members_json jsonb default '[]'
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
  archived boolean default false,
  category text default 'client',
  due_time text default ''
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  event_date date not null,
  description text default '',
  event_time text default ''
);

alter table projects enable row level security;
alter table deliverables enable row level security;
alter table events enable row level security;

create policy "team_projects" on projects
  for all to authenticated using (true) with check (true);
create policy "team_deliverables" on deliverables
  for all to authenticated using (true) with check (true);
create policy "team_events" on events
  for all to authenticated using (true) with check (true);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  title text default '',
  email text default '',
  color text default 'blue',
  emoji text default ''
);
alter table team_members enable row level security;
create policy "team_team_members" on team_members
  for all to authenticated using (true) with check (true);

-- Run this block if you already created the tables without the new columns:
-- alter table projects add column if not exists categories text[] default '{}';
-- alter table projects add column if not exists phases jsonb default '[]';
-- alter table projects add column if not exists team_members_json jsonb default '[]';
-- alter table deliverables add column if not exists category text default 'client';
-- alter table deliverables add column if not exists due_time text default '';
-- alter table events add column if not exists event_time text default '';`;

// ── CONSTANTS ──────────────────────────────────────────────────────────────
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

const STATUS_COLORS = {
  active:    { bg: 'rgba(47,158,68,.15)',  color: '#2f9e44' },
  paused:    { bg: 'rgba(230,119,0,.15)',  color: '#e67700' },
  completed: { bg: 'rgba(25,113,194,.15)', color: '#1971c2' },
  archived:  { bg: 'rgba(73,80,87,.15)',   color: '#868e96' },
};

const DEFAULT_PHASES = [
  { num: '00', name: 'PM' },
  { num: '01', name: 'Analysis' },
  { num: '02', name: 'Research & Analysis' },
  { num: '03', name: 'Concept Design' },
  { num: '04', name: 'Design Development' },
  { num: '05', name: 'Design Intent' },
  { num: '06', name: 'Construction Administration' },
];

const PROJECT_CATEGORIES = ['Signage', 'Branding', 'EGD', 'Development', 'Consulting'];
const DEL_CATEGORIES = ['client', 'internal', 'other'];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── STATE ──────────────────────────────────────────────────────────────────
let state = { user: null, projects: [], deliverables: [], events: [], archivedDeliverables: [], teamMembers: [] };
let calDate = new Date();
let weekStart = getWeekStart(new Date());
let selectedDay = null;
let hiddenProjects = loadHiddenProjects();
let statusFilter = null;
let currentView = 'month'; // 'month' | 'twoweek' | 'week' | 'projects'
let dragDelId = null;
let activeCtxMenu = null;

// modal local state
let editingDelId = null;
let editingProjId = null;
let addingForDate = null;
let editingPhases = [];
let editingTeam = [];
let selectedProjColor = 'blue';
let selectedProjCategories = [];
let selectedDelCategory = 'client';
let editingEvtId = null;
let editingMemberId = null;
let selectedMemberColor = 'blue';
let showArchive = false;

function loadHiddenProjects() {
  try { return new Set(JSON.parse(localStorage.getItem('spd:hidden') || '[]')); }
  catch { return new Set(); }
}
function saveHiddenProjects() {
  localStorage.setItem('spd:hidden', JSON.stringify([...hiddenProjects]));
}
function loadLocalProjOrder() {
  try { return JSON.parse(localStorage.getItem('spd:proj-order') || 'null'); }
  catch { return null; }
}
function saveLocalProjOrder(ids) { localStorage.setItem('spd:proj-order', JSON.stringify(ids)); }
function loadLocalProjColors() {
  try { return JSON.parse(localStorage.getItem('spd:proj-colors') || '{}'); }
  catch { return {}; }
}
function saveLocalProjColors(map) { localStorage.setItem('spd:proj-colors', JSON.stringify(map)); }

let localProjColors = loadLocalProjColors();
let ppDragId = null;

function getSortedProjects() {
  const order = loadLocalProjOrder();
  if (!order || !order.length) return [...state.projects];
  return [...state.projects].sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function colorOf(proj) {
  const key = (proj?.id && localProjColors[proj.id]) || proj?.color;
  return PROJECT_COLORS.find(c => c.key === key) || PROJECT_COLORS.find(c => c.key === 'blue');
}
function getAvatarInfo(name) {
  const member = state.teamMembers.find(m => m.name === name);
  const showEmoji = localStorage.getItem('spd:show-emoji') === 'true';
  if (member) {
    const col = PROJECT_COLORS.find(c => c.key === member.color) || PROJECT_COLORS[5];
    return { hex: col.hex, text: (showEmoji && member.emoji) ? member.emoji : initials(name) };
  }
  return { hex: getAvatarColor(name), text: initials(name) };
}
function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() { return dateToStr(new Date()); }
function parseDate(s) {
  if (!s) return new Date();
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
function getProjPhases(proj) {
  try {
    if (proj?.phases && Array.isArray(proj.phases) && proj.phases.length > 0) return proj.phases;
  } catch {}
  return DEFAULT_PHASES;
}
function getProjCategories(proj) {
  try {
    if (proj?.categories && Array.isArray(proj.categories)) return proj.categories;
  } catch {}
  return [];
}
function getProjTeam(proj) {
  try {
    if (proj?.team_members_json && Array.isArray(proj.team_members_json)) return proj.team_members_json;
  } catch {}
  return [];
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}
function getAvatarColor(name) {
  const colors = ['#e03131','#e8590c','#e67700','#2f9e44','#0c8599','#1971c2','#3b5bdb','#7048e8','#c2255c'];
  let hash = 0;
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
function formatChipTime(t) {
  if (!t) return '';
  return t.toUpperCase();
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
  const [pRes, dRes, eRes, archRes, tmRes] = await Promise.all([
    sb.from('projects').select('*').order('position'),
    sb.from('deliverables').select('*').eq('archived', false).order('due_at'),
    sb.from('events').select('*').order('event_date'),
    sb.from('deliverables').select('*').eq('archived', true).order('created_at', { ascending: false }),
    sb.from('team_members').select('*').order('name'),
  ]);
  showLoad(false);

  if (pRes.error || dRes.error) {
    if (pRes.error?.code === '42P01' || dRes.error?.code === '42P01') { showSetupModal(); return; }
    console.error(pRes.error || dRes.error);
    return;
  }

  hideSetupModal();
  state.projects             = pRes.data || [];
  state.deliverables         = dRes.data || [];
  state.events               = eRes.data || [];
  state.archivedDeliverables = archRes.data || [];
  state.teamMembers          = tmRes.data || [];
  render();
}
function showLoad(on) { document.getElementById('loading').classList.toggle('show', on); }

async function createProject(data) {
  const { data: row, error } = await sb.from('projects')
    .insert({ ...data, user_id: state.user.id, position: state.projects.length }).select().single();
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
  if (!confirm('Delete this project and all its deliverables?')) return;
  await sb.from('deliverables').delete().eq('project_id', id);
  await sb.from('projects').delete().eq('id', id);
  state.projects    = state.projects.filter(p => p.id !== id);
  state.deliverables = state.deliverables.filter(d => d.project_id !== id);
  render();
}
async function createDeliverable(data) {
  const { data: row, error } = await sb.from('deliverables')
    .insert({ ...data, user_id: state.user.id, archived: false }).select().single();
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
  state.archivedDeliverables = state.archivedDeliverables.filter(d => d.id !== id);
  render();
}
async function archiveDeliverable(id) {
  const { error } = await sb.from('deliverables').update({ archived: true }).eq('id', id);
  if (error) { alert(error.message); return; }
  const d = state.deliverables.find(d => d.id === id);
  if (d) {
    state.archivedDeliverables.unshift({ ...d, archived: true });
    state.deliverables = state.deliverables.filter(d => d.id !== id);
  }
  render();
}
async function archiveAllDone(projectId) {
  const doneItems = state.deliverables.filter(d => d.project_id === projectId && d.status === 'done');
  if (doneItems.length === 0) return;
  const ids = doneItems.map(d => d.id);
  const { error } = await sb.from('deliverables').update({ archived: true }).in('id', ids);
  if (error) { alert(error.message); return; }
  state.archivedDeliverables = [...doneItems.map(d => ({ ...d, archived: true })), ...state.archivedDeliverables];
  state.deliverables = state.deliverables.filter(d => !ids.includes(d.id));
  render();
}
async function unarchiveDeliverable(id) {
  const { error } = await sb.from('deliverables').update({ archived: false }).eq('id', id);
  if (error) { alert(error.message); return; }
  const d = state.archivedDeliverables.find(d => d.id === id);
  if (d) {
    state.deliverables.push({ ...d, archived: false });
    state.archivedDeliverables = state.archivedDeliverables.filter(d => d.id !== id);
  }
  render();
}
async function createEvent(data) {
  const { data: row, error } = await sb.from('events')
    .insert({ ...data, user_id: state.user.id }).select().single();
  if (error) { alert(error.message); return; }
  state.events.push(row);
  render();
}
async function updateEvent(id, data) {
  const { error } = await sb.from('events').update(data).eq('id', id);
  if (error) { alert(error.message); return; }
  const e = state.events.find(e => e.id === id);
  if (e) Object.assign(e, data);
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
async function createTeamMember(data) {
  const { data: row, error } = await sb.from('team_members').insert(data).select().single();
  if (error) { alert(error.message); return; }
  state.teamMembers.push(row);
  state.teamMembers.sort((a, b) => a.name.localeCompare(b.name));
  render();
}
async function updateTeamMember(id, data) {
  const { error } = await sb.from('team_members').update(data).eq('id', id);
  if (error) { alert(error.message); return; }
  const m = state.teamMembers.find(m => m.id === id);
  if (m) Object.assign(m, data);
  render();
}
async function deleteTeamMember(id) {
  if (!confirm('Delete this team member?')) return;
  await sb.from('team_members').delete().eq('id', id);
  state.teamMembers = state.teamMembers.filter(m => m.id !== id);
  render();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function render() {
  renderSidebar();
  const noCalendar = currentView === 'projects' || currentView === 'settings';
  document.getElementById('right-panel').style.display = noCalendar ? 'none' : '';
  document.getElementById('cal-header').style.display  = noCalendar ? 'none' : '';
  document.getElementById('cal-grid-wrap').style.display = 'none';
  document.getElementById('week-wrap').classList.remove('show');
  document.getElementById('projects-page').classList.remove('show');
  document.getElementById('settings-page').classList.remove('show');

  if (currentView === 'projects') {
    document.getElementById('projects-page').classList.add('show');
    renderProjectsPage();
  } else if (currentView === 'settings') {
    document.getElementById('settings-page').classList.add('show');
    renderSettingsPage();
  } else {
    if (currentView === 'month')   renderMonthCalendar();
    if (currentView === 'twoweek') renderTwoWeekView();
    if (currentView === 'week')    renderWeekView();
    renderRightPanel();
  }
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('proj-list');
  list.innerHTML = '';

  if (state.projects.length === 0) {
    const e = document.createElement('div');
    e.style.cssText = 'color:var(--text-dim);font-size:12px;padding:6px 8px;';
    e.textContent = 'No projects yet';
    list.appendChild(e);
  }

  getSortedProjects().forEach(p => {
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
    editBtn.title = 'Edit';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openProjModal(p); });

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'proj-eye';
    eyeBtn.title = hiddenProjects.has(p.id) ? 'Show on calendar' : 'Hide from calendar';
    eyeBtn.textContent = hiddenProjects.has(p.id) ? '○' : '●';
    eyeBtn.addEventListener('click', e => {
      e.stopPropagation();
      hiddenProjects.has(p.id) ? hiddenProjects.delete(p.id) : hiddenProjects.add(p.id);
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

// ── CALENDAR GRID (shared for month + 2-week) ──────────────────────────────
function renderCalGrid(startDate, numRows) {
  document.getElementById('cal-grid-wrap').style.display = 'flex';
  document.getElementById('week-wrap').classList.remove('show');

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;

  const today = todayStr();
  const totalCells = numRows * 7;

  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const ds = dateToStr(d);
    const isOther = numRows === 1 ? false :
      (startDate.getMonth() !== d.getMonth() && numRows > 2);
    grid.appendChild(buildMonthCell(ds, d.getDate(), false, ds === today));
  }
}

function renderMonthCalendar() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('cal-title').textContent = `${MONTHS[m]} ${y}`;

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const numWeeks = Math.ceil((firstDow + daysInMonth) / 7);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateRows = `repeat(${numWeeks}, 1fr)`;
  document.getElementById('cal-grid-wrap').style.display = 'flex';
  document.getElementById('week-wrap').classList.remove('show');

  const daysInPrev = new Date(y, m, 0).getDate();
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

function renderTwoWeekView() {
  const y = weekStart.getFullYear(), m = weekStart.getMonth(), d = weekStart.getDate();
  const end = new Date(weekStart); end.setDate(end.getDate() + 13);
  document.getElementById('cal-title').textContent =
    `${MONTHS_SHORT[m]} ${d} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  grid.style.gridTemplateRows = 'repeat(2, 1fr)';
  document.getElementById('cal-grid-wrap').style.display = 'flex';
  document.getElementById('week-wrap').classList.remove('show');

  const today = todayStr();
  for (let i = 0; i < 14; i++) {
    const dt = new Date(weekStart); dt.setDate(dt.getDate() + i);
    const ds = dateToStr(dt);
    grid.appendChild(buildMonthCell(ds, dt.getDate(), false, ds === today));
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
  const total   = dayDels.length + dayEvts.length;
  const MAX = 3;
  let shown = 0;

  dayDels.forEach(d => {
    if (shown >= MAX) return;
    const proj = state.projects.find(p => p.id === d.project_id);
    const col = colorOf(proj);
    const chip = document.createElement('div');
    chip.className = 'cal-chip'
      + (d.status === 'done' ? ' done' : '')
      + (isOverdue(d.due_at) && d.status !== 'done' ? ' overdue' : '');
    chip.style.cssText = `background:${col.bg};color:${col.hex};`;
    const timePrefix = d.due_time ? `${formatChipTime(d.due_time)} · ` : '';
    chip.textContent = timePrefix + d.title;
    chip.title = d.title + (proj ? ` · ${proj.name}` : '');
    chip.addEventListener('click', e => { e.stopPropagation(); openDelModal(d); });
    chip.draggable = true;
    chip.addEventListener('dragstart', e => { dragDelId = d.id; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); });
    items.appendChild(chip);
    shown++;
  });

  dayEvts.forEach(ev => {
    if (shown >= MAX) return;
    const chip = document.createElement('div');
    chip.className = 'cal-chip cal-chip-evt';
    const timePrefix = ev.event_time ? `${formatChipTime(ev.event_time)} · ` : '';
    chip.textContent = '◆ ' + timePrefix + ev.title;
    chip.title = ev.title;
    chip.addEventListener('click', e => { e.stopPropagation(); openEventModal(ds, ev); });
    items.appendChild(chip);
    shown++;
  });

  if (total > MAX) {
    const more = document.createElement('div');
    more.className = 'cal-more';
    more.textContent = `+${total - MAX} more`;
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
  cell.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e.clientX, e.clientY, ds); });
  cell.addEventListener('dragover', e => { if (!dragDelId) return; e.preventDefault(); cell.classList.add('drag-over'); });
  cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
  cell.addEventListener('drop', async e => {
    e.preventDefault(); cell.classList.remove('drag-over');
    if (dragDelId) { await updateDeliverableDate(dragDelId, ds); dragDelId = null; selectedDay = ds; }
  });

  return cell;
}

// ── WEEK VIEW ──────────────────────────────────────────────────────────────
function renderWeekView() {
  document.getElementById('cal-grid-wrap').style.display = 'none';
  document.getElementById('week-wrap').classList.add('show');

  const end = new Date(weekStart); end.setDate(end.getDate() + 6);
  document.getElementById('cal-title').textContent =
    `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;

  const cols = document.getElementById('week-cols');
  cols.style.gridTemplateColumns = 'repeat(7, 1fr)';
  cols.innerHTML = '';
  const today = todayStr();

  for (let i = 0; i < 7; i++) {
    const dt = new Date(weekStart); dt.setDate(dt.getDate() + i);
    const ds = dateToStr(dt);
    const isToday = ds === today;

    const col = document.createElement('div');
    col.className = 'week-col';

    const hdr = document.createElement('div');
    hdr.className = 'week-col-hdr';
    hdr.style.background = ds === selectedDay ? 'rgba(255,255,255,.03)' : '';
    const dow = document.createElement('div');
    dow.className = 'week-col-dow';
    dow.textContent = DAYS_LONG[dt.getDay()].slice(0,3).toUpperCase();
    const num = document.createElement('div');
    num.className = 'week-col-num' + (isToday ? ' today-num' : '');
    num.textContent = dt.getDate();
    hdr.appendChild(dow); hdr.appendChild(num);
    hdr.addEventListener('click', () => { selectedDay = ds; renderRightPanel(); });
    col.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'week-col-body';

    visibleDeliverables().filter(d => d.due_at === ds).forEach(d => {
      const proj = state.projects.find(p => p.id === d.project_id);
      const cl = colorOf(proj);
      const chip = document.createElement('div');
      chip.className = 'week-chip' + (d.status === 'done' ? ' done' : '');
      chip.style.cssText = `background:${cl.bg};border-left:3px solid ${cl.hex};`;
      const title = document.createElement('div');
      title.className = 'week-chip-title';
      title.style.color = cl.hex;
      title.textContent = (d.due_time ? formatChipTime(d.due_time) + ' · ' : '') + d.title;
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
      title.textContent = '◆ ' + (ev.event_time ? formatChipTime(ev.event_time) + ' · ' : '') + ev.title;
      chip.appendChild(title);
      chip.addEventListener('click', () => openEventModal(ds, ev));
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
  if (!selectedDay) return;
  const d = parseDate(selectedDay);
  const isToday = selectedDay === todayStr();
  document.getElementById('panel-date').textContent = isToday ? 'Today' : formatDate(selectedDay);
  document.getElementById('panel-sub').textContent = `${DAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const body = document.getElementById('panel-body');
  body.innerHTML = '';

  const dayDels = state.deliverables.filter(del => del.due_at === selectedDay);
  const visibleDayDels = dayDels.filter(del =>
    !hiddenProjects.has(del.project_id) && (!statusFilter || del.status === statusFilter)
  );

  const delHdr = document.createElement('div');
  delHdr.className = 'panel-sec-hdr';
  delHdr.innerHTML = `<span>Deliverables (${dayDels.length})</span>`;
  const delAddBtn = document.createElement('button');
  delAddBtn.className = 'panel-add';
  delAddBtn.textContent = '+';
  delAddBtn.title = 'Add deliverable';
  delAddBtn.addEventListener('click', () => { addingForDate = selectedDay; openDelModal(null); });
  delHdr.appendChild(delAddBtn);
  body.appendChild(delHdr);

  if (visibleDayDels.length === 0) {
    const e = document.createElement('div');
    e.className = 'panel-empty';
    e.textContent = dayDels.length > 0 ? 'All filtered out' : 'Nothing due on this day';
    body.appendChild(e);
  } else {
    visibleDayDels
      .sort((a, b) => {
        if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time);
        if (a.due_time) return -1;
        if (b.due_time) return 1;
        return 0;
      })
      .forEach(del => body.appendChild(buildDelCard(del)));
  }

  const dayEvts = state.events.filter(e => e.event_date === selectedDay);
  if (dayEvts.length > 0) {
    const evtHdr = document.createElement('div');
    evtHdr.className = 'panel-sec-hdr';
    const evtAddBtn = document.createElement('button');
    evtAddBtn.className = 'panel-add';
    evtAddBtn.textContent = '+';
    evtAddBtn.addEventListener('click', () => openEventModal(selectedDay, null));
    evtHdr.innerHTML = `<span>Events (${dayEvts.length})</span>`;
    evtHdr.appendChild(evtAddBtn);
    body.appendChild(evtHdr);
    dayEvts.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'del-card';
      card.style.cssText = 'border-left-color:#9775fa;cursor:pointer;';
      const titleRow = document.createElement('div');
      titleRow.className = 'del-card-title';
      const dot = document.createElement('div');
      dot.className = 'del-status-dot';
      dot.style.background = '#9775fa';
      titleRow.appendChild(dot);
      const titleSpan = document.createElement('span');
      titleSpan.textContent = ev.title;
      titleRow.appendChild(titleSpan);
      card.appendChild(titleRow);
      if (ev.event_time) {
        const meta = document.createElement('div');
        meta.className = 'del-card-meta';
        const t = document.createElement('div');
        t.className = 'del-time-tag';
        t.textContent = ev.event_time.toUpperCase();
        meta.appendChild(t);
        card.appendChild(meta);
      }
      card.addEventListener('click', () => openEventModal(selectedDay, ev));
      body.appendChild(card);
    });
  } else {
    const evtHdr = document.createElement('div');
    evtHdr.className = 'panel-sec-hdr';
    evtHdr.innerHTML = '<span>Events</span>';
    const evtAddBtn = document.createElement('button');
    evtAddBtn.className = 'panel-add';
    evtAddBtn.textContent = '+';
    evtAddBtn.addEventListener('click', () => openEventModal(selectedDay, null));
    evtHdr.appendChild(evtAddBtn);
    body.appendChild(evtHdr);
  }

  // Upcoming
  const upHdr = document.createElement('div');
  upHdr.className = 'panel-sec-hdr';
  upHdr.textContent = 'Upcoming (14 days)';
  body.appendChild(upHdr);

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14);
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
        dh.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-dim);letter-spacing:.4px;padding:5px 0 2px;text-transform:uppercase;';
        dh.textContent = formatShort(del.due_at);
        body.appendChild(dh);
        lastDate = del.due_at;
      }
      body.appendChild(buildUpcomingItem(del));
    });
  }
}

function buildDelCard(del) {
  const proj = state.projects.find(p => p.id === del.project_id);
  const col  = colorOf(proj);
  const st   = STATUSES[del.status] || STATUSES.not_started;
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
  titleRow.appendChild(dot);
  titleRow.appendChild(Object.assign(document.createElement('span'), { textContent: del.title }));
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
  if (del.category && del.category !== 'client') {
    const cb = document.createElement('div');
    cb.className = 'del-cat-badge';
    cb.textContent = del.category;
    meta.appendChild(cb);
  }
  if (del.due_time) {
    const tb = document.createElement('div');
    tb.className = 'del-time-tag';
    tb.textContent = del.due_time.toUpperCase();
    meta.appendChild(tb);
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
  item.addEventListener('click', () => {
    selectedDay = del.due_at;
    calDate = new Date(parseDate(del.due_at).getFullYear(), parseDate(del.due_at).getMonth(), 1);
    weekStart = getWeekStart(parseDate(del.due_at));
    render();
  });
  const date = document.createElement('div');
  date.className = 'upcoming-date';
  date.textContent = formatShort(del.due_at);
  const bdy = document.createElement('div');
  bdy.className = 'upcoming-body';
  const t = document.createElement('div');
  t.className = 'upcoming-title';
  t.textContent = (del.due_time ? del.due_time.toUpperCase() + ' · ' : '') + del.title;
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

// ── PROJECTS PAGE ──────────────────────────────────────────────────────────
const DEL_STATUS_ORDER = ['blocked', 'in_progress', 'review', 'not_started'];

function renderProjectsPage() {
  const grid = document.getElementById('proj-cards-grid');
  grid.innerHTML = '';

  // Remove stale archive panel
  const old = document.getElementById('archive-panel');
  if (old) old.remove();

  if (state.projects.length === 0) {
    grid.innerHTML = '<div class="pp-empty">No projects yet — click "+ New Project" to get started.</div>';
    renderArchivePanel();
    return;
  }

  getSortedProjects().forEach(p => {
    const col = colorOf(p);
    const sc  = STATUS_COLORS[p.status] || STATUS_COLORS.active;
    const team = getProjTeam(p);

    const projDels  = state.deliverables.filter(d => d.project_id === p.id);
    const activeDels = [...projDels.filter(d => d.status !== 'done')]
      .sort((a, b) => DEL_STATUS_ORDER.indexOf(a.status) - DEL_STATUS_ORDER.indexOf(b.status));
    const doneDels  = projDels.filter(d => d.status === 'done');
    const totalDels = projDels.length;
    const doneCount = doneDels.length;
    const progress  = totalDels > 0 ? Math.round((doneCount / totalDels) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'proj-card';
    card.draggable = true;
    card.dataset.projId = p.id;
    card.addEventListener('dragstart', e => {
      ppDragId = p.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('pp-dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('pp-dragging');
      document.querySelectorAll('.proj-card.pp-drag-over').forEach(c => c.classList.remove('pp-drag-over'));
      ppDragId = null;
    });
    card.addEventListener('dragover', e => {
      if (!ppDragId || ppDragId === p.id) return;
      e.preventDefault();
      document.querySelectorAll('.proj-card.pp-drag-over').forEach(c => c.classList.remove('pp-drag-over'));
      card.classList.add('pp-drag-over');
    });
    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) card.classList.remove('pp-drag-over');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('pp-drag-over');
      if (!ppDragId || ppDragId === p.id) return;
      const sorted = getSortedProjects();
      const ids = sorted.map(q => q.id);
      const fromIdx = ids.indexOf(ppDragId);
      const toIdx = ids.indexOf(p.id);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, ppDragId);
      saveLocalProjOrder(ids);
      ppDragId = null;
      renderProjectsPage();
    });

    const stripe = document.createElement('div');
    stripe.className = 'proj-card-stripe';
    stripe.style.background = col.hex;

    const body = document.createElement('div');
    body.className = 'proj-card-body';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'proj-card-hdr';

    const nameBlock = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'proj-card-name';
    nameEl.textContent = p.name;
    nameBlock.appendChild(nameEl);
    if (p.client_name) {
      const clientEl = document.createElement('div');
      clientEl.className = 'proj-card-client';
      clientEl.textContent = p.client_name;
      nameBlock.appendChild(clientEl);
    }

    const topRight = document.createElement('div');
    topRight.className = 'proj-card-top-right';
    getProjCategories(p).forEach(cat => {
      const b = document.createElement('span');
      b.className = 'cat-badge';
      b.textContent = cat;
      topRight.appendChild(b);
    });
    const statusBadge = document.createElement('span');
    statusBadge.className = 'status-badge';
    statusBadge.style.cssText = `background:${sc.bg};color:${sc.color};`;
    statusBadge.textContent = p.status.charAt(0).toUpperCase() + p.status.slice(1);
    topRight.appendChild(statusBadge);
    const colorBtn = document.createElement('button');
    colorBtn.className = 'proj-card-color-btn';
    colorBtn.style.background = col.hex;
    colorBtn.title = 'Change color (local only)';
    colorBtn.addEventListener('click', e => { e.stopPropagation(); openLocalColorPicker(e.currentTarget, p.id, col.key); });
    topRight.appendChild(colorBtn);
    const editBtn = document.createElement('button');
    editBtn.className = 'proj-card-edit';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openProjModal(p));
    topRight.appendChild(editBtn);

    hdr.appendChild(nameBlock);
    hdr.appendChild(topRight);
    body.appendChild(hdr);

    // Phase + team row
    const metaRow = document.createElement('div');
    metaRow.className = 'proj-card-meta-row';
    if (p.phase) {
      const phaseEl = document.createElement('div');
      phaseEl.className = 'proj-card-phase';
      const lbl = document.createElement('span');
      lbl.className = 'proj-card-phase-label';
      lbl.textContent = 'Phase:';
      phaseEl.appendChild(lbl);
      phaseEl.appendChild(Object.assign(document.createElement('span'), { textContent: ' ' + p.phase }));
      metaRow.appendChild(phaseEl);
    }
    if (team.length > 0) {
      const avatarRow = document.createElement('div');
      avatarRow.className = 'proj-card-avatars';
      team.slice(0, 6).forEach(member => {
        const ai = getAvatarInfo(member.name);
        const showEmoji = localStorage.getItem('spd:show-emoji') === 'true';
        const isEmoji = showEmoji && state.teamMembers.find(m => m.name === member.name)?.emoji;
        const av = document.createElement('div');
        av.className = 'team-av-sm';
        av.style.cssText = `background:${ai.hex}22;border-color:${ai.hex}55;color:${ai.hex};font-size:${isEmoji ? '14px' : '9px'};`;
        av.textContent = ai.text;
        av.title = member.name + (member.role ? ` — ${member.role}` : '');
        avatarRow.appendChild(av);
      });
      if (team.length > 6) {
        const more = document.createElement('div');
        more.className = 'team-av-sm team-av-more';
        more.textContent = `+${team.length - 6}`;
        avatarRow.appendChild(more);
      }
      metaRow.appendChild(avatarRow);
    }
    if (metaRow.children.length > 0) body.appendChild(metaRow);

    // Deliverables section
    if (activeDels.length > 0 || doneDels.length > 0) {
      const delSection = document.createElement('div');
      delSection.className = 'proj-del-section';

      if (activeDels.length > 0) {
        // Status summary badges
        const summaryRow = document.createElement('div');
        summaryRow.className = 'proj-del-summary';
        const groups = {};
        activeDels.forEach(d => { groups[d.status] = (groups[d.status] || 0) + 1; });
        DEL_STATUS_ORDER.forEach(s => {
          if (!groups[s]) return;
          const badge = document.createElement('span');
          badge.className = 'del-status-summary-badge';
          badge.style.cssText = `background:${STATUSES[s].color}20;color:${STATUSES[s].color};border:1px solid ${STATUSES[s].color}40;`;
          badge.textContent = `${groups[s]} ${STATUSES[s].label}`;
          summaryRow.appendChild(badge);
        });
        delSection.appendChild(summaryRow);

        activeDels.forEach(d => delSection.appendChild(buildProjDelRow(d)));
      }

      if (doneDels.length > 0) {
        const doneHdr = document.createElement('div');
        doneHdr.className = 'proj-del-done-hdr';
        const doneLabel = document.createElement('span');
        doneLabel.className = 'proj-del-done-label';
        doneLabel.textContent = `${doneCount} Completed`;
        const archAllBtn = document.createElement('button');
        archAllBtn.className = 'proj-archive-btn';
        archAllBtn.textContent = 'Archive all';
        archAllBtn.addEventListener('click', () => archiveAllDone(p.id));
        doneHdr.appendChild(doneLabel);
        doneHdr.appendChild(archAllBtn);
        delSection.appendChild(doneHdr);
        doneDels.forEach(d => delSection.appendChild(buildProjDelRow(d, true)));
      }

      body.appendChild(delSection);
    }

    // Footer: progress bar
    const footer = document.createElement('div');
    footer.className = 'proj-card-footer';
    const statsEl = document.createElement('div');
    statsEl.className = 'proj-del-stats';
    statsEl.textContent = `${doneCount}/${totalDels} deliverables`;
    const bar = document.createElement('div');
    bar.className = 'proj-del-bar';
    const fill = document.createElement('div');
    fill.className = 'proj-del-fill';
    fill.style.cssText = `width:${progress}%;background:${col.hex};`;
    bar.appendChild(fill);
    footer.appendChild(statsEl);
    footer.appendChild(bar);
    body.appendChild(footer);

    card.appendChild(stripe);
    card.appendChild(body);
    grid.appendChild(card);
  });

  renderArchivePanel();
}

function buildProjDelRow(d, isDone = false) {
  const st = STATUSES[d.status] || STATUSES.not_started;
  const row = document.createElement('div');
  row.className = 'proj-del-row' + (isDone ? ' done' : '');
  row.addEventListener('click', () => openDelModal(d));

  const dot = document.createElement('div');
  dot.className = 'proj-del-dot';
  dot.style.background = st.color;
  dot.title = st.label;

  const title = document.createElement('div');
  title.className = 'proj-del-row-title';
  title.textContent = d.title;

  const meta = document.createElement('div');
  meta.className = 'proj-del-row-meta';
  if (d.assignee) {
    const a = document.createElement('span');
    a.className = 'proj-del-row-assignee';
    a.textContent = d.assignee;
    meta.appendChild(a);
  }
  if (d.due_at) {
    const dEl = document.createElement('span');
    dEl.className = 'proj-del-row-due' + (isOverdue(d.due_at) && !isDone ? ' overdue' : '');
    dEl.textContent = formatShort(d.due_at);
    meta.appendChild(dEl);
  }

  row.appendChild(dot);
  row.appendChild(title);
  row.appendChild(meta);

  if (!isDone) {
    const archBtn = document.createElement('button');
    archBtn.className = 'proj-del-arch-btn';
    archBtn.textContent = '↓';
    archBtn.title = 'Archive';
    archBtn.addEventListener('click', e => { e.stopPropagation(); archiveDeliverable(d.id); });
    row.appendChild(archBtn);
  }

  return row;
}

function openLocalColorPicker(anchor, projId, currentKey) {
  const existing = document.getElementById('local-color-popover');
  const wasOpen = existing?.dataset.projId === projId;
  existing?.remove();
  if (wasOpen) return;

  const pop = document.createElement('div');
  pop.id = 'local-color-popover';
  pop.dataset.projId = projId;
  pop.className = 'local-color-popover';

  PROJECT_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'lcp-swatch' + (c.key === (localProjColors[projId] || currentKey) ? ' sel' : '');
    sw.style.background = c.hex;
    sw.title = c.key;
    sw.addEventListener('click', e => {
      e.stopPropagation();
      localProjColors[projId] = c.key;
      saveLocalProjColors(localProjColors);
      pop.remove();
      render();
    });
    pop.appendChild(sw);
  });

  const rect = anchor.getBoundingClientRect();
  pop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 230)}px;z-index:9000;`;
  document.body.appendChild(pop);

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

function renderArchivePanel() {
  const ppBody = document.querySelector('.pp-body');
  const panel = document.createElement('div');
  panel.id = 'archive-panel';
  panel.className = 'archive-panel';

  const totalArchived = state.archivedDeliverables.length;

  const hdr = document.createElement('div');
  hdr.className = 'archive-panel-hdr';
  const hdrLeft = document.createElement('span');
  hdrLeft.innerHTML = `Archived <span class="archive-count">${totalArchived}</span>`;
  const hdrIcon = document.createElement('span');
  hdrIcon.className = 'archive-toggle-icon';
  hdrIcon.textContent = showArchive ? '▲' : '▼';
  hdr.appendChild(hdrLeft);
  hdr.appendChild(hdrIcon);
  hdr.addEventListener('click', () => { showArchive = !showArchive; renderProjectsPage(); });
  panel.appendChild(hdr);

  if (showArchive) {
    const body = document.createElement('div');
    body.className = 'archive-panel-body';

    if (totalArchived === 0) {
      const empty = document.createElement('div');
      empty.className = 'archive-empty';
      empty.textContent = 'No archived deliverables.';
      body.appendChild(empty);
    } else {
      const byProject = {};
      state.archivedDeliverables.forEach(d => {
        const key = d.project_id || '__none__';
        if (!byProject[key]) byProject[key] = [];
        byProject[key].push(d);
      });

      Object.entries(byProject).forEach(([projId, dels]) => {
        const proj = state.projects.find(p => p.id === projId);
        const col = colorOf(proj);
        const group = document.createElement('div');
        group.className = 'archive-proj-group';

        const groupHdr = document.createElement('div');
        groupHdr.className = 'archive-proj-name';
        const dot = document.createElement('div');
        dot.className = 'archive-proj-dot';
        dot.style.background = col.hex;
        groupHdr.appendChild(dot);
        groupHdr.appendChild(Object.assign(document.createElement('span'), { textContent: proj?.name || 'No Project' }));
        group.appendChild(groupHdr);

        dels.forEach(d => {
          const row = document.createElement('div');
          row.className = 'archive-del-row';

          const titleEl = document.createElement('span');
          titleEl.className = 'archive-del-title';
          titleEl.textContent = d.title;

          const metaEl = document.createElement('span');
          metaEl.className = 'archive-del-meta';
          metaEl.textContent = [d.assignee, d.due_at ? formatShort(d.due_at) : ''].filter(Boolean).join(' · ');

          const unarchBtn = document.createElement('button');
          unarchBtn.className = 'archive-unarch-btn';
          unarchBtn.textContent = 'Restore';
          unarchBtn.title = 'Unarchive';
          unarchBtn.addEventListener('click', e => { e.stopPropagation(); unarchiveDeliverable(d.id); });

          row.appendChild(titleEl);
          if (metaEl.textContent) row.appendChild(metaEl);
          row.appendChild(unarchBtn);
          group.appendChild(row);
        });

        body.appendChild(group);
      });
    }

    panel.appendChild(body);
  }

  ppBody.appendChild(panel);
}

// ── CONTEXT MENU ───────────────────────────────────────────────────────────
function openCtxMenu(x, y, ds) {
  closeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  menu.style.top  = Math.min(y, window.innerHeight - 100) + 'px';
  menu.addEventListener('click', e => e.stopPropagation());

  const addDel = document.createElement('div');
  addDel.className = 'ctx-item';
  addDel.textContent = '+ New deliverable';
  addDel.addEventListener('click', () => { closeCtxMenu(); selectedDay = ds; addingForDate = ds; openDelModal(null); });

  const addEvt = document.createElement('div');
  addEvt.className = 'ctx-item';
  addEvt.textContent = '◆ New event';
  addEvt.addEventListener('click', () => { closeCtxMenu(); openEventModal(ds, null); });

  menu.appendChild(addDel);
  menu.appendChild(addEvt);
  document.body.appendChild(menu);
  activeCtxMenu = menu;
}
function closeCtxMenu() {
  if (activeCtxMenu) { activeCtxMenu.remove(); activeCtxMenu = null; }
}
document.addEventListener('click', closeCtxMenu);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeCtxMenu(); closeProjModal(); closeDelModal(); closeEventModal(); }
});

// ── PROJECT MODAL ──────────────────────────────────────────────────────────
function openProjModal(proj) {
  editingProjId = proj?.id || null;
  document.getElementById('proj-modal-title').textContent = proj ? 'Edit Project' : 'New Project';
  document.getElementById('pm-name').value   = proj?.name || '';
  document.getElementById('pm-client').value = proj?.client_name || '';
  document.getElementById('pm-status').value = proj?.status || 'active';
  document.getElementById('pm-delete').style.display = proj ? 'block' : 'none';

  selectedProjColor      = proj?.color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)].key;
  selectedProjCategories = [...getProjCategories(proj)];
  editingPhases = JSON.parse(JSON.stringify(getProjPhases(proj)));
  editingTeam   = JSON.parse(JSON.stringify(getProjTeam(proj)));

  buildColorRow();
  buildCategoryChecks();
  buildPhaseEditor();
  buildTeamEditor();
  buildCurrentPhaseSelect(proj?.phase || '');

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

function buildCategoryChecks() {
  const row = document.getElementById('pm-categories');
  row.innerHTML = '';
  PROJECT_CATEGORIES.forEach(cat => {
    const opt = document.createElement('div');
    opt.className = 'check-opt' + (selectedProjCategories.includes(cat) ? ' active' : '');
    opt.innerHTML = `<div class="check-box">${selectedProjCategories.includes(cat) ? '✓' : ''}</div><span>${cat}</span>`;
    opt.addEventListener('click', () => {
      if (selectedProjCategories.includes(cat)) {
        selectedProjCategories = selectedProjCategories.filter(c => c !== cat);
        opt.classList.remove('active');
        opt.querySelector('.check-box').textContent = '';
      } else {
        selectedProjCategories.push(cat);
        opt.classList.add('active');
        opt.querySelector('.check-box').textContent = '✓';
      }
      buildCurrentPhaseSelect(document.getElementById('pm-phase').value);
    });
    row.appendChild(opt);
  });
}

function buildPhaseEditor() {
  const list = document.getElementById('pm-phases-list');
  list.innerHTML = '';
  editingPhases.forEach((ph, idx) => addPhaseRow(ph, idx));
}

function addPhaseRow(ph, idx) {
  const list = document.getElementById('pm-phases-list');
  const row = document.createElement('div');
  row.className = 'phase-row';
  row.dataset.idx = idx;

  const numInput = document.createElement('input');
  numInput.className = 'phase-num-input';
  numInput.value = ph.num || '';
  numInput.placeholder = '00';
  numInput.addEventListener('input', () => {
    editingPhases[idx].num = numInput.value;
    rebuildCurrentPhaseSelect();
  });

  const nameInput = document.createElement('input');
  nameInput.className = 'phase-name-input';
  nameInput.value = ph.name || '';
  nameInput.placeholder = 'Phase name';
  nameInput.addEventListener('input', () => {
    editingPhases[idx].name = nameInput.value;
    rebuildCurrentPhaseSelect();
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'phase-del-btn';
  delBtn.textContent = '×';
  delBtn.title = 'Remove phase';
  delBtn.addEventListener('click', () => {
    editingPhases.splice(idx, 1);
    buildPhaseEditor();
    rebuildCurrentPhaseSelect();
  });

  row.appendChild(numInput);
  row.appendChild(nameInput);
  row.appendChild(delBtn);
  list.appendChild(row);
}

document.getElementById('pm-add-phase').addEventListener('click', () => {
  const nextNum = String(editingPhases.length).padStart(2, '0');
  editingPhases.push({ num: nextNum, name: '' });
  buildPhaseEditor();
  rebuildCurrentPhaseSelect();
  const inputs = document.querySelectorAll('.phase-name-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

function buildCurrentPhaseSelect(currentVal) {
  const sel = document.getElementById('pm-phase');
  sel.innerHTML = '<option value="">— No current phase —</option>';
  editingPhases.forEach(ph => {
    const label = `${ph.num} ${ph.name}`.trim();
    if (!label) return;
    const o = document.createElement('option');
    o.value = label;
    o.textContent = label;
    if (label === currentVal) o.selected = true;
    sel.appendChild(o);
  });
}
function rebuildCurrentPhaseSelect() {
  buildCurrentPhaseSelect(document.getElementById('pm-phase').value);
}

function buildTeamEditor() {
  const list = document.getElementById('pm-team-list');
  list.innerHTML = '';
  editingTeam.forEach((member, idx) => addTeamRow(member, idx));
}

function addTeamRow(member, idx) {
  const list = document.getElementById('pm-team-list');
  const row = document.createElement('div');
  row.className = 'team-row';

  const nameInput = document.createElement('input');
  nameInput.className = 'team-name-input';
  nameInput.value = member.name || '';
  nameInput.placeholder = 'Name';
  nameInput.addEventListener('input', () => { editingTeam[idx].name = nameInput.value; });
  attachMemberAutocomplete(nameInput);

  const roleInput = document.createElement('input');
  roleInput.className = 'team-role-input';
  roleInput.value = member.role || '';
  roleInput.placeholder = 'Role or description';
  roleInput.addEventListener('input', () => { editingTeam[idx].role = roleInput.value; });

  const delBtn = document.createElement('button');
  delBtn.className = 'team-del-btn';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => {
    editingTeam.splice(idx, 1);
    buildTeamEditor();
  });

  row.appendChild(nameInput);
  row.appendChild(roleInput);
  row.appendChild(delBtn);
  list.appendChild(row);
}

document.getElementById('pm-add-member').addEventListener('click', () => {
  editingTeam.push({ name: '', role: '' });
  buildTeamEditor();
  const inputs = document.querySelectorAll('.team-name-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

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
    client_name:       document.getElementById('pm-client').value.trim(),
    status:            document.getElementById('pm-status').value,
    phase:             document.getElementById('pm-phase').value,
    color:             selectedProjColor,
    categories:        selectedProjCategories,
    phases:            editingPhases.filter(p => p.name.trim()),
    team_members_json: editingTeam.filter(m => m.name.trim()),
  };
  closeProjModal();
  if (editingProjId) await updateProject(editingProjId, data);
  else await createProject(data);
});
document.getElementById('add-proj-btn').addEventListener('click', () => openProjModal(null));
document.getElementById('pp-add-btn').addEventListener('click', () => openProjModal(null));

// ── DELIVERABLE MODAL ──────────────────────────────────────────────────────
function openDelModal(del) {
  editingDelId = del?.id || null;
  document.getElementById('del-modal-title').textContent = del ? 'Edit Deliverable' : 'New Deliverable';
  document.getElementById('dm-title').value    = del?.title || '';
  document.getElementById('dm-assignee').value = del?.assignee || '';
  document.getElementById('dm-status').value   = del?.status || 'not_started';
  document.getElementById('dm-due').value      = del?.due_at || addingForDate || '';
  document.getElementById('dm-time').value     = del?.due_time || '';
  document.getElementById('dm-desc').value     = del?.description || '';
  document.getElementById('dm-notes').value    = del?.notes || '';
  document.getElementById('dm-delete').style.display = del ? 'block' : 'none';
  selectedDelCategory = del?.category || 'client';

  // Populate project select
  const sel = document.getElementById('dm-project');
  sel.innerHTML = '<option value="">— No project —</option>';
  state.projects.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name + (p.client_name ? ` (${p.client_name})` : '');
    if (del?.project_id === p.id) o.selected = true;
    sel.appendChild(o);
  });
  if (!del && state.projects.length === 1) sel.value = state.projects[0].id;

  buildDelCategoryRadio();
  attachMemberAutocomplete(document.getElementById('dm-assignee'));

  document.getElementById('del-modal').classList.add('open');
  document.getElementById('dm-title').focus();
}
function closeDelModal() { document.getElementById('del-modal').classList.remove('open'); addingForDate = null; }

function buildDelCategoryRadio() {
  const row = document.getElementById('dm-category-row');
  row.innerHTML = '';
  DEL_CATEGORIES.forEach(cat => {
    const opt = document.createElement('div');
    opt.className = 'radio-opt' + (selectedDelCategory === cat ? ' active' : '');
    opt.innerHTML = `<div class="radio-dot"></div><span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>`;
    opt.addEventListener('click', () => {
      selectedDelCategory = cat;
      row.querySelectorAll('.radio-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
    row.appendChild(opt);
  });
}

document.getElementById('dm-eod-btn').addEventListener('click', () => {
  document.getElementById('dm-time').value = 'EOD';
});
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
    project_id:  document.getElementById('dm-project').value || null,
    assignee:    document.getElementById('dm-assignee').value.trim(),
    status:      document.getElementById('dm-status').value,
    due_at:      due,
    due_time:    document.getElementById('dm-time').value.trim(),
    category:    selectedDelCategory,
    description: document.getElementById('dm-desc').value.trim(),
    notes:       document.getElementById('dm-notes').value.trim(),
  };
  closeDelModal();
  if (editingDelId) await updateDeliverable(editingDelId, data);
  else await createDeliverable(data);
  if (due) selectedDay = due;
});

// ── EVENT MODAL ────────────────────────────────────────────────────────────
function openEventModal(date, evt) {
  editingEvtId = evt?.id || null;
  document.getElementById('evt-modal-title').textContent = evt ? 'Edit Event' : 'New Event';
  document.getElementById('em-title').value = evt?.title || '';
  document.getElementById('em-date').value  = evt?.event_date || date || '';
  document.getElementById('em-time').value  = evt?.event_time || '';
  document.getElementById('em-delete').style.display = evt ? 'block' : 'none';

  const sel = document.getElementById('em-project');
  sel.innerHTML = '<option value="">— No project —</option>';
  state.projects.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    if (evt?.project_id === p.id) o.selected = true;
    sel.appendChild(o);
  });

  document.getElementById('event-modal').classList.add('open');
  document.getElementById('em-title').focus();
}
function closeEventModal() { document.getElementById('event-modal').classList.remove('open'); }

document.getElementById('em-eod-btn').addEventListener('click', () => {
  document.getElementById('em-time').value = 'EOD';
});
document.getElementById('evt-modal-x').addEventListener('click', closeEventModal);
document.getElementById('em-cancel').addEventListener('click', closeEventModal);
document.getElementById('em-delete').addEventListener('click', async () => {
  closeEventModal(); await deleteEvent(editingEvtId);
});
document.getElementById('em-save').addEventListener('click', async () => {
  const title = document.getElementById('em-title').value.trim();
  const date  = document.getElementById('em-date').value;
  if (!title || !date) { document.getElementById('em-title').focus(); return; }
  const data = {
    title,
    event_date:  date,
    event_time:  document.getElementById('em-time').value.trim(),
    project_id:  document.getElementById('em-project').value || null,
    description: '',
  };
  closeEventModal();
  if (editingEvtId) await updateEvent(editingEvtId, data);
  else await createEvent(data);
  selectedDay = date;
});

// ── CALENDAR NAV ───────────────────────────────────────────────────────────
document.getElementById('cal-prev').addEventListener('click', () => {
  if (currentView === 'month') {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
  } else if (currentView === 'twoweek') {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() - 14);
  } else {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() - 7);
  }
  render();
});
document.getElementById('cal-next').addEventListener('click', () => {
  if (currentView === 'month') {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
  } else if (currentView === 'twoweek') {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() + 14);
  } else {
    weekStart = new Date(weekStart); weekStart.setDate(weekStart.getDate() + 7);
  }
  render();
});
document.getElementById('cal-today-btn').addEventListener('click', () => {
  const now = new Date();
  calDate    = new Date(now.getFullYear(), now.getMonth(), 1);
  weekStart  = getWeekStart(now);
  selectedDay = todayStr();
  render();
});

function setView(v) {
  currentView = v;
  document.getElementById('view-month-btn').classList.toggle('active', v === 'month');
  document.getElementById('view-2wk-btn').classList.toggle('active', v === 'twoweek');
  document.getElementById('view-week-btn').classList.toggle('active', v === 'week');
  document.getElementById('view-projects-btn').classList.toggle('active', v === 'projects');
  document.getElementById('view-settings-btn').classList.toggle('active', v === 'settings');
  render();
}
document.getElementById('view-month-btn').addEventListener('click', () => setView('month'));
document.getElementById('view-2wk-btn').addEventListener('click', () => {
  weekStart = getWeekStart(new Date());
  setView('twoweek');
});
document.getElementById('view-week-btn').addEventListener('click', () => {
  weekStart = selectedDay ? getWeekStart(parseDate(selectedDay)) : getWeekStart(new Date());
  setView('week');
});
document.getElementById('view-projects-btn').addEventListener('click', () => setView('projects'));
document.getElementById('view-settings-btn').addEventListener('click', () => setView('settings'));

// ── SETTINGS PAGE ──────────────────────────────────────────────────────────
function renderSettingsPage() {
  const body = document.getElementById('settings-body');
  body.innerHTML = '';
  const showEmoji = localStorage.getItem('spd:show-emoji') === 'true';

  // Team Members
  const tmSection = document.createElement('div');
  tmSection.className = 'settings-section';
  const tmHdr = document.createElement('div');
  tmHdr.className = 'settings-section-hdr';
  const tmTitle = document.createElement('div');
  tmTitle.className = 'settings-section-title';
  tmTitle.textContent = 'Team Members';
  const tmAdd = document.createElement('button');
  tmAdd.className = 'btn-primary';
  tmAdd.style.fontSize = '12px';
  tmAdd.textContent = '+ Add Member';
  tmAdd.addEventListener('click', () => openMemberModal(null));
  tmHdr.appendChild(tmTitle);
  tmHdr.appendChild(tmAdd);
  tmSection.appendChild(tmHdr);

  if (state.teamMembers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    empty.textContent = 'No team members yet — add your first one.';
    tmSection.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'member-list';
    state.teamMembers.forEach(m => {
      const row = document.createElement('div');
      row.className = 'member-row';
      const col = PROJECT_COLORS.find(c => c.key === m.color) || PROJECT_COLORS[5];
      const av = document.createElement('div');
      av.className = 'member-av';
      av.style.cssText = `background:${col.hex}22;border:1px solid ${col.hex}55;color:${col.hex};font-size:${(showEmoji && m.emoji) ? '18px' : '11px'};`;
      av.textContent = (showEmoji && m.emoji) ? m.emoji : initials(m.name);
      const info = document.createElement('div');
      info.className = 'member-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'member-name';
      nameEl.textContent = m.name;
      info.appendChild(nameEl);
      const sub = [m.title, m.email].filter(Boolean).join(' · ');
      if (sub) {
        const subEl = document.createElement('div');
        subEl.className = 'member-sub';
        subEl.textContent = sub;
        info.appendChild(subEl);
      }
      const actions = document.createElement('div');
      actions.className = 'member-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'proj-card-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openMemberModal(m));
      actions.appendChild(editBtn);
      row.appendChild(av);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
    tmSection.appendChild(list);
  }
  body.appendChild(tmSection);

  // Divider
  const div = document.createElement('div');
  div.className = 'settings-divider';
  body.appendChild(div);

  // Preferences
  const prefSection = document.createElement('div');
  prefSection.className = 'settings-section';
  const prefHdr = document.createElement('div');
  prefHdr.className = 'settings-section-hdr';
  const prefTitle = document.createElement('div');
  prefTitle.className = 'settings-section-title';
  prefTitle.textContent = 'Preferences';
  prefHdr.appendChild(prefTitle);
  prefSection.appendChild(prefHdr);

  const prefRow = document.createElement('div');
  prefRow.className = 'pref-row';
  const toggle = document.createElement('button');
  toggle.className = 'pref-toggle' + (showEmoji ? ' on' : '');
  toggle.textContent = showEmoji ? 'ON' : 'OFF';
  toggle.addEventListener('click', () => {
    localStorage.setItem('spd:show-emoji', String(!showEmoji));
    render();
  });
  const prefText = document.createElement('div');
  const prefLabel = document.createElement('div');
  prefLabel.className = 'pref-label';
  prefLabel.textContent = 'Replace initials with emoji';
  const prefSub = document.createElement('div');
  prefSub.className = 'pref-sub';
  prefSub.textContent = 'Shows each member\'s emoji in avatars across projects, calendar, and sidebar.';
  prefText.appendChild(prefLabel);
  prefText.appendChild(prefSub);
  prefRow.appendChild(toggle);
  prefRow.appendChild(prefText);
  prefSection.appendChild(prefRow);
  body.appendChild(prefSection);
}

// ── TEAM MEMBER MODAL ──────────────────────────────────────────────────────
function openMemberModal(member) {
  editingMemberId   = member?.id || null;
  selectedMemberColor = member?.color || 'blue';
  document.getElementById('member-modal-title').textContent = member ? 'Edit Team Member' : 'New Team Member';
  document.getElementById('mm-name').value  = member?.name  || '';
  document.getElementById('mm-title').value = member?.title || '';
  document.getElementById('mm-email').value = member?.email || '';
  document.getElementById('mm-emoji').value = member?.emoji || '';
  document.getElementById('mm-delete').style.display = member ? 'block' : 'none';
  buildMemberColorRow();
  document.getElementById('member-modal').classList.add('open');
  document.getElementById('mm-name').focus();
}
function closeMemberModal() { document.getElementById('member-modal').classList.remove('open'); }
function buildMemberColorRow() {
  const row = document.getElementById('mm-color-row');
  row.innerHTML = '';
  PROJECT_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'cswatch' + (c.key === selectedMemberColor ? ' sel' : '');
    sw.style.background = c.hex;
    sw.title = c.key;
    sw.addEventListener('click', () => {
      selectedMemberColor = c.key;
      row.querySelectorAll('.cswatch').forEach(s => s.classList.toggle('sel', s.title === c.key));
    });
    row.appendChild(sw);
  });
}
document.getElementById('member-modal-x').addEventListener('click', closeMemberModal);
document.getElementById('mm-cancel').addEventListener('click', closeMemberModal);
document.getElementById('mm-delete').addEventListener('click', async () => {
  closeMemberModal(); await deleteTeamMember(editingMemberId);
});
document.getElementById('mm-save').addEventListener('click', async () => {
  const name = document.getElementById('mm-name').value.trim();
  if (!name) { document.getElementById('mm-name').focus(); return; }
  const data = {
    name,
    title: document.getElementById('mm-title').value.trim(),
    email: document.getElementById('mm-email').value.trim(),
    emoji: document.getElementById('mm-emoji').value.trim().slice(0, 2),
    color: selectedMemberColor,
  };
  closeMemberModal();
  if (editingMemberId) await updateTeamMember(editingMemberId, data);
  else await createTeamMember(data);
});

// ── MEMBER AUTOCOMPLETE ────────────────────────────────────────────────────
function attachMemberAutocomplete(input) {
  let dropdown = null;
  const remove = () => { dropdown?.remove(); dropdown = null; };
  const show = q => {
    remove();
    const lower = q.toLowerCase();
    const matches = state.teamMembers
      .filter(m => !q || m.name.toLowerCase().includes(lower))
      .slice(0, 8);
    if (!matches.length) return;
    dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    const rect = input.getBoundingClientRect();
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;width:${Math.max(rect.width, 220)}px;z-index:9500;`;
    const showEmoji = localStorage.getItem('spd:show-emoji') === 'true';
    matches.forEach(m => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      const col = PROJECT_COLORS.find(c => c.key === m.color) || PROJECT_COLORS[5];
      const av = document.createElement('div');
      av.className = 'ac-av';
      av.style.cssText = `background:${col.hex}22;border:1px solid ${col.hex}55;color:${col.hex};font-size:${(showEmoji && m.emoji) ? '16px' : '10px'};`;
      av.textContent = (showEmoji && m.emoji) ? m.emoji : initials(m.name);
      const info = document.createElement('div');
      info.className = 'ac-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'ac-name';
      nameEl.textContent = m.name;
      info.appendChild(nameEl);
      if (m.title) {
        const sub = document.createElement('div');
        sub.className = 'ac-sub';
        sub.textContent = m.title;
        info.appendChild(sub);
      }
      item.appendChild(av);
      item.appendChild(info);
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = m.name;
        remove();
      });
      dropdown.appendChild(item);
    });
    document.body.appendChild(dropdown);
  };
  input.addEventListener('input', () => show(input.value.trim()));
  input.addEventListener('focus', () => show(input.value.trim()));
  input.addEventListener('blur', () => setTimeout(remove, 150));
}

// ── SETUP MODAL ────────────────────────────────────────────────────────────
document.getElementById('setup-sql-block').textContent = SETUP_SQL;
document.getElementById('setup-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(SETUP_SQL).then(() => {
    const btn = document.getElementById('setup-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy SQL'; }, 2000);
  });
});
document.getElementById('setup-dismiss').addEventListener('click', hideSetupModal);
function showSetupModal() {
  document.getElementById('setup-modal').classList.add('open');
  document.getElementById('setup-dismiss').style.display = 'block';
}
function hideSetupModal() { document.getElementById('setup-modal').classList.remove('open'); }

// ── AUTO REFRESH ────────────────────────────────────────────────────────────
setInterval(() => { if (state.user) render(); }, 300000);

// ── INIT ───────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { state.user = session.user; await enterApp(); }
})();
sb.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') location.reload(); });
