'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('carrier.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('carrier.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem('carrier.' + k); } catch (e) { /* ignore */ } }
  };
  const TITLES = { today: 'Today', campaigns: 'Campaigns', replies: 'Replies', tenders: 'Tenders', more: 'More', leads: 'Find leads' };
  let tab = ls.get('tab', 'today');
  let busy = false;
  let installEvt = null;

  /* ---------- talking to the sender ---------- */
  // Your Gmail accounts. "cfg" is the account being used; "accts" is the whole list; mode 'all' shows every account together.
  const accts = () => { let l = ls.get('accts', []); const c = ls.get('cfg'); if (c && !l.some((a) => a.u === c.u)) l = [{ l: 'Main', u: c.u, s: c.s }].concat(l); return l; };
  const modeAll = () => ls.get('mode') === 'all' && accts().length > 1;
  const curIndex = () => Math.max(0, accts().findIndex((a) => a.u === (ls.get('cfg') || {}).u));
  const acctAt = (i) => { const a = accts()[Number(i)]; return a ? { u: a.u, s: a.s } : ls.get('cfg'); };
  const acctName = (i) => (accts()[Number(i)] || {}).l || '';
  function useAccount(i) {
    const a = accts()[i]; if (!a) return;
    ls.set('cfg', { u: a.u, s: a.s }); ls.set('mode', 'one');
    ['status', 'replies', 'tenders', 'seen'].forEach(ls.del);
  }
  async function call(action, payload, acct) {
    const cfg = acct || ls.get('cfg');
    if (!cfg || !cfg.u) throw new Error('Not connected yet.');
    let relayErrors = {};
    for (let round = 0; round < 5; round++) {
      let res;
      try {
        res = await fetch(cfg.u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ secret: cfg.s, action, relay: true }, payload || {}, { relayResults: {}, relayErrors, relayNotes: {} })) });
      } catch (e) { throw new Error('Could not reach your sender. Check your internet.'); }
      let j;
      try { j = JSON.parse(await res.text()); } catch (e) { throw new Error('Your sender did not answer. Check it is deployed with access set to Anyone.'); }
      if (!j.ok && j.relay) { relayErrors = Object.assign({}, relayErrors, { [j.relay.provider]: 'Not available on the phone app.' }); continue; }
      if (!j.ok) throw new Error(j.error || 'The sender returned an error.');
      return j.data;
    }
    throw new Error('The AI service needed for this is not available on the phone app yet.');
  }

  /* ---------- small helpers ---------- */
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2800); }
  function ago(ms) {
    if (!ms) return '';
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function until(ms) {
    const m = Math.round((ms - Date.now()) / 60000);
    if (m <= 0) return 'any moment'; if (m < 60) return 'in about ' + m + ' min'; return 'in about ' + Math.round(m / 60) + ' h';
  }
  const gbp = (n) => (n == null || n === '' ? '' : '£' + Number(n).toLocaleString('en-GB'));
  const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const loading = (t) => '<div class="empty"><span class="spin"></span><div>' + esc(t || 'Loading…') + '</div></div>';
  const errBox = (e) => '<div class="banner bad">' + esc(e.message || e) + '</div>';

  /* ---------- connect ---------- */
  function readConnectLink() {
    const m = /[#&]connect=([^&]+)/.exec(location.hash || '');
    if (!m) return false;
    try {
      const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const o = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
      if (/^https:\/\/script\.google\.com\/.+\/exec$/.test(o.u) && o.s) {
        ls.set('cfg', { u: o.u, s: o.s });
        const list = (Array.isArray(o.a) ? o.a : []).filter((a) => a && /^https:\/\/script\.google\.com\/.+\/exec$/.test(a.u) && a.s).slice(0, 8).map((a) => ({ l: String(a.l || 'Account').slice(0, 30), u: a.u, s: a.s }));
        ls.set('accts', list); ls.set('mode', list.length > 1 ? 'all' : 'one');
        ['status', 'replies', 'tenders', 'seen', 'allStatus', 'allReplies'].forEach(ls.del);
        history.replaceState(null, '', location.pathname + location.search); return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  }
  function viewSetup() {
    $('#main').innerHTML = '<div class="card"><h2>Connect your sender</h2><p class="muted">On your computer, open OutpostX, go to the <b>Sender</b> tab, find <b>Use OutpostX on your phone</b>, and copy your phone link. Send it to yourself and open it here, or paste it below.</p>' +
      '<label class="field">Phone link<textarea id="linkIn" placeholder="https://…#connect=…" spellcheck="false" rows="3"></textarea></label><button class="btn primary block" id="linkGo" type="button">Connect</button><p class="muted" id="linkMsg"></p></div>';
    $('#linkGo').onclick = () => {
      const v = $('#linkIn').value.trim(); const i = v.indexOf('#');
      if (i < 0) { $('#linkMsg').textContent = 'That does not look like a phone link. It should contain #connect=.'; return; }
      location.hash = v.slice(i);
      if (readConnectLink()) { toast('Connected.'); go('today'); } else $('#linkMsg').textContent = 'That link could not be read. Copy it again from OutpostX on your computer.';
    };
  }

  /* ---------- TODAY ---------- */
  async function fetchStatuses() {
    const l = accts();
    const idx = modeAll() ? l.map((_, i) => i) : [curIndex()];
    return Promise.all(idx.map((i) => call('status', {}, acctAt(i)).then((s) => ({ i, s })).catch((e) => ({ i, err: String(e.message || e) }))));
  }
  const keyStatus = () => (modeAll() ? 'allStatus' : 'status');
  async function viewToday(force) {
    const cached = ls.get(keyStatus());
    const asItems = (c) => (modeAll() ? c : [{ i: curIndex(), s: c }]);
    if (cached) paintToday(asItems(cached), true);
    else $('#main').innerHTML = loading('Asking your sender…');
    const items = await fetchStatuses();
    items.forEach((x) => { if (x.s) takePin(x.s); });
    const good = items.filter((x) => x.s);
    if (!good.length) {
      const msg = (items[0] && items[0].err) || 'Could not reach your sender.';
      if (!cached && tab === 'today') { $('#main').innerHTML = errBox({ message: msg }) + '<button class="btn block" id="retry" type="button">Try again</button>'; const r = $('#retry'); if (r) r.onclick = () => viewToday(true); } else if (force) toast(msg);
      return;
    }
    if (modeAll()) ls.set('allStatus', items); else ls.set('status', Object.assign({ at: Date.now() }, good[0].s));
    if (tab === 'today') paintToday(items, false);
    dot(items);
  }
  function dot(items) { const l = Array.isArray(items) ? items : [{ s: items }]; $('#repDot').hidden = !l.some((x) => x.s && x.s.warm > 0); }
  const dueText = (ms) => ms <= Date.now() ? 'Overdue' : (Math.round((ms - Date.now()) / 86400000) <= 0 ? 'Today' : new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' }));
  function paintToday(items, stale) {
    const ok = items.filter((x) => x.s), multi = modeAll();
    const sum = (f) => ok.reduce((n, x) => n + (Number(f(x.s)) || 0), 0);
    const cap = sum((s) => s.effectiveCap || (s.settings && s.settings.dailyCap) || 0), sent = sum((s) => s.sentToday);
    const pct = cap ? Math.min(100, Math.round((sent / cap) * 100)) : 0;
    const cs = []; ok.forEach((x) => (x.s.campaigns || []).forEach((c) => cs.push({ c, i: x.i })));
    const active = cs.filter((o) => o.c.status === 'active');
    const replied = cs.reduce((n, o) => n + ((o.c.counts && o.c.counts.replied) || 0), 0);
    const s0 = ok[0] ? ok[0].s : {};
    let state = '';
    if (multi) state = active.length ? active.length + ' campaign' + (active.length === 1 ? '' : 's') + ' running across ' + ok.length + ' accounts' : 'No campaign is running';
    else if (s0.blockedUntil && s0.blockedUntil > Date.now()) state = 'Paused by Google until ' + new Date(s0.blockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    else if (!active.length) state = 'No campaign is running';
    else if (!s0.inWindow) state = 'Outside your sending hours';
    else if (s0.nextSendAt) state = 'Next email ' + until(s0.nextSendAt);
    const notices = []; ok.forEach((x) => (x.s.notices || []).forEach((n) => notices.push({ n, i: x.i })));
    const todos = []; ok.forEach((x) => (x.s.todos || []).forEach((t) => todos.push({ t, i: x.i }))); todos.sort((a, b) => a.t.due - b.t.due);
    const sug = []; ok.forEach((x) => (x.s.suggest || []).forEach((t) => sug.push({ t, i: x.i })));
    const old = ok.filter((x) => (x.s.version || 0) < 14);
    const bad = items.filter((x) => x.err);
    const waiting = sum((s) => s.waiting), warm = sum((s) => s.warm);
    $('#main').innerHTML =
      (old.length ? '<div class="banner">' + (multi ? 'The sender for ' + esc(old.map((x) => acctName(x.i)).join(', ')) + ' is older than this app. ' : 'Your sender code is older than this app. ') + 'On your computer open OutpostX, Sender tab, Copy sender code, paste it into Apps Script, run <b>setup</b>, then Deploy a new version.</div>' : '') +
      bad.map((x) => '<div class="banner bad">' + esc(acctName(x.i)) + ': ' + esc(x.err) + '</div>').join('') +
      '<div class="card hero"><div class="sub">' + (multi ? 'Sent today, all accounts' : 'Sent today') + '</div><div class="big">' + sent + (cap ? '<span style="font-size:20px;font-weight:600;opacity:.8"> of ' + cap + '</span>' : '') + '</div><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><div class="sub" style="margin-top:10px">' + esc(state) + '</div></div>' +
      (multi ? '<div class="card">' + ok.map((x) => '<div class="list-row"><div class="grow"><b>' + esc(acctName(x.i)) + '</b><div class="muted">' + esc(x.s.account || '') + '</div></div><div style="text-align:right"><b>' + (x.s.sentToday || 0) + '</b><span class="muted"> of ' + (x.s.effectiveCap || 0) + '</span></div></div>').join('') + '</div>' : '') +
      '<div class="tiles"><div class="tile"><b>' + warm + '</b><span>Interested</span></div><div class="tile"><b>' + replied + '</b><span>Replies</span></div><div class="tile"><b>' + waiting + '</b><span>Waiting to send</span></div></div>' +
      '<div class="row" style="margin-bottom:12px"><button class="btn block" id="chk" type="button">Check for replies now</button></div>' +
      (s0.lastReplyCheck ? '<p class="muted" style="margin:-4px 4px 12px">Last checked ' + esc(ago(s0.lastReplyCheck)) + '.</p>' : '') +
      (sug.length ? '<div class="banner"><div><b>' + sug.length + ' interested ' + (sug.length === 1 ? 'reply has' : 'replies have') + ' no reminder yet.</b> ' + esc(sug.slice(0, 3).map((x) => x.t.company || x.t.email).join(', ')) + '</div><div class="row" style="margin-top:8px"><button class="btn primary" id="sugGo" type="button">Remind me in 2 days</button></div></div>' : '') +
      (todos.length ? '<h2 class="sec">Follow-ups to do</h2>' + todos.slice(0, 12).map((o, k) => '<div class="card item"><div class="row" style="justify-content:space-between"><h3>' + esc(o.t.company || o.t.email) + '</h3><span class="tag ' + (o.t.overdue ? 'warn' : '') + '">' + esc(dueText(o.t.due)) + '</span></div><div class="meta">' + esc(o.t.email) + (o.t.leadStatus ? ' · ' + esc(o.t.leadStatus) : '') + (multi ? ' · ' + esc(acctName(o.i)) : '') + '</div>' + (o.t.note ? '<div class="snip">' + esc(o.t.note) + '</div>' : '') + '<div class="row"><button class="btn primary" data-todo="done" data-k="' + k + '" type="button">Done</button><button class="btn" data-todo="snooze" data-k="' + k + '" type="button">Snooze 1 day</button>' + (o.t.threadId ? '<a class="btn link-btn" target="_blank" rel="noopener" href="https://mail.google.com/mail/?authuser=' + encodeURIComponent((ok.find((x) => x.i === o.i).s.account) || '') + '#all/' + encodeURIComponent(o.t.threadId) + '">Open thread</a>' : '') + '</div></div>').join('') : '') +
      (notices.length ? '<h2 class="sec">Needs attention</h2>' + notices.slice().reverse().slice(0, 4).map((o) => '<div class="banner' + (o.n.kind === 'error' ? ' bad' : '') + '"><div>' + esc(o.n.text) + '</div><div class="row" style="margin-top:8px"><button class="btn" data-dismiss="' + esc(o.n.id) + '" data-ai="' + o.i + '" type="button">Dismiss</button></div></div>').join('') : '') +
      '<h2 class="sec">Running now</h2>' +
      (active.length ? active.slice(0, 6).map((o) => campCard(o.c, o.i)).join('') : '<div class="empty"><b>Nothing running</b>Start a campaign from OutpostX on your computer. This app will show it here.</div>');
    const chk = $('#chk'); if (chk) chk.onclick = async () => { chk.disabled = true; chk.textContent = 'Checking…'; try { await Promise.all(ok.map((x) => call('checkReplies', {}, acctAt(x.i)))); toast('Checked.'); } catch (e) { toast(e.message); } viewToday(true); };
    document.querySelectorAll('[data-dismiss]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await call('dismissNotices', { id: b.dataset.dismiss }, acctAt(b.dataset.ai)); } catch (e) { toast(e.message); } viewToday(true); }; });
    document.querySelectorAll('[data-todo]').forEach((b) => { b.onclick = async () => { const o = todos[Number(b.dataset.k)]; b.disabled = true; try { await call('setLead', { id: o.t.id, followInDays: b.dataset.todo === 'done' ? 0 : 1 }, acctAt(o.i)); toast(b.dataset.todo === 'done' ? 'Done.' : 'Snoozed until tomorrow.'); } catch (e) { toast(e.message); } viewToday(true); }; });
    const sg = $('#sugGo'); if (sg) sg.onclick = async () => { sg.disabled = true; try { for (const o of sug) await call('setLead', { id: o.t.id, leadStatus: 'interested', followInDays: 2 }, acctAt(o.i)); toast('Reminders set.'); } catch (e) { toast(e.message); } viewToday(true); };
    bindCampButtons();
  }

  /* ---------- CAMPAIGNS ---------- */
  const DELAYS = [[0, 'Automatic'], [10, '10 sec'], [20, '20 sec'], [30, '30 sec'], [40, '40 sec'], [45, '45 sec'], [60, '1 minute'], [120, '2 minutes']];
  function campCard(c, ai) {
    const k = c.counts || {}; const total = k.total || 0;
    const done = total - (k.queued || 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const st = c.status === 'active' ? '<span class="tag ok">Running</span>' : c.status === 'paused' ? '<span class="tag warn">Paused</span>' : '<span class="tag">' + esc(c.status) + '</span>';
    return '<div class="card item"><div class="row" style="justify-content:space-between"><h3>' + esc(c.name) + '</h3>' + st + '</div>' +
      '<div class="meta">' + (modeAll() ? esc(acctName(ai)) + ' · ' : '') + esc(c.service || '') + (c.unique ? ' · different email per business' : '') + '</div>' +
      '<div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<div class="meta" style="margin-top:8px">' + done + ' of ' + total + ' contacted · ' + (k.replied || 0) + ' replied' + (k.bounced ? ' · ' + k.bounced + ' bounced' : '') + (k.optout ? ' · ' + k.optout + ' opted out' : '') + '</div>' +
      '<label class="meta" style="display:block;margin-top:10px">Gap between emails<select class="delaypick" data-delay="' + esc(c.id) + '" data-ai="' + ai + '" style="width:100%;margin-top:4px">' + DELAYS.map((d) => '<option value="' + d[0] + '"' + ((Number(c.delaySec) || 0) === d[0] ? ' selected' : '') + '>' + (d[0] ? 'Every ' + d[1] : 'Automatic') + '</option>').join('') + '</select></label>' +
      (c.status === 'active' || c.status === 'paused' ? '<button class="btn" data-camp="' + esc(c.id) + '" data-ai="' + ai + '" data-to="' + (c.status === 'active' ? 'paused' : 'active') + '" type="button">' + (c.status === 'active' ? 'Pause' : 'Resume') + '</button>' : '') + '</div>';
  }
  function bindCampButtons() {
    const done = async (fn, msg) => { try { await fn(); toast(msg); } catch (e) { toast(e.message); } ls.del('allStatus'); ls.del('status'); render(); };
    document.querySelectorAll('[data-delay]').forEach((sel) => { sel.onchange = () => { sel.disabled = true; done(() => call('setCampaign', { id: sel.dataset.delay, delaySec: Number(sel.value) }, acctAt(sel.dataset.ai)), 'Gap saved.'); }; });
    document.querySelectorAll('[data-camp]').forEach((b) => { b.onclick = () => { b.disabled = true; done(() => call('setCampaign', { id: b.dataset.camp, status: b.dataset.to }, acctAt(b.dataset.ai)), b.dataset.to === 'paused' ? 'Paused.' : 'Resumed.'); }; });
  }
  async function viewCampaigns() {
    const cached = ls.get(keyStatus());
    const paint = (items) => {
      const out = items.filter((x) => x.s).map((x) => {
        const cs = (x.s.campaigns || []).slice().reverse();
        return (modeAll() ? '<h2 class="sec">' + esc(acctName(x.i)) + '</h2>' : '') + (cs.length ? cs.map((c) => campCard(c, x.i)).join('') : '<div class="empty"><b>No campaigns yet</b>Create one in OutpostX on your computer and it appears here.</div>');
      });
      $('#main').innerHTML = out.length ? out.join('') : '<div class="empty"><b>No campaigns yet</b>Create one in OutpostX on your computer and it appears here.</div>';
      bindCampButtons();
    };
    const asItems = (c) => (modeAll() ? c : [{ i: curIndex(), s: c }]);
    if (cached) paint(asItems(cached)); else $('#main').innerHTML = loading();
    const items = await fetchStatuses();
    const good = items.filter((x) => x.s);
    if (!good.length) { if (!cached) $('#main').innerHTML = errBox({ message: (items[0] && items[0].err) || 'Could not reach your sender.' }); return; }
    good.forEach((x) => takePin(x.s));
    if (modeAll()) ls.set('allStatus', items); else ls.set('status', Object.assign({ at: Date.now() }, good[0].s));
    if (tab === 'campaigns') paint(items);
    dot(items);
  }

  /* ---------- REPLIES ---------- */
  const TYPES = { interested: ['ok', 'Interested'], question: ['', 'Question'], notnow: ['warn', 'Not now'], unsub: ['bad', 'Stop'], ooo: ['', 'Out of office'] };
  const LEAD_OPTS = [['', 'No status'], ['interested', 'Interested'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']];
  const REMIND_OPTS = [[0, 'Remind me…'], [1, 'Tomorrow'], [2, 'In 2 days'], [3, 'In 3 days'], [7, 'In a week'], [14, 'In 2 weeks']];
  // What you are typing is kept safe: the list can refresh in the background without wiping an open reply box.
  const DRAFTS = ls.get('drafts', {});
  const saveDrafts = () => ls.set('drafts', DRAFTS);
  async function loadReplies() {
    const idx = modeAll() ? accts().map((_, i) => i) : [curIndex()];
    const got = await Promise.all(idx.map((i) => call('replies', {}, acctAt(i)).then((r) => (r.items || []).map((x) => Object.assign(x, { _a: i }))).catch((e) => { throw e; })));
    const items = [].concat.apply([], got).sort((a, b) => b.repliedAt - a.repliedAt);
    return { items };
  }
  async function viewReplies() {
    const key = modeAll() ? 'allReplies' : 'replies';
    const cached = ls.get(key);
    const paint = (r) => {
      const items = r.items || [];
      $('#main').innerHTML = items.length ? items.map((x, i) => { const t = TYPES[x.replyType] || ['', x.replyType || 'Reply']; return '<div class="card item" data-i="' + i + '"><div class="row" style="justify-content:space-between"><h3>' + esc(x.company || x.email) + '</h3><span class="tag ' + t[0] + '">' + esc(t[1]) + '</span></div><div class="meta">' + esc(x.email) + ' · ' + esc(ago(x.repliedAt)) + (x.campaign ? ' · ' + esc(x.campaign) : '') + (modeAll() ? ' · ' + esc(acctName(x._a)) : '') + '</div><div class="snip">' + esc(x.snippet) + '</div>' +
        (x.kind === 'stop' ? '' : '<div class="row" style="margin-bottom:8px"><select data-lead="' + i + '" aria-label="Lead status" style="flex:1">' + LEAD_OPTS.map((o) => '<option value="' + o[0] + '"' + (o[0] === (x.leadStatus || '') ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select><select data-remind="' + i + '" aria-label="Set a reminder" style="flex:1">' + REMIND_OPTS.map((o) => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></div>' + (x.followAt ? '<div class="meta" style="margin-bottom:8px">Reminder: ' + esc(dueText(x.followAt)) + '</div>' : '') + '<button class="btn primary" data-reply="' + i + '" type="button">Reply</button>') + '<div class="rbox" data-box="' + i + '"></div></div>'; }).join('') : '<div class="empty"><b>No replies yet</b>When someone replies they show up here.</div>';
      document.querySelectorAll('[data-reply]').forEach((b) => { b.onclick = () => openReply(items[Number(b.dataset.reply)], b.dataset.reply, b); });
      document.querySelectorAll('[data-lead]').forEach((sel) => { sel.onchange = async () => { const x = items[Number(sel.dataset.lead)]; try { await call('setLead', { id: x.id, leadStatus: sel.value }, acctAt(x._a)); x.leadStatus = sel.value; ls.set(key, { items }); toast('Saved.'); } catch (e) { toast(e.message); } }; });
      document.querySelectorAll('[data-remind]').forEach((sel) => { sel.onchange = async () => { const x = items[Number(sel.dataset.remind)]; if (!Number(sel.value)) return; try { await call('setLead', { id: x.id, followInDays: Number(sel.value) }, acctAt(x._a)); x.followAt = Date.now() + Number(sel.value) * 86400000; ls.set(key, { items }); toast('Reminder set. It shows on Today.'); } catch (e) { toast(e.message); } sel.value = '0'; }; });
      items.forEach((x, i) => { if (DRAFTS[x.id] != null) { const b = document.querySelector('[data-reply="' + i + '"]'); if (b) openReply(x, String(i), b); } });
    };
    const typing = () => { const a = document.activeElement; return a && a.tagName === 'TEXTAREA' && a.closest('.rbox'); };
    if (cached) paint(cached); else $('#main').innerHTML = loading('Reading your replies…');
    try { const r = await loadReplies(); ls.set(key, r); if (tab === 'replies' && !typing()) paint(r); } catch (e) { if (!cached) $('#main').innerHTML = errBox(e); else toast(e.message); }
  }
  function openReply(item, i, btn) {
    const box = document.querySelector('[data-box="' + i + '"]');
    btn.hidden = true;
    if (DRAFTS[item.id] == null) { DRAFTS[item.id] = ''; saveDrafts(); }
    box.innerHTML = '<label class="field" style="margin-top:8px">Your reply<textarea id="rt' + i + '" placeholder="Write your reply…"></textarea></label><div class="row"><button class="btn primary" id="rs' + i + '" type="button">Send</button><button class="btn" id="rd' + i + '" type="button">Save as draft</button><button class="btn" id="rc' + i + '" type="button">Cancel</button></div>';
    const ta = $('#rt' + i); ta.value = DRAFTS[item.id] || '';
    ta.addEventListener('input', () => { DRAFTS[item.id] = ta.value; saveDrafts(); });
    const text = () => ta.value.trim();
    const send = (asDraft) => async () => { if (!text()) { toast('Write a reply first.'); return; } $('#rs' + i).disabled = $('#rd' + i).disabled = true; try { await call('sendMessage', { id: item.id, text: text(), asDraft }, acctAt(item._a)); delete DRAFTS[item.id]; saveDrafts(); toast(asDraft ? 'Saved to your Gmail drafts.' : 'Sent.'); box.innerHTML = '<p class="muted">' + (asDraft ? 'Saved as a draft in Gmail.' : 'Sent.') + '</p>'; } catch (e) { toast(e.message); $('#rs' + i).disabled = $('#rd' + i).disabled = false; } };
    $('#rs' + i).onclick = send(false); $('#rd' + i).onclick = send(true);
    $('#rc' + i).onclick = () => { delete DRAFTS[item.id]; saveDrafts(); box.innerHTML = ''; btn.hidden = false; };
    if (!DRAFTS[item.id]) ta.focus();
  }

  /* ---------- TENDERS ---------- */
  function viewTenders() {
    const searches = ls.get('searches', []);
    const res = ls.get('tenders', { at: 0, list: [] });
    const seen = new Set(ls.get('seen', []));
    $('#main').innerHTML =
      '<div class="card"><h2>Your searches</h2>' + (searches.length ? searches.map((s, i) => '<div class="list-row"><div class="grow"><b>' + esc(s.name) + '</b><div class="muted">' + esc([s.keywords && 'for ' + s.keywords, s.region, s.kind !== 'all' ? (s.kind === 'dps' ? 'DPS only' : 'tenders only') : '', s.minValue ? 'from £' + s.minValue : ''].filter(Boolean).join(' · ')) + '</div></div><button class="btn" data-del="' + i + '" type="button">Remove</button></div>').join('') : '<p class="muted">No searches yet. Add one below, for example the trade you write tenders for.</p>') +
      '<details style="margin-top:10px"' + (searches.length ? '' : ' open') + '><summary class="btn" style="display:flex;align-items:center;list-style:none">Add a search</summary><div style="margin-top:12px">' +
      '<label class="field">Name<input id="tnName" placeholder="Building repairs"></label><label class="field">Keywords (any of, separated by commas)<input id="tnKw" placeholder="repairs, voids, maintenance"></label><label class="field">Leave out<input id="tnEx" placeholder="plumbing"></label><label class="field">Region or town<input id="tnReg" placeholder="Manchester"></label><label class="field">Show<select id="tnKind"><option value="all">Tenders and DPS</option><option value="tender">Tenders only</option><option value="dps">DPS only</option></select></label><button class="btn primary block" id="tnAdd" type="button">Save search</button></div></details></div>' +
      '<label class="field">Look back<select id="tnDays"><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7">7 days</option></select></label><button class="btn primary block" id="tnCheck" type="button" style="margin-bottom:10px">Check for new tenders</button><button class="btn block" id="tnLatest" type="button" style="margin-bottom:12px">Show latest notices (test)</button><p class="muted" id="tnNote" style="margin:0 4px 12px"></p><div id="tnOut"></div>';
    $('#tnOut').innerHTML = res.list.length ? '<p class="muted" style="margin:0 4px 10px">Last checked ' + esc(ago(res.at)) + ' · ' + res.list.length + ' match' + (res.list.length === 1 ? '' : 'es') + '</p>' + res.list.map((n, i) => tenderCard(n, i, seen)).join('') : '';
    $('#tnAdd').onclick = () => { const s = { name: $('#tnName').value.trim() || $('#tnKw').value.trim(), keywords: $('#tnKw').value.trim(), exclude: $('#tnEx').value.trim(), region: $('#tnReg').value.trim(), kind: $('#tnKind').value, minValue: 0, maxValue: 0 }; if (!s.keywords && !s.region) { toast('Add a keyword or a region.'); return; } if (searches.length >= 12) { toast('Up to 12 searches.'); return; } searches.push(s); ls.set('searches', searches); viewTenders(); toast('Saved.'); };
    document.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { searches.splice(Number(b.dataset.del), 1); ls.set('searches', searches); viewTenders(); }; });
    $('#tnCheck').onclick = async () => {
      if (!searches.length) { toast('Save a search first.'); return; }
      const btn = $('#tnCheck'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Looking… this can take up to a minute';
      try {
        const r = await call('tenderSearch', { searches, days: Number($('#tnDays').value) || 1 });
        const prev = new Set(ls.get('seen', []));
        const list = r.notices.map((n) => Object.assign(n, { isNew: !prev.has(n.id) }));
        r.notices.forEach((n) => prev.add(n.id)); ls.set('seen', Array.from(prev).slice(-1500));
        ls.set('tenders', { at: Date.now(), list, notes: r.notes });
        viewTenders();
        const notes = (r.notes || []).join(' ');
        const c = r.counts || {};
        $('#tnNote').textContent = (notes ? notes + ' ' : '') + 'Looked at ' + r.checked + ' notices (Contracts Finder ' + (c.cf || 0) + ', Find a Tender ' + (c.fts || 0) + '); ' + r.notices.length + ' match.' + (r.checked && !r.notices.length ? ' Try broader keywords.' : '');
      } catch (e) { toast(/Unknown action/.test(e.message) ? 'Update your sender code first (see Today).' : e.message); btn.disabled = false; btn.textContent = 'Check for new tenders'; }
    };
    $('#tnLatest').onclick = async () => {
      const btn = $('#tnLatest'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Looking…';
      try {
        const r = await call('tenderSearch', { latest: true });
        ls.set('tenders', { at: Date.now(), list: r.notices.map((n) => Object.assign(n, { isNew: false })), notes: r.notes });
        viewTenders();
        const c = r.counts || {};
        $('#tnNote').textContent = ((r.notes || []).join(' ') + ' The feeds returned ' + r.checked + ' notices from the last day (Contracts Finder ' + (c.cf || 0) + ', Find a Tender ' + (c.fts || 0) + '). Showing the newest.').trim();
      } catch (e) { toast(/Unknown action/.test(e.message) ? 'Update your sender code first (see Today).' : e.message); btn.disabled = false; btn.textContent = 'Show latest notices (test)'; }
    };
    document.querySelectorAll('[data-share]').forEach((b) => { b.onclick = async () => { const n = res.list[Number(b.dataset.share)]; try { if (navigator.share) await navigator.share({ title: n.title, url: n.url }); else { await navigator.clipboard.writeText(n.url); toast('Link copied.'); } } catch (e) { /* cancelled */ } }; });
  }
  function tenderCard(n, i) {
    return '<div class="card item"><h3>' + esc(n.title || 'Untitled') + (n.isNew ? ' <span class="tag ok">New</span>' : '') + (n.type === 'dps' ? ' <span class="tag">DPS</span>' : '') + '</h3><div class="meta">' + esc([n.buyer, n.amount != null ? gbp(n.amount) : '', n.deadline ? 'Closes ' + shortDate(n.deadline) : '', n.location].filter(Boolean).join(' · ')) + '</div>' +
      (n.scope ? '<div class="snip muted">' + esc(n.scope.slice(0, 200)) + (n.scope.length > 200 ? '…' : '') + '</div>' : '') +
      '<div class="row">' + (n.url ? '<a class="btn link-btn" href="' + esc(n.url) + '" target="_blank" rel="noopener">Open notice</a><button class="btn" data-share="' + i + '" type="button">Share</button>' : '') + '</div></div>';
  }

  /* ---------- MORE ---------- */
  function viewMore() {
    const s = ls.get('status') || {};
    const list = accts();
    const all = modeAll();
    $('#main').innerHTML =
      '<div class="card"><h2>Gmail accounts</h2>' + (list.length > 1 ? '<div class="list-row"><div class="grow"><b>All accounts</b><div class="muted">Everything together</div></div><button class="btn' + (all ? ' primary' : '') + '" data-acct="all" type="button">' + (all ? 'Showing' : 'Show') + '</button></div>' : '') +
      list.map((a, i) => '<div class="list-row"><div class="grow"><b>' + esc(a.l) + '</b></div><button class="btn' + (!all && i === curIndex() ? ' primary' : '') + '" data-acct="' + i + '" type="button">' + (!all && i === curIndex() ? 'Showing' : 'Show') + '</button></div>').join('') +
      (list.length < 2 ? '<p class="muted" style="margin:8px 0 0">To add more Gmail accounts, add them in OutpostX on your computer (Sender tab), then copy a new phone link and open it here.</p>' : '') + '</div>' +
      '<button class="btn primary block" id="goLeads" type="button" style="margin-bottom:12px">Find leads</button>' +
      '<div class="card"><h2>Do not contact</h2><p class="muted" style="margin-top:0">Never emailed again, from any of your accounts. One address or @company.com per line.</p><label class="field"><textarea id="dncText" rows="3" placeholder="someone@company.com&#10;@company.com" spellcheck="false"></textarea></label><button class="btn primary block" id="dncGo" type="button">Add to every account</button><p class="muted" id="dncMsg"></p></div>' +
      '<div class="card"><h2>Sent history</h2><div id="histOut"><span class="spin"></span></div></div>' +
      '<div class="card"><h2>Best performing subject lines</h2><div id="perfOut"><span class="spin"></span></div></div>' +
      '<div class="card"><h2>Connected account</h2><p style="margin:0">' + esc(s.account || 'Not checked yet') + '</p>' + (s.sheetUrl ? '<p class="muted"><a href="' + esc(s.sheetUrl) + '" target="_blank" rel="noopener">Open your Google Sheet</a></p>' : '') + '<p class="muted">Sender version ' + esc(s.version || '?') + (s.telegram ? ' · Telegram alerts ' + (s.telegram.chat ? 'on' : 'not set up (Sender tab on your computer)') : '') + '</p></div>' +
      (installEvt ? '<button class="btn primary block" id="inst" type="button" style="margin-bottom:12px">Add OutpostX to my home screen</button>' : '<div class="card"><h2>Install</h2><p class="muted" style="margin:0">In Chrome, open the menu (three dots) and choose <b>Add to Home screen</b> or <b>Install app</b>.</p></div>') +
      '<button class="btn block" id="disc" type="button">Disconnect this phone</button>';
    const i = $('#inst'); if (i) i.onclick = async () => { installEvt.prompt(); installEvt = null; };
    $('#disc').onclick = () => { if (confirm('Disconnect this phone from your sender? Your campaigns are not affected.')) { ['cfg', 'accts', 'mode', 'status', 'allStatus', 'replies', 'allReplies', 'tenders', 'seen', 'pin', 'active', 'leads'].forEach(ls.del); render(); } };
    document.querySelectorAll('[data-acct]').forEach((b) => { b.onclick = () => { if (b.dataset.acct === 'all') { ls.set('mode', 'all'); ['status', 'replies'].forEach(ls.del); } else useAccount(Number(b.dataset.acct)); toast('Switched.'); go('today'); }; });
    $('#goLeads').onclick = () => go('leads');
    $('#dncGo').onclick = async () => {
      const items = $('#dncText').value.split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean);
      if (!items.length) { $('#dncMsg').textContent = 'Type or paste at least one address.'; return; }
      $('#dncGo').disabled = true; $('#dncMsg').textContent = 'Adding…';
      let added = 0, stopped = 0, fails = 0;
      for (let k = 0; k < list.length; k++) { try { const r = await call('dncAdd', { items, reason: 'added by you' }, acctAt(k)); added = Math.max(added, r.added); stopped += r.stopped; } catch (e) { fails++; } }
      $('#dncText').value = ''; $('#dncGo').disabled = false;
      $('#dncMsg').textContent = fails === list.length ? 'Could not add. Update your sender code first.' : 'Added ' + added + '. ' + (stopped ? stopped + ' waiting email(s) stopped. ' : '') + (fails ? fails + ' account(s) could not be reached.' : '');
    };
    moreHistory(); morePerf();
  }
  async function moreHistory() {
    const idx = modeAll() ? accts().map((_, k) => k) : [curIndex()];
    try {
      const hs = await Promise.all(idx.map((k) => call('history', {}, acctAt(k))));
      const days = {}, months = {};
      hs.forEach((h) => { (h.days || []).forEach((d) => { days[d.d] = (days[d.d] || 0) + d.n; }); (h.months || []).forEach((m) => { months[m.m] = (months[m.m] || 0) + m.n; }); });
      const dk = Object.keys(days).sort().reverse().slice(0, 14), mk = Object.keys(months).sort().reverse();
      const mn = (m) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }); };
      const el = $('#histOut'); if (!el) return;
      el.innerHTML = !dk.length && !mk.length ? '<p class="muted" style="margin:0">Nothing counted yet. It fills in as emails go out.</p>' :
        mk.map((m) => '<div class="list-row"><div class="grow"><b>' + esc(mn(m)) + '</b></div><b>' + months[m] + '</b></div>').join('') + '<p class="muted" style="margin:10px 0 4px">Last days</p>' +
        dk.map((d) => '<div class="list-row"><div class="grow">' + esc(new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })) + '</div><b>' + days[d] + '</b></div>').join('') +
        '<div class="row" style="margin-top:10px"><button class="btn" id="histClr" type="button">Clear the daily list</button></div>';
      const c = $('#histClr'); if (c) c.onclick = async () => { if (!confirm('Clear the daily list? Monthly totals stay.')) return; try { for (const k of idx) await call('clearHistory', { what: 'days' }, acctAt(k)); toast('Cleared.'); } catch (e) { toast(e.message); } moreHistory(); };
    } catch (e) { const el = $('#histOut'); if (el) el.innerHTML = '<p class="muted" style="margin:0">' + esc(/Unknown action/.test(e.message) ? 'Update your sender code to see this.' : e.message) + '</p>'; }
  }
  async function morePerf() {
    try {
      const d = await call('performance');
      const el = $('#perfOut'); if (!el) return;
      el.innerHTML = d.rows.length ? d.rows.slice(0, 8).map((r) => '<div class="list-row"><div class="grow"><b>' + esc(r.subject) + '</b><div class="muted">' + r.sent + ' sent · ' + r.replied + ' replies' + (r.enough ? '' : ' (few so far)') + '</div></div><b>' + r.rate + '%</b></div>').join('') : '<p class="muted" style="margin:0">Nothing to compare yet.</p>';
    } catch (e) { const el = $('#perfOut'); if (el) el.innerHTML = '<p class="muted" style="margin:0">' + esc(/Unknown action/.test(e.message) ? 'Update your sender code to see this.' : e.message) + '</p>'; }
  }

  /* ---------- FIND LEADS ---------- */
  let LD = ls.get('leads', { list: [], note: '' });
  const saveLd = () => ls.set('leads', LD);
  async function viewLeads() {
    const idx = modeAll() ? accts().map((_, k) => k) : [curIndex()];
    let camps = [];
    try { const r = await Promise.all(idx.map((k) => call('status', {}, acctAt(k)).then((s) => (s.campaigns || []).filter((c) => c.status !== 'done').map((c) => ({ id: c.id, name: c.name, k }))).catch(() => []))); camps = [].concat.apply([], r); } catch (e) { camps = []; }
    $('#main').innerHTML =
      '<button class="btn" id="back" type="button" style="margin-bottom:12px">← More</button>' +
      '<div class="card"><h2>Companies that won contracts</h2><p class="muted" style="margin-top:0">Winners of recent UK public contracts often list a contact email. Search by the kind of work.</p>' +
      '<label class="field">Keywords (any of, separated by commas)<input id="ldKw" placeholder="repairs, roofing, electrical"></label><label class="field">Leave out<input id="ldEx" placeholder="software"></label>' +
      '<label class="field">Look back<select id="ldDays"><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label><button class="btn primary block" id="ldGo" type="button">Search</button></div>' +
      '<div class="card"><h2>Find emails from websites</h2><p class="muted" style="margin-top:0">Paste up to 8 website addresses. Your sender reads their contact pages and picks out the email.</p><label class="field"><textarea id="ldUrls" rows="3" placeholder="brightsmiles.com&#10;acmeroofing.co.uk" spellcheck="false"></textarea></label><button class="btn block" id="ldSites" type="button">Find emails</button></div>' +
      '<p class="muted" id="ldNote" style="margin:0 4px 12px">' + esc(LD.note || '') + '</p><div id="ldOut"></div>' +
      '<div class="card" id="ldAddCard" hidden><h2>Add the ticked people to a campaign</h2>' + (camps.length ? '<label class="field">Campaign<select id="ldCamp">' + camps.map((c, n) => '<option value="' + n + '">' + (modeAll() ? esc(acctName(c.k)) + ' · ' : '') + esc(c.name) + '</option>').join('') + '</select></label><button class="btn primary block" id="ldAdd" type="button">Add to campaign</button>' : '<p class="muted" style="margin:0">Create a campaign in OutpostX on your computer first. Then you can add leads to it from here.</p>') + '<p class="muted" id="ldMsg"></p></div>';
    $('#back').onclick = () => go('more');
    const paint = () => {
      const l = LD.list;
      $('#ldOut').innerHTML = l.map((x, i) => '<div class="card item"><label class="row" style="align-items:flex-start"><input type="checkbox" data-pick="' + i + '"' + (x.pick ? ' checked' : '') + (x.email ? '' : ' disabled') + ' style="margin-top:4px"><div class="grow"><h3>' + esc(x.name || x.url || x.email) + '</h3><div class="meta">' + esc(x.email || 'No email yet') + (x.location ? ' · ' + esc(x.location) : '') + '</div>' + (x.about ? '<div class="snip muted">' + esc(x.about.slice(0, 120)) + '</div>' : '') + (x.note ? '<div class="meta">' + esc(x.note) + '</div>' : '') + (!x.email && x.website ? '<div class="meta">Website: ' + esc(x.website) + '</div>' : '') + '</div></label></div>').join('');
      $('#ldAddCard').hidden = !l.some((x) => x.email);
      document.querySelectorAll('[data-pick]').forEach((c) => { c.onchange = () => { l[Number(c.dataset.pick)].pick = c.checked; saveLd(); }; });
    };
    paint();
    const wait = (btn, t) => { btn.disabled = true; btn.dataset.t = btn.textContent; btn.innerHTML = '<span class="spin"></span> ' + t; };
    const free = (btn) => { btn.disabled = false; btn.textContent = btn.dataset.t; };
    const ck = (e) => toast(/Unknown action/.test(e.message) ? 'Update your sender code first (see Today).' : e.message);
    $('#ldGo').onclick = async () => {
      const kw = $('#ldKw').value.trim(); if (!kw) { toast('Add at least one keyword.'); return; }
      wait($('#ldGo'), 'Searching… up to a minute');
      try {
        const r = await call('leadSearch', { kind: 'awarded', keywords: kw, exclude: $('#ldEx').value.trim(), days: Number($('#ldDays').value) || 7 });
        LD.list = r.leads.map((x) => Object.assign(x, { pick: !!x.email })); LD.note = ((r.notes || []).join(' ') + ' Looked at ' + r.checked + ' awards; ' + r.leads.length + ' companies, ' + r.withEmail + ' with an email.').trim(); saveLd(); viewLeads();
      } catch (e) { ck(e); free($('#ldGo')); }
    };
    $('#ldSites').onclick = async () => {
      const u = $('#ldUrls').value.trim(); if (!u) { toast('Paste at least one website.'); return; }
      wait($('#ldSites'), 'Reading sites…');
      try {
        const r = await call('leadSearch', { kind: 'sites', urls: u });
        LD.list = r.leads.map((x) => ({ name: x.name || x.url, email: x.email, website: x.url, note: x.note, pick: !!x.email })); LD.note = 'Checked ' + r.checked + ' website(s); ' + r.leads.filter((x) => x.email).length + ' email(s) found.'; saveLd(); viewLeads();
      } catch (e) { ck(e); free($('#ldSites')); }
    };
    const add = $('#ldAdd');
    if (add) add.onclick = async () => {
      const chosen = LD.list.filter((x) => x.pick && x.email);
      if (!chosen.length) { $('#ldMsg').textContent = 'Tick at least one person.'; return; }
      const c = camps[Number($('#ldCamp').value)];
      add.disabled = true; $('#ldMsg').textContent = 'Adding…';
      try {
        const r = await call('addRecipients', { campaignId: c.id, recipients: chosen.map((x) => ({ email: x.email, company: x.name, name: x.contact || '' })) }, acctAt(c.k));
        const q = r.result || {};
        $('#ldMsg').textContent = 'Added ' + (q.added || 0) + '.' + (q.duplicates ? ' ' + q.duplicates + ' already in a campaign.' : '') + (q.optouts ? ' ' + q.optouts + ' on your do-not-contact list.' : '') + (q.sameCompany ? ' ' + q.sameCompany + ' at a business already contacted.' : '') + (q.invalid ? ' ' + q.invalid + ' invalid.' : '');
        LD.list = LD.list.filter((x) => !(x.pick && x.email)); saveLd(); ls.del('status'); ls.del('allStatus'); paint();
      } catch (e) { $('#ldMsg').textContent = e.message; }
      add.disabled = false;
    };
  }

  /* ---------- PIN lock ---------- */
  const RELOCK_MS = 3 * 60 * 1000;
  const b64d = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const b64e = (u8) => btoa(String.fromCharCode.apply(null, u8));
  function touch() { ls.set('active', Date.now()); }
  function pinLocked() { return !!ls.get('pin') && !!ls.get('cfg') && (Date.now() - (ls.get('active') || 0) > RELOCK_MS); }
  function takePin(s) {
    // remember the newest PIN fingerprint the sender reports (a changed or removed PIN takes effect here)
    if (!s || !('phonePin' in s)) return;
    const old = ls.get('pin');
    if (s.phonePin) { if (!old || old.hash !== s.phonePin.hash) { ls.set('pin', s.phonePin); if (old) ls.del('active'); } } else ls.del('pin');
  }
  async function checkPin(pin) {
    const p = ls.get('pin'); if (!p) return true;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(p.salt), iterations: p.iter || 150000 }, key, 256));
    return b64e(bits) === p.hash;
  }
  function showLock(note) {
    let o = $('#lock');
    if (!o) { o = document.createElement('div'); o.id = 'lock'; document.body.appendChild(o); }
    o.innerHTML = '<div class="lockbox"><img src="icons/icon-192.png" alt="" width="72" height="72"><h2>OutpostX</h2><p>Enter your PIN</p>' +
      '<input id="lockIn" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><div class="lockmsg" id="lockMsg" role="status">' + esc(note || '') + '</div>' +
      '<button class="btn primary" id="lockGo" type="button">Unlock</button><button class="linkbtn" id="lockForgot" type="button">Forgot PIN?</button></div>';
    const msg = $('#lockMsg');
    const tryIt = async () => {
      const v = $('#lockIn').value.trim(); if (!v) return;
      let ok = false; try { ok = await checkPin(v); } catch (e) { ok = false; }
      if (ok) { touch(); o.remove(); render(); } else { msg.textContent = 'That PIN is not right.'; $('#lockIn').value = ''; }
    };
    $('#lockGo').onclick = tryIt;
    $('#lockIn').onkeydown = (e) => { if (e.key === 'Enter') tryIt(); };
    $('#lockForgot').onclick = async () => {
      msg.textContent = 'Checking your sender for the latest PIN…';
      try { const s = await call('status'); takePin(s); msg.textContent = ls.get('pin') ? 'If you changed your PIN on your computer, type the new one now. To set a new one: open OutpostX on your computer, Settings, Phone app PIN.' : 'No PIN is set now.'; if (!ls.get('pin')) { o.remove(); render(); } }
      catch (e) { msg.textContent = e.message; }
    };
    setTimeout(() => { const i = $('#lockIn'); if (i) i.focus(); }, 50);
  }
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (!$('#lock') && ls.get('pin')) touch(); }, true));

  /* ---------- shell ---------- */
  function go(t) { tab = t; ls.set('tab', t); render(); window.scrollTo(0, 0); }
  function render() {
    $('#pageTitle').textContent = TITLES[tab] || 'OutpostX';
    document.querySelectorAll('#tabs button').forEach((b) => { if (b.dataset.tab === tab || (tab === 'leads' && b.dataset.tab === 'more')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (!ls.get('cfg')) { $('#pageTitle').textContent = 'OutpostX'; viewSetup(); return; }
    if (pinLocked()) { showLock(); return; }
    if (ls.get('pin') && !ls.get('active')) touch();
    ({ today: viewToday, campaigns: viewCampaigns, replies: viewReplies, tenders: viewTenders, more: viewMore, leads: viewLeads }[tab] || viewToday)();
  }
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => go(b.dataset.tab); });
  $('#refresh').onclick = () => { if (busy) return; render(); toast('Refreshing…'); };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
  window.addEventListener('hashchange', () => { if (readConnectLink()) render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ls.get('cfg') && (tab === 'today' || tab === 'replies' || pinLocked())) render(); });
  readConnectLink();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { /* app still works */ });
  render();
})();
