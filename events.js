import { supabase } from './supabase.js'

const toast              = document.getElementById('toast')
const templateCards      = document.querySelectorAll('.template-card')
const generateBtn        = document.getElementById('generate-btn')
const form               = document.getElementById('event-form')
const previewWrap        = document.getElementById('poster-preview-wrap')
const previewEl          = document.getElementById('poster-preview')
const moreToggleBtn      = document.getElementById('more-toggle-btn')
const moreSection        = document.getElementById('more-templates-section')
const colorPickerSection = document.getElementById('color-picker-section')
const colorSwatchesEl    = document.getElementById('color-swatches')
const customColorInput   = document.getElementById('custom-color-input')
const upcomingEl         = document.getElementById('upcoming-events')
const pastEl             = document.getElementById('past-events')
const pastBlock          = document.getElementById('past-events-block')
const setupNotice        = document.getElementById('setup-notice')
const formSectionLabel   = document.getElementById('form-section-label')
const resetFormBtn       = document.getElementById('reset-form-btn')
const downloadBtn        = document.getElementById('download-btn')

let selectedTemplate = null
let selectedColor    = null
let allEvents        = []

// ===== COLOR PRESETS =====

const COLOR_PRESETS = [
  { hex: '#FDF6EC', label: 'Warm Cream' },
  { hex: '#FF6B6B', label: 'Coral' },
  { hex: '#FFD93D', label: 'Sunflower' },
  { hex: '#A8C5A0', label: 'Sage Green' },
  { hex: '#87CEEB', label: 'Sky Blue' },
  { hex: '#C9B1E8', label: 'Lavender' },
  { hex: '#E07A5F', label: 'Terracotta' },
  { hex: '#2A9D8F', label: 'Deep Teal' },
]

// ===== COLOR HELPERS =====

// Returns true if the color is dark enough that white text is needed.
// Uses relative luminance (WCAG formula). Threshold: luminance < 0.4.
function isColorDark(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.4
}

// Returns a theme object for a chosen hex color, or null to use CSS defaults.
function getTheme(hex) {
  if (!hex) return null
  const dark = isColorDark(hex)
  return {
    bg:        hex,
    dark,
    text:      dark ? '#FFFFFF' : '#1A1A1A',
    textMuted: dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.55)',
    accent:    dark ? 'rgba(255,255,255,0.60)'  : 'rgba(0,0,0,0.45)',
    border:    dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.15)',
    metaBg:    dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)',
    divLine:   dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',
  }
}

// ===== COLOR PICKER INIT =====

;(function initColorPicker() {
  COLOR_PRESETS.forEach(preset => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'color-swatch'
    btn.style.background = preset.hex
    btn.dataset.hex = preset.hex
    btn.title = preset.label
    btn.setAttribute('aria-label', preset.label)
    btn.addEventListener('click', () => {
      selectedColor = preset.hex
      customColorInput.value = preset.hex
      updateSwatchSelection()
      liveRerender()
    })
    colorSwatchesEl.appendChild(btn)
  })
})()

function updateSwatchSelection() {
  colorSwatchesEl.querySelectorAll('.color-swatch').forEach(btn => {
    btn.classList.toggle('active',
      btn.dataset.hex.toLowerCase() === (selectedColor || '').toLowerCase())
  })
}

customColorInput.addEventListener('input', () => {
  selectedColor = customColorInput.value
  updateSwatchSelection()
  liveRerender()
})

// Re-render the live preview when color changes, if a valid preview already exists.
function liveRerender() {
  if (!previewWrap.hidden && selectedTemplate) {
    const data = collectFormData()
    if (data.eventName && data.date && data.time && data.location) {
      renderPoster(data)
    }
  }
}

// ===== MORE TEMPLATES TOGGLE =====

moreToggleBtn.addEventListener('click', () => {
  const isHidden = moreSection.hidden
  moreSection.hidden = !isHidden
  moreToggleBtn.textContent = isHidden ? '▾ Hide extra templates' : '▸ Show more templates'
  moreToggleBtn.setAttribute('aria-expanded', String(!isHidden))
})

// ===== TEMPLATE SELECTION =====

templateCards.forEach(card => {
  card.addEventListener('click', () => {
    templateCards.forEach(c => c.classList.remove('selected'))
    card.classList.add('selected')
    selectedTemplate = card.dataset.template
    colorPickerSection.classList.add('visible')
    liveRerender()
  })
})

function selectTemplate(name) {
  const card = [...templateCards].find(c => c.dataset.template === name)
  if (!card) return
  templateCards.forEach(c => c.classList.remove('selected'))
  card.classList.add('selected')
  selectedTemplate = name
  colorPickerSection.classList.add('visible')
  // Reveal the "more" section if the template lives there
  if (card.closest('#more-templates-section') && moreSection.hidden) {
    moreToggleBtn.click()
  }
}

// ===== EVENTS: LOAD / LIST =====

async function loadEvents() {
  const { data, error } = await supabase.from('events').select('*').order('date', { ascending: true })
  if (error) {
    if (/does not exist|42P01|schema cache/i.test(error.message || '')) {
      setupNotice.hidden = false
      upcomingEl.innerHTML = `<div class="empty" style="padding:24px"><p>Run the one-time setup above to start saving events.</p></div>`
    } else {
      showToast('Error loading events', true)
    }
    return
  }
  allEvents = data || []
  renderEventList()
}

function renderEventList() {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = allEvents.filter(ev => ev.date >= today)
  const past     = allEvents.filter(ev => ev.date < today).reverse()

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map(ev => eventCard(ev)).join('')
    : `<div class="empty" style="padding:24px"><div class="empty-icon">📅</div><p>No upcoming events — create one below</p></div>`

  pastBlock.hidden = past.length === 0
  pastEl.innerHTML = past.map(ev => eventCard(ev, true)).join('')
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function eventCard(ev, isPast = false) {
  const e = escapeHtml
  const [y, m, d] = ev.date.split('-')
  const meta = [ev.time ? parseTimeTo24h(ev.time) : null, ev.location].filter(Boolean).join(' · ')
  return `
    <div class="event-card${isPast ? ' past' : ''}">
      <div class="event-card-date">
        <span class="event-card-day">${parseInt(d, 10)}</span>
        <span class="event-card-month">${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}</span>
      </div>
      <div class="event-card-info">
        <div class="event-card-name">${e(ev.name)}</div>
        <div class="event-card-meta">${e(meta)}</div>
      </div>
      <div class="event-card-actions">
        <button class="btn-icon" onclick="posterEvent('${ev.id}')" title="Make poster">🖼️ Poster</button>
        <button class="btn-icon" onclick="editEvent('${ev.id}')" title="Edit">✏️</button>
        <button class="btn-icon danger" onclick="deleteEvent('${ev.id}')" title="Delete">🗑️</button>
      </div>
    </div>`
}

function fillForm(ev) {
  document.getElementById('event-id').value       = ev.id
  document.getElementById('event-name').value     = ev.name || ''
  document.getElementById('event-date').value     = ev.date || ''
  document.getElementById('event-time').value     = ev.time || ''
  document.getElementById('event-location').value = ev.location || ''
  document.getElementById('event-tagline').value  = ev.tagline || ''
  document.getElementById('event-details').value  = ev.details || ''
  document.getElementById('event-contact').value  = ev.contact || ''
  selectedColor = ev.color || null
  if (ev.color) customColorInput.value = ev.color
  updateSwatchSelection()
  if (ev.template) selectTemplate(ev.template)
  formSectionLabel.textContent = `Editing: ${ev.name}`
  generateBtn.textContent = 'Save Changes'
  resetFormBtn.hidden = false
}

function resetForm() {
  form.reset()
  document.getElementById('event-id').value = ''
  formSectionLabel.textContent = 'New Event'
  generateBtn.textContent = 'Save Event'
  resetFormBtn.hidden = true
  previewWrap.hidden = true
}

resetFormBtn.addEventListener('click', resetForm)

window.editEvent = (id) => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return
  fillForm(ev)
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.posterEvent = (id) => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return
  fillForm(ev)
  if (!selectedTemplate) selectTemplate(ev.template || 'storybook')
  renderPoster(collectFormData())
  previewWrap.hidden = false
  previewWrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.deleteEvent = async (id) => {
  const ev = allEvents.find(x => x.id === id)
  if (!ev) return
  if (!confirm(`Delete "${ev.name}"? This cannot be undone.`)) return
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) { showToast('Error deleting event', true); return }
  showToast(`"${ev.name}" deleted`)
  if (document.getElementById('event-id').value === id) resetForm()
  loadEvents()
}

// ===== FORM SUBMISSION (SAVE + PREVIEW) =====

form.addEventListener('submit', async e => {
  e.preventDefault()
  const data = collectFormData()
  if (!validateForm(data)) return

  const editingId = document.getElementById('event-id').value
  const payload = {
    name:     data.eventName,
    date:     data.date,
    time:     data.time,
    location: data.location,
    tagline:  data.tagline || null,
    details:  data.details || null,
    contact:  data.contact || null,
    template: selectedTemplate,
    color:    selectedColor,
  }

  generateBtn.disabled = true
  let error
  if (editingId) {
    ;({ error } = await supabase.from('events').update(payload).eq('id', editingId))
  } else {
    ;({ error } = await supabase.from('events').insert([payload]))
  }
  generateBtn.disabled = false

  if (error) {
    if (/does not exist|42P01|schema cache/i.test(error.message || '')) {
      setupNotice.hidden = false
      setupNotice.scrollIntoView({ behavior: 'smooth', block: 'start' })
      showToast('Events table missing — see setup note at top', true)
    } else {
      showToast('Error saving event', true)
    }
    return
  }

  showToast(editingId ? 'Event updated!' : 'Event saved!')
  if (!editingId) resetForm()
  loadEvents()

  if (selectedTemplate) {
    renderPoster(data)
    previewWrap.hidden = false
    previewWrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

// ===== POSTER DOWNLOAD =====

downloadBtn.addEventListener('click', async () => {
  const posterNode = previewEl.firstElementChild
  if (!posterNode) { showToast('Generate a poster first', true); return }
  downloadBtn.disabled = true
  downloadBtn.textContent = 'Rendering…'
  try {
    const canvas = await html2canvas(posterNode, {
      scale: 3, useCORS: true, backgroundColor: null, logging: false,
    })
    const name = document.getElementById('event-name').value.trim() || 'event'
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const a = document.createElement('a')
    a.download = `${slug}-poster.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    showToast('Poster downloaded!')
  } catch {
    showToast('Could not render the poster image', true)
  }
  downloadBtn.disabled = false
  downloadBtn.textContent = '⬇ Download PNG'
})

loadEvents()

function collectFormData() {
  return {
    eventName : document.getElementById('event-name').value.trim(),
    date      : document.getElementById('event-date').value,
    time      : document.getElementById('event-time').value.trim(),
    location  : document.getElementById('event-location').value.trim(),
    tagline   : document.getElementById('event-tagline').value.trim(),
    details   : document.getElementById('event-details').value.trim(),
    contact   : document.getElementById('event-contact').value.trim(),
    color     : selectedColor,
  }
}

function validateForm(data) {
  if (!data.eventName) {
    showToast('Event Name is required', true)
    document.getElementById('event-name').focus()
    return false
  }
  if (!data.date) {
    showToast('Date is required', true)
    document.getElementById('event-date').focus()
    return false
  }
  if (!data.time) {
    showToast('Time is required', true)
    document.getElementById('event-time').focus()
    return false
  }
  if (!data.location) {
    showToast('Location is required', true)
    document.getElementById('event-location').focus()
    return false
  }
  return true
}

// ===== HELPERS =====

function showToast(msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`
}

// Parses freeform time input and returns 24-hour "HH:MM" string.
// Handles: "3pm", "3:30pm", "3 PM", "15:00", "9:30", "10.30", "dalle 17", "ore 10".
// Falls back to returning the input as-is if nothing matches.
function parseTimeTo24h(input) {
  if (!input) return ''
  const s = input.trim()

  // Italian prefix: "dalle HH[:MM]" or "ore HH[:MM]"
  const italianMatch = s.match(/^(?:dalle|ore)\s+(\d{1,2})(?::(\d{2}))?/i)
  if (italianMatch) {
    const h = parseInt(italianMatch[1], 10)
    const m = italianMatch[2] !== undefined ? parseInt(italianMatch[2], 10) : 0
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // Dot separator: "10.30", "9.00"
  const dotMatch = s.match(/^(\d{1,2})\.(\d{2})$/)
  if (dotMatch) {
    const h = parseInt(dotMatch[1], 10)
    const m = parseInt(dotMatch[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // AM/PM: "3pm", "3:30pm", "3 PM", "3:30 p.m."
  const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10)
    const m = ampmMatch[2] !== undefined ? parseInt(ampmMatch[2], 10) : 0
    const period = ampmMatch[3].toLowerCase()
    if (period === 'p' && h !== 12) h += 12
    if (period === 'a' && h === 12) h = 0
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // 24-hour with colon: "15:00", "9:30"
  const h24Match = s.match(/^(\d{1,2}):(\d{2})$/)
  if (h24Match) {
    const h = parseInt(h24Match[1], 10)
    const m = parseInt(h24Match[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // Plain hour (assumed 24h): "15", "9"
  const plainMatch = s.match(/^(\d{1,2})$/)
  if (plainMatch) {
    const h = parseInt(plainMatch[1], 10)
    if (h >= 0 && h <= 23)
      return `${String(h).padStart(2, '0')}:00`
  }

  return escapeHtml(s)
}

function parseBullets(text) {
  if (!text) return []
  return text
    .split(/[·\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

// ===== POSTER RENDERERS =====

function renderPoster(data) {
  const bullets = parseBullets(data.details)
  if (selectedTemplate === 'storybook')  previewEl.innerHTML = renderStorybook(data, bullets)
  if (selectedTemplate === 'pop')        previewEl.innerHTML = renderPop(data, bullets)
  if (selectedTemplate === 'whimsy')     previewEl.innerHTML = renderWhimsy(data, bullets)
  if (selectedTemplate === 'chalkboard') previewEl.innerHTML = renderChalkboard(data, bullets)
  if (selectedTemplate === 'pastel')     previewEl.innerHTML = renderPastel(data, bullets)
  if (selectedTemplate === 'bookmark')   previewEl.innerHTML = renderBookmark(data, bullets)
}

// Converts a style string to a style attribute, or '' if no string.
const sty = s => s ? ` style="${s}"` : ''

// -----------------------------------------------
// TEMPLATE 1: Storybook
// -----------------------------------------------
function renderStorybook(data, bullets) {
  const e = escapeHtml
  const t = getTheme(data.color)

  const sBg      = t ? `background:${t.bg};border-color:${t.border}` : ''
  const sFrame   = t ? `border-color:${t.border}` : ''
  const sText    = t ? `color:${t.text}` : ''
  const sAccent  = t ? `color:${t.accent}` : ''
  const sMuted   = t ? `color:${t.textMuted}` : ''
  const sMetaBg  = t ? `background:${t.metaBg}` : ''
  const sContact = t ? `color:${t.textMuted};border-top-color:${t.border}` : ''

  const taglineHtml = data.tagline
    ? `<div class="ps-tagline"${sty(sMuted)}>${e(data.tagline)}</div>`
    : ''

  const bulletsHtml = bullets.length
    ? `<div class="ps-bullets">
        ${bullets.map(b => `
          <div class="ps-bullet">
            <span class="ps-bullet-dot"${sty(sAccent)}>✦</span>
            <span${sty(sText)}>${e(b)}</span>
          </div>`).join('')}
      </div>`
    : ''

  const contactHtml = data.contact
    ? `<div class="ps-contact"${sty(sContact)}>📬 ${e(data.contact)}</div>`
    : ''

  return `
    <div class="poster-storybook"${sty(sBg)}>
      <div class="ps-frame"${sty(sFrame)}>
        <span class="ps-corner ps-corner-tl"${sty(sAccent)}>✦</span>
        <span class="ps-corner ps-corner-tr"${sty(sAccent)}>✦</span>
        <span class="ps-corner ps-corner-bl"${sty(sAccent)}>✦</span>
        <span class="ps-corner ps-corner-br"${sty(sAccent)}>✦</span>
        <div class="ps-event-name"${sty(sText)}>${e(data.eventName)}</div>
        <div class="ps-divider"${sty(sAccent)}>✦ ✦ ✦</div>
        ${taglineHtml}
        <div class="ps-meta"${sty(sMetaBg)}>
          <div class="ps-meta-row">
            <span class="ps-meta-icon">📅</span>
            <span class="ps-meta-text"${sty(sText)}>${formatDate(data.date)}</span>
          </div>
          <div class="ps-meta-row">
            <span class="ps-meta-icon">🕐</span>
            <span class="ps-meta-text"${sty(sText)}>${parseTimeTo24h(data.time)}</span>
          </div>
          <div class="ps-meta-row">
            <span class="ps-meta-icon">📍</span>
            <span class="ps-meta-text"${sty(sText)}>${e(data.location)}</span>
          </div>
        </div>
        ${bulletsHtml}
        ${contactHtml}
      </div>
    </div>`
}

// Scales down the Pop title font for long event names so it fits the square.
function popTitleSize(name) {
  const l = name.length
  if (l <= 20) return '52px'
  if (l <= 32) return '38px'
  if (l <= 48) return '28px'
  return '22px'
}

// -----------------------------------------------
// TEMPLATE 2: Instagram Pop
// -----------------------------------------------
function renderPop(data, bullets) {
  const e = escapeHtml
  const t = getTheme(data.color)

  const sBg      = t ? `background:${t.bg}` : ''
  const sText    = t ? `color:${t.text}` : ''
  const sMuted   = t ? `color:${t.textMuted}` : ''
  const sBotBdr  = t ? `border-top-color:${t.border}` : ''
  const sTagBg   = t ? `color:${t.textMuted};background:${t.metaBg}` : ''
  // event name always gets font-size; also gets color if theme set
  const sName    = `font-size:${popTitleSize(data.eventName)}${t ? `;color:${t.text}` : ''}`

  const taglineHtml = data.tagline
    ? `<div class="ppo-tagline"${sty(sMuted)}>${e(data.tagline)}</div>`
    : ''

  const bulletsHtml = bullets.length
    ? `<div class="ppo-bullets">
        ${bullets.map(b => `<span class="ppo-bullet-tag"${sty(sTagBg)}>${e(b)}</span>`).join('')}
      </div>`
    : ''

  const contactHtml = data.contact
    ? `<div class="ppo-bottom-row"${sty(sText)}>
        <span class="ppo-icon">📬</span>
        <span>${e(data.contact)}</span>
      </div>`
    : ''

  return `
    <div class="poster-pop"${sty(sBg)}>
      <div class="ppo-bg-circle"></div>
      <div class="ppo-bg-circle-2"></div>
      <div class="ppo-deco-corner">✦<br>✦ ✦</div>
      <div class="ppo-middle">
        <div class="ppo-event-name" style="${sName}">${e(data.eventName)}</div>
        ${taglineHtml}
      </div>
      <div class="ppo-bottom"${sty(sBotBdr)}>
        <div class="ppo-bottom-row"${sty(sText)}>
          <span class="ppo-icon">📅</span>
          <span>${formatDate(data.date)}</span>
        </div>
        <div class="ppo-bottom-row"${sty(sText)}>
          <span class="ppo-icon">🕐</span>
          <span>${parseTimeTo24h(data.time)}</span>
        </div>
        <div class="ppo-bottom-row"${sty(sText)}>
          <span class="ppo-icon">📍</span>
          <span>${e(data.location)}</span>
        </div>
        ${contactHtml}
        ${bulletsHtml}
      </div>
    </div>`
}

// -----------------------------------------------
// TEMPLATE 3: Modern Whimsy
// -----------------------------------------------
function renderWhimsy(data, bullets) {
  const e = escapeHtml
  const t = getTheme(data.color)

  const sHeader  = t ? `background:${t.bg}` : ''
  const sText    = t ? `color:${t.text}` : ''
  const sAccent  = t ? `color:${t.accent}` : ''
  const sMuted   = t ? `color:${t.textMuted}` : ''
  const sDivLine = t ? `background:${t.divLine}` : ''
  // divider dot and ✦ should match the chosen color so they look cohesive
  const sDivDot  = t ? `background:${t.bg}` : ''
  const sDivStar = t ? `font-size:14px;color:${t.bg}` : 'font-size:14px;'
  // bullets in the white body section use template default dot color unless theme set
  const sBulDot  = t ? `background:${t.bg}` : ''

  const taglineHtml = data.tagline
    ? `<div class="pw-tagline"${sty(sMuted)}>${e(data.tagline)}</div>`
    : ''

  const bulletsHtml = bullets.length
    ? `<div class="pw-separator"></div>
      <div class="pw-bullets">
        ${bullets.map(b => `
          <div class="pw-bullet">
            <span class="pw-bullet-dot"${sty(sBulDot)}></span>
            <span>${e(b)}</span>
          </div>`).join('')}
      </div>`
    : ''

  const contactHtml = data.contact
    ? `<div class="pw-contact">📬 ${e(data.contact)}</div>`
    : ''

  return `
    <div class="poster-whimsy">
      <div class="pw-header"${sty(sHeader)}>
        <div class="pw-event-name"${sty(sText)}>${e(data.eventName)}</div>
        ${taglineHtml}
      </div>
      <div class="pw-divider">
        <div class="pw-divider-line"${sty(sDivLine)}></div>
        <span class="pw-divider-dot"${sty(sDivDot)}></span>
        <span style="${sDivStar}">✦</span>
        <span class="pw-divider-dot"${sty(sDivDot)}></span>
        <div class="pw-divider-line"${sty(sDivLine)}></div>
      </div>
      <div class="pw-body">
        <div class="pw-meta">
          <div class="pw-meta-row">
            <span class="pw-meta-icon">📅</span>
            <div class="pw-meta-block">
              <span class="pw-meta-label">Date</span>
              <span class="pw-meta-text">${formatDate(data.date)}</span>
            </div>
          </div>
          <div class="pw-meta-row">
            <span class="pw-meta-icon">🕐</span>
            <div class="pw-meta-block">
              <span class="pw-meta-label">Time</span>
              <span class="pw-meta-text">${parseTimeTo24h(data.time)}</span>
            </div>
          </div>
          <div class="pw-meta-row">
            <span class="pw-meta-icon">📍</span>
            <div class="pw-meta-block">
              <span class="pw-meta-label">Location</span>
              <span class="pw-meta-text">${e(data.location)}</span>
            </div>
          </div>
        </div>
        ${bulletsHtml}
        ${contactHtml}
      </div>
    </div>`
}

// -----------------------------------------------
// TEMPLATE 4: Chalkboard
// -----------------------------------------------
function renderChalkboard(data, bullets) {
  const e = escapeHtml
  const t = getTheme(data.color)

  const sBg       = t ? `background:${t.bg};border-color:${t.border}` : ''
  const sFrame    = t ? `border-color:${t.border}` : ''
  const sText     = t ? `color:${t.text}` : ''
  const sMuted    = t ? `color:${t.textMuted}` : ''
  // Chalk yellow for dark bg stays chalk yellow; for light bg use a warm amber
  const chalky    = t ? (t.dark ? '#FFE066' : '#7A5A00') : null
  const sChalky   = chalky ? `color:${chalky}` : ''
  const sDivider  = t ? `border-top-color:${t.border}` : ''
  const sContactC = t ? `color:${chalky || t.textMuted};border-top-color:${t.border}` : ''

  const taglineHtml = data.tagline
    ? `<div class="pch-tagline"${sty(sChalky)}>${e(data.tagline)}</div>`
    : ''

  const bulletsHtml = bullets.length
    ? `<hr class="pch-divider-2"${sty(sDivider)}>
      <div class="pch-bullets">
        ${bullets.map(b => `
          <div class="pch-bullet"${sty(sText)}>
            <span class="pch-bullet-mark"${sty(sChalky)}>✎</span>
            <span>${e(b)}</span>
          </div>`).join('')}
      </div>`
    : ''

  const contactHtml = data.contact
    ? `<div class="pch-contact"${sty(sContactC)}>${e(data.contact)}</div>`
    : ''

  return `
    <div class="poster-chalkboard"${sty(sBg)}>
      <div class="pch-frame"${sty(sFrame)}>
        <div class="pch-event-name"${sty(sText)}>${e(data.eventName)}</div>
        <div class="pch-deco"${sty(sChalky)}>✦ ✦ ✦</div>
        <hr class="pch-divider"${sty(sDivider)}>
        ${taglineHtml}
        <div class="pch-meta">
          <div class="pch-meta-row"${sty(sText)}>
            <span class="pch-meta-icon">📅</span>
            <span>${formatDate(data.date)}</span>
          </div>
          <div class="pch-meta-row"${sty(sText)}>
            <span class="pch-meta-icon">🕐</span>
            <span>${parseTimeTo24h(data.time)}</span>
          </div>
          <div class="pch-meta-row"${sty(sText)}>
            <span class="pch-meta-icon">📍</span>
            <span>${e(data.location)}</span>
          </div>
        </div>
        ${bulletsHtml}
        ${contactHtml}
      </div>
    </div>`
}

// -----------------------------------------------
// TEMPLATE 5: Pastel Dream
// -----------------------------------------------
function renderPastel(data, bullets) {
  const e = escapeHtml
  const t = getTheme(data.color)

  const sBg      = t ? `background:${t.bg}` : ''
  const sText    = t ? `color:${t.text}` : ''
  const sAccent  = t ? `color:${t.accent}` : ''
  const sMuted   = t ? `color:${t.textMuted}` : ''
  const sCard    = t ? `background:${t.metaBg}` : ''
  const sContact = t ? `background:${t.metaBg};color:${t.text}` : ''
  // Flower dot: keep golden for dark bg, warm orange for light
  const sDot     = t ? `color:${t.dark ? '#FFD700' : '#F59E0B'}` : ''

  const taglineHtml = data.tagline
    ? `<div class="pp-tagline"${sty(sMuted)}>${e(data.tagline)}</div>`
    : ''

  const bulletsHtml = bullets.length
    ? `<div class="pp-bullets">
        ${bullets.map(b => `
          <div class="pp-bullet">
            <span class="pp-bullet-dot"${sty(sDot)}>✿</span>
            <span${sty(sText)}>${e(b)}</span>
          </div>`).join('')}
      </div>`
    : ''

  const contactHtml = data.contact
    ? `<div class="pp-contact"${sty(sContact)}>📬 ${e(data.contact)}</div>`
    : ''

  return `
    <div class="poster-pastel"${sty(sBg)}>
      <div class="pp-deco">🌸 📖 🌸</div>
      <div class="pp-event-name"${sty(sText)}>${e(data.eventName)}</div>
      ${taglineHtml}
      <div class="pp-card"${sty(sCard)}>
        <div class="pp-meta-row">
          <span class="pp-meta-icon">📅</span>
          <span class="pp-meta-text"${sty(sText)}>${formatDate(data.date)}</span>
        </div>
        <div class="pp-meta-row">
          <span class="pp-meta-icon">🕐</span>
          <span class="pp-meta-text"${sty(sText)}>${parseTimeTo24h(data.time)}</span>
        </div>
        <div class="pp-meta-row">
          <span class="pp-meta-icon">📍</span>
          <span class="pp-meta-text"${sty(sText)}>${e(data.location)}</span>
        </div>
      </div>
      ${bulletsHtml}
      ${contactHtml}
    </div>`
}

// -----------------------------------------------
// TEMPLATE 6: Bookmark Strip
// -----------------------------------------------
function renderBookmark(data, bullets) {
  const e = escapeHtml
  // Bookmark always applies a band color — user choice or default teal.
  const bandBg   = data.color || '#2A9D8F'
  const dark     = isColorDark(bandBg)
  const onBand   = dark ? '#FFFFFF' : '#1A1A1A'
  const onMuted  = dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.55)'
  const sepTop   = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)'
  const tagBg    = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'

  const taglineHtml = data.tagline
    ? `<div class="pbk-tagline">${e(data.tagline)}</div>`
    : ''

  const detailRows = [
    ['📅', formatDate(data.date)],
    ['🕐', parseTimeTo24h(data.time)],
    ['📍', e(data.location)],
  ]
  if (data.contact) detailRows.push(['📬', e(data.contact)])

  const detailsHtml = detailRows.map(([icon, text]) => `
    <div class="pbk-detail" style="color:${onBand}">
      <span class="pbk-detail-icon">${icon}</span>
      <span>${text}</span>
    </div>`).join('')

  const bulletsHtml = bullets.length
    ? `<div class="pbk-bullets">
        ${bullets.map(b => `
          <span class="pbk-bullet-tag"
            style="background:${tagBg};color:${onBand}">${e(b)}</span>`).join('')}
      </div>`
    : ''

  return `
    <div class="poster-bookmark">
      <div class="pbk-top" style="background:${bandBg}">
        <div class="pbk-deco" style="color:${onBand}">✦</div>
      </div>
      <div class="pbk-sep" style="background:${sepTop}"></div>
      <div class="pbk-mid">
        <div class="pbk-event-name">${e(data.eventName)}</div>
        ${taglineHtml}
      </div>
      <div class="pbk-sep" style="background:rgba(0,0,0,0.06)"></div>
      <div class="pbk-bot" style="background:${bandBg}">
        ${detailsHtml}
        ${bulletsHtml}
      </div>
    </div>`
}
