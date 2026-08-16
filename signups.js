// Sign-ups — who is coming to what, laid out on a calendar.
//
// The three tables are fetched separately and joined here rather than asking
// PostgREST to embed them. There are only ever a few hundred rows, and it
// means the page doesn't depend on how the foreign keys are named.

import { requireAuth } from './auth.js'
import { supabase } from './supabase.js'

await requireAuth()

const toast       = document.getElementById('toast')
const calEl       = document.getElementById('cal')
const calTitle    = document.getElementById('cal-title')
const panelEl     = document.getElementById('day-panel')
const summaryEl   = document.getElementById('summary')
const setupNotice = document.getElementById('setup-notice')

const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

let events   = []          // all events
let bookings = []          // signups rows
let items    = []          // signup_items rows
let byId     = new Map()   // signup id -> signup row

let cursor   = startOfMonth(new Date())   // which month the calendar shows
let selected = null                        // 'YYYY-MM-DD' or null


// ===== LOAD =====

async function loadAll () {
  const [ev, sg, it] = await Promise.all([
    supabase.from('events').select('*').order('date', { ascending: true }),
    supabase.from('signups').select('*').order('created_at', { ascending: false }),
    supabase.from('signup_items').select('*'),
  ])

  const bad = [ev, sg, it].find(r => r.error)
  if (bad) {
    if (isMissingSchema(bad.error)) {
      setupNotice.hidden = false
      calEl.innerHTML = emptyBlock('Run the one-time setup above to start taking sign-ups.')
    } else {
      showToast('Could not load sign-ups', true)
    }
    return
  }

  events   = ev.data || []
  bookings = sg.data || []
  items    = it.data || []
  byId     = new Map(bookings.map(b => [b.id, b]))

  render()
}


// ===== DERIVED =====

const eventById = () => new Map(events.map(e => [e.id, e]))

// Confirmed lines for one event, newest booking first.
function linesFor (eventId) {
  return items
    .filter(i => i.event_id === eventId)
    .map(i => ({ ...i, booking: byId.get(i.signup_id) }))
    .filter(i => i.booking)
    .sort((a, b) => (b.booking.created_at || '').localeCompare(a.booking.created_at || ''))
}

function eventsOn (iso) {
  return events.filter(e => e.date === iso)
}

function dueFor (line) {
  return (Number(line.unit_price) || 0) * (line.participants || 0)
}


// ===== RENDER =====

function render () {
  renderSummary()
  renderCalendar()
  renderPanel()
}

function renderSummary () {
  const today   = isoOf(new Date())
  const upcoming = events.filter(e => e.date >= today).map(e => e.id)

  const live = items.filter(i => i.status === 'confirmed' && upcoming.includes(i.event_id))
  const people = live.reduce((n, i) => n + (i.participants || 0), 0)
  const owed   = live.filter(i => !i.paid).reduce((n, i) => n + dueFor(i), 0)

  const unseenIds = new Set(
    live.map(i => i.signup_id).filter(id => byId.get(id) && !byId.get(id).seen)
  )

  summaryEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">People booked</div>
      <div class="stat-value">${people}</div>
      <div class="stat-sub">across ${upcoming.length} upcoming event${upcoming.length === 1 ? '' : 's'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Bookings</div>
      <div class="stat-value">${new Set(live.map(i => i.signup_id)).size}</div>
      <div class="stat-sub">${unseenIds.size ? `${unseenIds.size} you haven't opened yet` : 'all seen'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Still to collect</div>
      <div class="stat-value">${euro(owed)}</div>
      <div class="stat-sub">paid on the day of each session</div>
    </div>`
}

function renderCalendar () {
  calTitle.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`

  const first = new Date(cursor)
  const lead  = (first.getDay() + 6) % 7          // Monday-first offset
  const start = new Date(first); start.setDate(1 - lead)

  const today = isoOf(new Date())
  const cells = []

  for (let n = 0; n < 42; n++) {
    const d   = new Date(start); d.setDate(start.getDate() + n)
    const iso = isoOf(d)
    const out = d.getMonth() !== cursor.getMonth()
    const on  = eventsOn(iso)

    const chips = on.map(ev => {
      const lines = linesFor(ev.id).filter(l => l.status === 'confirmed')
      const heads = lines.reduce((n2, l) => n2 + (l.participants || 0), 0)
      const unseen = lines.some(l => l.booking && !l.booking.seen)
      const full = ev.capacity != null && heads >= ev.capacity
      return `<span class="chip-ev${full ? ' full' : ''}${ev.published ? '' : ' draft'}"
                title="${esc(ev.name)}">
                <b>${heads}</b> ${esc(ev.name)}${unseen ? '<i class="dot"></i>' : ''}
              </span>`
    }).join('')

    cells.push(`
      <button class="cal-day${out ? ' out' : ''}${iso === today ? ' today' : ''}${
        iso === selected ? ' sel' : ''}${on.length ? ' has' : ''}"
        data-day="${iso}"${on.length ? '' : ' disabled'}>
        <span class="cal-num">${d.getDate()}</span>
        ${chips}
      </button>`)
  }

  calEl.innerHTML =
    DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('') + cells.join('')

  calEl.querySelectorAll('[data-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.day === selected ? null : btn.dataset.day
      render()
      if (selected) {
        markSeenFor(selected)
        panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })
}

function renderPanel () {
  if (!selected) { panelEl.innerHTML = ''; return }

  const on = eventsOn(selected)
  if (!on.length) { panelEl.innerHTML = ''; return }

  panelEl.innerHTML = `
    <div class="day-head">
      <div class="section-title" style="margin:0;border:0;padding:0">${esc(longDate(selected))}</div>
      <button class="btn-secondary" onclick="window.print()">🖨 Print register</button>
    </div>
    ${on.map(registerFor).join('')}`
}

function registerFor (ev) {
  const lines  = linesFor(ev.id)
  const live   = lines.filter(l => l.status === 'confirmed')
  const heads  = live.reduce((n, l) => n + (l.participants || 0), 0)
  const owed   = live.filter(l => !l.paid).reduce((n, l) => n + dueFor(l), 0)
  const taken  = live.filter(l =>  l.paid).reduce((n, l) => n + dueFor(l), 0)

  const rows = lines.map(l => {
    const b   = l.booking
    const off = l.status === 'cancelled'
    return `
      <tr class="${off ? 'cancelled' : ''}${b.seen ? '' : ' fresh'}">
        <td>
          <div class="td-title">${esc(b.full_name)}${
            b.first_visit ? '<span class="tag">first visit</span>' : ''}${
            b.seen ? '' : '<span class="tag new">new</span>'}</div>
          <div class="td-author">${esc(b.school || '')}</div>
        </td>
        <td>
          <div><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></div>
          <div class="td-author"><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>
        </td>
        <td>${esc(b.child_age || '')}</td>
        <td class="td-qty">${l.participants}</td>
        <td>${l.unit_price == null ? '—' : euro(dueFor(l))}</td>
        <td>
          <label class="paid-box">
            <input type="checkbox" ${l.paid ? 'checked' : ''} ${off ? 'disabled' : ''}
              onchange="togglePaid('${l.id}', this.checked)">
            <span>${l.paid ? 'Paid' : 'Not yet'}</span>
          </label>
        </td>
        <td>
          <div class="row-actions">
            <button class="btn-icon" onclick="toggleCancel('${l.id}', ${off})"
              title="${off ? 'Put this booking back' : 'Cancel this booking'}">${off ? '↩︎' : '✕'}</button>
            <button class="btn-icon danger" onclick="removeBooking('${b.id}', '${esc(b.full_name)}')"
              title="Delete the whole booking">🗑️</button>
          </div>
        </td>
      </tr>`
  }).join('')

  return `
    <div class="reg">
      <div class="reg-head">
        <div>
          <div class="reg-name">${esc(ev.name)}${
            ev.published ? '' : '<span class="ev-badge draft">Draft</span>'}</div>
          <div class="reg-meta">${esc([ev.time, ev.location].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="reg-nums">
          <div><span>${heads}</span>${ev.capacity != null ? ` / ${ev.capacity}` : ''} people</div>
          <div class="${owed ? 'owed' : 'clear'}">${owed ? euro(owed) + ' to collect' : 'all paid'}</div>
          ${taken ? `<div class="clear">${euro(taken)} taken</div>` : ''}
        </div>
        <button class="btn-icon" onclick="exportCsv('${ev.id}')" title="Download as a spreadsheet">⬇ CSV</button>
      </div>
      ${lines.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Name / school</th><th>Contact</th><th>Age</th>
            <th>People</th><th>Due</th><th>Paid</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : emptyBlock('Nobody has booked this one yet', '🪑')}
    </div>`
}


// ===== ACTIONS =====

window.togglePaid = async (itemId, paid) => {
  const { error } = await supabase.from('signup_items')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq('id', itemId)

  if (error) { showToast('Could not save that', true); return }

  const it = items.find(i => i.id === itemId)
  if (it) { it.paid = paid; it.paid_at = paid ? new Date().toISOString() : null }
  showToast(paid ? 'Marked as paid' : 'Marked as not paid')
  render()
}

window.toggleCancel = async (itemId, wasCancelled) => {
  const next = wasCancelled ? 'confirmed' : 'cancelled'
  const it   = items.find(i => i.id === itemId)
  const who  = it && byId.get(it.signup_id)

  if (!wasCancelled && !confirm(
        `Cancel ${who ? who.full_name + "'s" : 'this'} place? It frees the seat back up.`)) return

  const { error } = await supabase.from('signup_items').update({ status: next }).eq('id', itemId)
  if (error) { showToast('Could not change that', true); return }

  showToast(wasCancelled ? 'Booking restored' : 'Booking cancelled')
  loadAll()          // spots_taken has moved, so pull everything again
}

window.removeBooking = async (signupId, name) => {
  if (!confirm(`Delete ${name}'s booking entirely? This cannot be undone.`)) return

  const { error } = await supabase.from('signups').delete().eq('id', signupId)
  if (error) { showToast('Could not delete that', true); return }

  showToast('Booking deleted')
  loadAll()
}

// Opening a day counts as having read its bookings.
async function markSeenFor (iso) {
  const ids = eventsOn(iso).flatMap(ev => linesFor(ev.id).map(l => l.signup_id))
  const unseen = [...new Set(ids)].filter(id => byId.get(id) && !byId.get(id).seen)
  if (!unseen.length) return

  await supabase.from('signups').update({ seen: true }).in('id', unseen)
  unseen.forEach(id => { byId.get(id).seen = true })
  renderSummary()
  renderCalendar()
}

window.exportCsv = eventId => {
  const ev    = eventById().get(eventId)
  const lines = linesFor(eventId)

  const head = ['Name','Email','Phone','Child age','School','First visit','People','Due','Paid','Status','Booked on']
  const body = lines.map(l => {
    const b = l.booking
    return [
      b.full_name, b.email, b.phone, b.child_age, b.school,
      b.first_visit ? 'Yes' : 'No',
      l.participants,
      l.unit_price == null ? '' : dueFor(l).toFixed(2),
      l.paid ? 'Yes' : 'No',
      l.status,
      (b.created_at || '').slice(0, 16).replace('T', ' '),
    ]
  })

  const csv = [head, ...body]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')

  // BOM so Excel opens accented names correctly
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const a   = document.createElement('a')
  a.href = url
  a.download = `${slug(ev ? ev.name : 'signups')}-${ev ? ev.date : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}


// ===== MONTH NAVIGATION =====

document.getElementById('prev-month').addEventListener('click', () => {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); render()
})
document.getElementById('next-month').addEventListener('click', () => {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); render()
})
document.getElementById('today-btn').addEventListener('click', () => {
  cursor = startOfMonth(new Date()); selected = isoOf(new Date()); render()
})


// ===== HELPERS =====

function startOfMonth (d) { return new Date(d.getFullYear(), d.getMonth(), 1) }

// Local date as YYYY-MM-DD. toISOString() would shift the day for anyone
// east of Greenwich, which is where the shop is.
function isoOf (d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
    String(d.getDate()).padStart(2, '0')}`
}

function longDate (iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS[(dt.getDay() + 6) % 7]} ${d} ${MONTHS[m - 1]} ${y}`
}

function euro (n) {
  return '€' + Number(n || 0).toFixed(2).replace(/\.00$/, '')
}

function slug (s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'signups'
}

function isMissingSchema (error) {
  return /does not exist|42P01|42703|schema cache/i.test(error?.message || '')
}

function emptyBlock (msg, icon) {
  return `<div class="empty" style="padding:24px">${
    icon ? `<div class="empty-icon">${icon}</div>` : ''
  }<p>${esc(msg)}</p></div>`
}

function showToast (msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

function esc (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}


loadAll()
