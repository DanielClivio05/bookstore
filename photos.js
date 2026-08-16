// The picture library.
//
// One page holds every picture; the Events and Website pages just point at
// rows from here. That means a book cover is uploaded once and can end up on
// an event card, on the website shelf and in the booking form without ever
// being found on her phone a second time.

import { requireAuth } from './auth.js'
import { supabase } from './supabase.js'
import {
  listPhotos, uploadPhotos, deletePhoto, updatePhoto,
  photoUrl, invalidatePhotoCache,
} from './photo-lib.js'

await requireAuth()

const toast       = document.getElementById('toast')
const grid        = document.getElementById('grid')
const strip       = document.getElementById('shelf-strip')
const shelfBlock  = document.getElementById('shelf-block')
const countEl     = document.getElementById('count')
const drop        = document.getElementById('drop')
const fileInput   = document.getElementById('file-input')
const statusEl    = document.getElementById('status')
const setupNotice = document.getElementById('setup-notice')

let photos = []
let usage  = {}   // photo id -> ['Cover for Pyjama Party!', 'About section']


// ===== LOAD =====

async function load () {
  try {
    photos = await listPhotos()
  } catch (err) {
    if (/does not exist|42P01|schema cache/i.test(err?.message || '')) {
      setupNotice.hidden = false
      grid.innerHTML = ''
      return
    }
    grid.innerHTML = '<div class="empty" style="padding:40px"><p>Could not load your pictures.</p></div>'
    return
  }

  await loadUsage()
  render()
}

// Where each picture is used, so nothing gets deleted by surprise.
async function loadUsage () {
  usage = {}
  const [{ data: events }, { data: content }] = await Promise.all([
    supabase.from('events').select('name, photo_id').not('photo_id', 'is', null),
    supabase.from('site_content').select('key, value_en').in('key', ['about_photo']),
  ])

  for (const ev of events || []) {
    (usage[ev.photo_id] ||= []).push(`Cover for “${ev.name}”`)
  }
  for (const row of content || []) {
    if (row.value_en) (usage[row.value_en] ||= []).push('Beside the About text')
  }
}


// ===== RENDER =====

function render () {
  countEl.textContent = photos.length || ''

  const shelf = photos.filter(p => p.on_shelf)
  shelfBlock.hidden = shelf.length === 0
  strip.innerHTML = shelf.map((p, i) => `
    <div class="shelf-chip">
      <img src="${photoUrl(p, 'thumb')}" alt="">
      <span>${i + 1}</span>
    </div>`).join('')

  if (!photos.length) {
    grid.innerHTML = `
      <div class="empty" style="padding:44px;grid-column:1/-1">
        <div class="empty-icon">📷</div>
        <p>No pictures yet — drop a few in the box above.</p>
      </div>`
    return
  }

  grid.innerHTML = photos.map(photoCard).join('')
  wireCards()
}

function photoCard (p) {
  const e = escapeHtml
  const used = usage[p.id] || []
  const shelfIndex = photos.filter(x => x.on_shelf).findIndex(x => x.id === p.id)

  return `
    <div class="photo-card${p.on_shelf ? ' on-shelf' : ''}" data-id="${p.id}">
      <div class="photo-card-img">
        <img src="${photoUrl(p, 'thumb')}" alt="${e(p.caption_en || 'Picture')}" loading="lazy">
        ${p.on_shelf ? `<span class="photo-flag">On the shelf · ${shelfIndex + 1}</span>` : ''}
        <button class="photo-del" title="Delete this picture" data-act="delete">🗑️</button>
      </div>

      <div class="photo-card-body">
        <label class="photo-lbl">Caption <span>English</span></label>
        <input type="text" data-field="caption_en" value="${e(p.caption_en || '')}"
               placeholder="e.g. The Gruffalo" maxlength="120">

        <label class="photo-lbl">Caption <span>Italiano</span></label>
        <input type="text" data-field="caption_it" value="${e(p.caption_it || '')}"
               placeholder="left blank = the English one is used" maxlength="120">

        <div class="photo-row">
          <label class="photo-toggle">
            <input type="checkbox" data-field="on_shelf" ${p.on_shelf ? 'checked' : ''}>
            <span>Show on the website shelf</span>
          </label>
          <div class="photo-move" ${p.on_shelf ? '' : 'hidden'}>
            <button class="btn-icon" data-act="up"   title="Move earlier">↑</button>
            <button class="btn-icon" data-act="down" title="Move later">↓</button>
          </div>
        </div>

        ${used.length
          ? `<div class="photo-used">In use · ${used.map(e).join(' · ')}</div>`
          : `<div class="photo-used idle">Not used anywhere yet</div>`}
      </div>
    </div>`
}

function wireCards () {
  grid.querySelectorAll('.photo-card').forEach(card => {
    const id = card.dataset.id
    const photo = photos.find(p => p.id === id)
    if (!photo) return

    // Captions save when she clicks away, not on every keystroke.
    card.querySelectorAll('input[type=text]').forEach(input => {
      const field = input.dataset.field
      input.addEventListener('blur', async () => {
        const value = input.value.trim() || null
        if (value === (photo[field] || null)) return
        try {
          await updatePhoto(id, { [field]: value })
          photo[field] = value
          invalidatePhotoCache()
          flash(input)
        } catch {
          input.value = photo[field] || ''
          showToast('Could not save that caption', true)
        }
      })
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur() })
    })

    card.querySelector('input[data-field=on_shelf]').addEventListener('change', async e => {
      const on = e.target.checked
      // New arrivals go to the end of the shelf rather than the front.
      const patch = on
        ? { on_shelf: true, sort: (Math.max(0, ...photos.filter(p => p.on_shelf).map(p => p.sort)) + 1) }
        : { on_shelf: false }
      try {
        await updatePhoto(id, patch)
        Object.assign(photo, patch)
        invalidatePhotoCache()
        resequence()
        render()
        showToast(on ? 'Added to the website shelf' : 'Taken off the shelf')
      } catch {
        e.target.checked = !on
        showToast('Could not change that', true)
      }
    })

    card.querySelector('[data-act=delete]').addEventListener('click', () => removePhoto(photo))
    card.querySelector('[data-act=up]')  ?.addEventListener('click', () => move(photo, -1))
    card.querySelector('[data-act=down]')?.addEventListener('click', () => move(photo,  1))
  })
}


// ===== SHELF ORDER =====

// Shelf items are kept as 0,1,2,… after every change, so the arrows always
// have a whole number to swap and gaps never build up.
function resequence () {
  photos.filter(p => p.on_shelf)
    .sort((a, b) => a.sort - b.sort || (a.created_at < b.created_at ? 1 : -1))
    .forEach((p, i) => { p.sort = i })
  photos.sort(sortForDisplay)
}

function sortForDisplay (a, b) {
  if (a.on_shelf !== b.on_shelf) return a.on_shelf ? -1 : 1
  if (a.on_shelf) return a.sort - b.sort
  return a.created_at < b.created_at ? 1 : -1
}

async function move (photo, delta) {
  const shelf = photos.filter(p => p.on_shelf)
  const i = shelf.findIndex(p => p.id === photo.id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= shelf.length) return

  const other = shelf[j]
  const a = photo.sort, b = other.sort
  photo.sort = b; other.sort = a
  photos.sort(sortForDisplay)
  render()

  try {
    await Promise.all([
      updatePhoto(photo.id, { sort: photo.sort }),
      updatePhoto(other.id, { sort: other.sort }),
    ])
    invalidatePhotoCache()
  } catch {
    photo.sort = a; other.sort = b
    photos.sort(sortForDisplay)
    render()
    showToast('Could not reorder', true)
  }
}


// ===== DELETE =====

async function removePhoto (photo) {
  const used = usage[photo.id] || []
  const warning = used.length
    ? `\n\nIt is currently used here:\n· ${used.join('\n· ')}\n\nThose will simply lose their picture — nothing else is deleted.`
    : ''

  if (!confirm(`Delete “${photo.caption_en || 'this picture'}”?${warning}\n\nThis cannot be undone.`)) return

  try {
    await deletePhoto(photo)
  } catch {
    showToast('Could not delete that picture', true)
    return
  }

  photos = photos.filter(p => p.id !== photo.id)
  invalidatePhotoCache()
  resequence()
  await loadUsage()
  render()
  showToast('Picture deleted')
}


// ===== UPLOAD =====

;['dragenter', 'dragover'].forEach(t =>
  drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over') }))
;['dragleave', 'drop'].forEach(t =>
  drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over') }))

drop.addEventListener('drop', e => take(e.dataTransfer?.files))
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() }
})
fileInput.addEventListener('change', () => { take(fileInput.files); fileInput.value = '' })

// The whole window accepts a drop, so a picture dragged anywhere onto the
// page lands in the library rather than opening in the browser.
window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', e => {
  if (drop.contains(e.target)) return
  e.preventDefault()
  if (e.dataTransfer?.files?.length) take(e.dataTransfer.files)
})

async function take (files) {
  if (!files || !files.length) return

  statusEl.hidden = false
  statusEl.className = 'pick-status'
  statusEl.textContent = 'Adding…'

  const { photos: added, failures } = await uploadPhotos(files, {
    onProgress: (i, total, name) => {
      statusEl.textContent = i >= total
        ? 'Finishing…'
        : `Adding ${i + 1} of ${total}${name ? ' — ' + name : ''}…`
    },
  })

  invalidatePhotoCache()

  if (failures.length) {
    statusEl.className = 'pick-status bad'
    statusEl.innerHTML = failures
      .map(f => `<strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.message)}`)
      .join('<br>')
  } else {
    statusEl.hidden = true
  }

  if (added.length) {
    photos = [...added, ...photos]
    photos.sort(sortForDisplay)
    render()
    showToast(`${added.length} picture${added.length === 1 ? '' : 's'} added`)
    // Nudge her towards captioning it while she still remembers what it is.
    const first = grid.querySelector(`.photo-card[data-id="${added[0].id}"] input[data-field=caption_en]`)
    first?.focus()
    first?.select()
  }
}


// ===== HELPERS =====

function flash (el) {
  el.classList.add('saved')
  setTimeout(() => el.classList.remove('saved'), 900)
}

function showToast (msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}


load()
