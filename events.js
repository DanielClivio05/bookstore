// Events admin — edits what appears on the Book Nook Lane website.
// No poster generator: this page is purely the content editor for the public site.

import { requireAuth } from './auth.js'
import { supabase } from './supabase.js'

await requireAuth()

const toast            = document.getElementById('toast')
const form             = document.getElementById('event-form')
const saveBtn          = document.getElementById('save-btn')
const resetFormBtn     = document.getElementById('reset-form-btn')
const formSectionLabel = document.getElementById('form-section-label')
const upcomingEl       = document.getElementById('upcoming-events')
const pastEl           = document.getElementById('past-events')
const pastBlock        = document.getElementById('past-events-block')
const setupNotice      = document.getElementById('setup-notice')

const FIELDS = {
  id       : document.getElementById('event-id'),
  name     : document.getElementById('event-name'),
  date     : document.getElementById('event-date'),
  time     : document.getElementById('event-time'),
  location : document.getElementById('event-location'),
  tagline  : document.getElementById('event-tagline'),
  age      : document.getElementById('event-age'),
  details  : document.getElementById('event-details'),
  price    : document.getElementById('event-price'),
  capacity : document.getElementById('event-capacity'),
  contact  : document.getElementById('event-contact'),
  published: document.getElementById('event-published'),
  open     : document.getElementById('event-open'),
}

let allEvents = []


// ===== LOAD & RENDER =====

async function loadEvents () {
  const { data, error } = await supabase
    .from('events').select('*').order('date', { ascending: true })

  if (error) {
    if (isMissingSchema(error)) {
      setupNotice.hidden = false
      upcomingEl.innerHTML = emptyBlock('Run the one-time setup above to start saving events.')
    } else {
      showToast('Could not load events', true)
    }
    return
  }

  allEvents = data || []
  renderEventList()
}

function renderEventList () {
  const today    = new Date().toISOString().slice(0, 10)
  const upcoming = allEvents.filter(ev => ev.date >= today)
  const past     = allEvents.filter(ev => ev.date <  today).reverse()

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map(ev => eventCard(ev)).join('')
    : emptyBlock('No upcoming events — create one below', '📅')

  pastBlock.hidden = past.length === 0
  pastEl.innerHTML = past.map(ev => eventCard(ev, true)).join('')
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function eventCard (ev, isPast = false) {
  const e = escapeHtml
  const [y, m, d] = ev.date.split('-')

  const meta  = [displayTime(ev.time), ev.location].filter(Boolean).join(' · ')
  const extra = [
    ev.age_range ? `Ages ${ev.age_range}` : null,
    ev.price != null ? `€${Number(ev.price).toFixed(2).replace(/\.00$/, '')} each` : 'Free',
  ].filter(Boolean).join(' · ')

  const badge = ev.published
    ? '<span class="ev-badge live">Live</span>'
    : '<span class="ev-badge draft">Draft</span>'

  const closed = ev.published && ev.signups_open === false
    ? '<span class="ev-badge draft">Sign-ups closed</span>'
    : ''

  return `
    <div class="event-card${isPast ? ' past' : ''}">
      <div class="event-card-date">
        <span class="event-card-day">${parseInt(d, 10)}</span>
        <span class="event-card-month">${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}</span>
      </div>
      <div class="event-card-info">
        <div class="event-card-name">${e(ev.name)}${badge}${closed}</div>
        <div class="event-card-meta">${e(meta)}</div>
        ${extra ? `<div class="ev-extra">${e(extra)}</div>` : ''}
        ${bookedBar(ev)}
      </div>
      <div class="event-card-actions">
        <button class="btn-icon" onclick="togglePublish('${ev.id}')"
          title="${ev.published ? 'Take off the website' : 'Put on the website'}">
          ${ev.published ? '👁 Unpublish' : '🌐 Publish'}
        </button>
        <button class="btn-icon" onclick="editEvent('${ev.id}')" title="Edit">✏️</button>
        <button class="btn-icon danger" onclick="deleteEvent('${ev.id}')" title="Delete">🗑️</button>
      </div>
    </div>`
}


// How full is this session? A bar when there's a limit, a plain count when
// there isn't. spots_taken is kept up to date by the database itself.
function bookedBar (ev) {
  const taken = ev.spots_taken || 0

  if (ev.capacity == null) {
    return taken
      ? `<div class="ev-extra">${taken} booked · no limit set</div>`
      : ''
  }

  const pct  = Math.min(100, Math.round((taken / ev.capacity) * 100))
  const full = taken >= ev.capacity
  const low  = !full && ev.capacity - taken <= 3

  return `
    <div class="cap-wrap">
      <div class="cap-bar"><span class="cap-fill${full ? ' full' : low ? ' low' : ''}"
        style="width:${pct}%"></span></div>
      <span class="cap-text${full ? ' full' : ''}">${taken} / ${ev.capacity}${
        full ? ' · full' : ` · ${ev.capacity - taken} left`}</span>
    </div>`
}


// ===== ROW ACTIONS =====

window.editEvent = id => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return
  fillForm(ev)
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.togglePublish = async id => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return

  const next = !ev.published
  const { error } = await supabase.from('events').update({ published: next }).eq('id', id)
  if (error) { showToast('Could not change that', true); return }

  showToast(next ? `"${ev.name}" is now on the website` : `"${ev.name}" taken off the website`)
  if (FIELDS.id.value === id) FIELDS.published.checked = next
  loadEvents()
}

window.deleteEvent = async id => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return
  if (!confirm(`Delete "${ev.name}"? This cannot be undone.`)) return

  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) { showToast('Could not delete that', true); return }

  showToast(`"${ev.name}" deleted`)
  if (FIELDS.id.value === id) resetForm()
  loadEvents()
}


// ===== FORM =====

function fillForm (ev) {
  FIELDS.id.value        = ev.id
  FIELDS.name.value      = ev.name       || ''
  FIELDS.date.value      = ev.date       || ''
  FIELDS.time.value      = ev.time       || ''
  FIELDS.location.value  = ev.location   || ''
  FIELDS.tagline.value   = ev.tagline    || ''
  FIELDS.age.value       = ev.age_range  || ''
  FIELDS.details.value   = ev.details    || ''
  FIELDS.price.value     = ev.price    == null ? '' : ev.price
  FIELDS.capacity.value  = ev.capacity == null ? '' : ev.capacity
  FIELDS.contact.value   = ev.contact    || ''
  FIELDS.published.checked = !!ev.published
  FIELDS.open.checked      = ev.signups_open !== false

  formSectionLabel.textContent = `Editing: ${ev.name}`
  saveBtn.textContent = 'Save changes'
  resetFormBtn.hidden = false
}

function resetForm () {
  form.reset()
  FIELDS.id.value = ''
  FIELDS.published.checked = false
  FIELDS.open.checked      = true
  formSectionLabel.textContent = 'New event'
  saveBtn.textContent = 'Save event'
  resetFormBtn.hidden = true
}

resetFormBtn.addEventListener('click', resetForm)

form.addEventListener('submit', async e => {
  e.preventDefault()

  const raw = {
    name     : FIELDS.name.value.trim(),
    date     : FIELDS.date.value,
    time     : FIELDS.time.value.trim(),
    location : FIELDS.location.value.trim(),
    tagline  : FIELDS.tagline.value.trim(),
    age      : FIELDS.age.value.trim(),
    details  : FIELDS.details.value.trim(),
    price    : FIELDS.price.value.trim(),
    capacity : FIELDS.capacity.value.trim(),
    contact  : FIELDS.contact.value.trim(),
    published: FIELDS.published.checked,
    open     : FIELDS.open.checked,
  }

  if (!validate(raw)) return

  const payload = {
    name        : raw.name,
    date        : raw.date,
    time        : parseTimeTo24h(raw.time) || raw.time,
    location    : raw.location,
    tagline     : raw.tagline  || null,
    age_range   : raw.age      || null,
    details     : raw.details  || null,
    price       : raw.price    === '' ? null : Number(raw.price),
    capacity    : raw.capacity === '' ? null : Number(raw.capacity),
    contact     : raw.contact  || null,
    published   : raw.published,
    signups_open: raw.open,
  }

  const editingId = FIELDS.id.value
  saveBtn.disabled = true

  const { error } = editingId
    ? await supabase.from('events').update(payload).eq('id', editingId)
    : await supabase.from('events').insert([payload])

  saveBtn.disabled = false

  if (error) {
    if (isMissingSchema(error)) {
      setupNotice.hidden = false
      setupNotice.scrollIntoView({ behavior: 'smooth', block: 'start' })
      showToast('Database not set up — see the note at the top', true)
    } else {
      showToast('Could not save the event', true)
    }
    return
  }

  showToast(
    editingId ? 'Changes saved' :
    raw.published ? 'Event saved and published' : 'Event saved as a draft'
  )
  if (!editingId) resetForm()
  loadEvents()
})

function validate (d) {
  const required = [
    [d.name,     FIELDS.name,     'Event name is required'],
    [d.date,     FIELDS.date,     'Date is required'],
    [d.time,     FIELDS.time,     'Time is required'],
    [d.location, FIELDS.location, 'Location is required'],
  ]
  for (const [value, el, msg] of required) {
    if (!value) { showToast(msg, true); el.focus(); return false }
  }

  if (d.price !== '') {
    const p = Number(d.price)
    if (!Number.isFinite(p) || p < 0 || p > 999) {
      showToast('Price should be a number between 0 and 999', true)
      FIELDS.price.focus()
      return false
    }
  }

  if (d.capacity !== '') {
    const c = Number(d.capacity)
    if (!Number.isInteger(c) || c < 1 || c > 500) {
      showToast('Places should be a whole number between 1 and 500', true)
      FIELDS.capacity.focus()
      return false
    }
    // Nothing in the database stops her setting places below the number
    // already booked — it just wouldn't mean anything. Catch it here.
    const ev = allEvents.find(x => x.id === FIELDS.id.value)
    if (ev && (ev.spots_taken || 0) > c) {
      showToast(`${ev.spots_taken} people are already booked — places can't go below that`, true)
      FIELDS.capacity.focus()
      return false
    }
  }

  return true
}


// ===== HELPERS =====

function isMissingSchema (error) {
  return /does not exist|42P01|42703|schema cache/i.test(error?.message || '')
}

function emptyBlock (msg, icon) {
  return `<div class="empty" style="padding:24px">${
    icon ? `<div class="empty-icon">${icon}</div>` : ''
  }<p>${escapeHtml(msg)}</p></div>`
}

function showToast (msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayTime (time) {
  return time ? (parseTimeTo24h(time) || time) : ''
}

// Turns freeform time into 24-hour "HH:MM".
// Handles "3pm", "3:30pm", "15:00", "9:30", "10.30", "dalle 17", "ore 10".
// Returns null when nothing matches, so callers can fall back to the raw text.
function parseTimeTo24h (input) {
  if (!input) return null
  const s = input.trim()

  const pad = (h, m) =>
    (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      : null

  // Italian: "dalle 17", "ore 10:30"
  let match = s.match(/^(?:dalle|ore)\s+(\d{1,2})(?::(\d{2}))?$/i)
  if (match) return pad(+match[1], match[2] ? +match[2] : 0)

  // Dot separator: "10.30"
  match = s.match(/^(\d{1,2})\.(\d{2})$/)
  if (match) return pad(+match[1], +match[2])

  // AM/PM: "3pm", "3:30 p.m."
  match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (match) {
    let h = +match[1]
    const period = match[3].toLowerCase()
    if (period === 'p' && h !== 12) h += 12
    if (period === 'a' && h === 12) h = 0
    return pad(h, match[2] ? +match[2] : 0)
  }

  // 24-hour: "15:00"
  match = s.match(/^(\d{1,2}):(\d{2})$/)
  if (match) return pad(+match[1], +match[2])

  // Bare hour: "15"
  match = s.match(/^(\d{1,2})$/)
  if (match) return pad(+match[1], 0)

  return null
}


loadEvents()
