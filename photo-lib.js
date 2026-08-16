// Shared picture handling for the admin pages.
//
// One idea runs through all of this: a picture is uploaded ONCE, into a
// shared library, and then picked from wherever it's needed. She should
// never have to hunt for the same book cover on her phone twice.
//
//   photos table  ->  captions, where the picture is used
//   photos bucket ->  the image files themselves (public, so the website
//                     can load them without a key)
//
// Every upload is resized in the browser before it leaves her laptop, and
// saved twice: a full-size copy (1600px) and a thumbnail (480px). A photo
// straight off a phone is 4–8 MB; what lands in storage is 60–150 KB. That
// matters — the Supabase project is on the free tier, and the website has
// to open quickly on a phone in a shop doorway.

import { supabase } from './supabase.js'

const BUCKET     = 'photos'
const MAX_EDGE   = 1600
const THUMB_EDGE = 480
const QUALITY    = 0.86

const SUPABASE_URL = 'https://wsrtxsqftjfolgcttkyn.supabase.co'


// ===== URLS =====

// The bucket is public, so the URL is predictable and needs no signing.
export function fileUrl (path) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` : ''
}

export function photoUrl (photo, size = 'full') {
  if (!photo) return ''
  const path = size === 'thumb' ? (photo.thumb_path || photo.path) : photo.path
  return fileUrl(path)
}

export function captionOf (photo, lang = 'en') {
  if (!photo) return ''
  return ((lang === 'it' ? photo.caption_it : photo.caption_en) || photo.caption_en || '').trim()
}


// ===== READING =====

export async function listPhotos () {
  const { data, error } = await supabase
    .from('photos').select('*')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function updatePhoto (id, patch) {
  const { error } = await supabase.from('photos').update(patch).eq('id', id)
  if (error) throw error
}

// Which events use this picture? Used to warn before deleting.
export async function photoUsage (id) {
  const [{ data: evs }, { data: content }] = await Promise.all([
    supabase.from('events').select('name').eq('photo_id', id),
    supabase.from('site_content').select('key').eq('value_en', id),
  ])
  return {
    events: (evs || []).map(e => e.name),
    slots : (content || []).map(c => SLOT_NAMES[c.key] || c.key),
  }
}

const SLOT_NAMES = {
  about_photo: 'the About section',
}

export async function deletePhoto (photo) {
  const paths = [photo.path, photo.thumb_path].filter(Boolean)

  // Row first. If the file removal fails we're left with an unreferenced
  // file, which is invisible and harmless; the other way round would leave
  // a broken picture on the website.
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) throw error

  await supabase.storage.from(BUCKET).remove(paths).catch(() => {})
}


// ===== UPLOADING =====

export class PictureError extends Error {}

// Accepts a FileList or array. Calls onProgress(done, total, name) as it goes.
// Returns { photos: [...], failures: [{name, message}] } — one bad file in a
// batch of ten shouldn't lose the other nine.
export async function uploadPhotos (files, { onProgress } = {}) {
  const list = [...files].filter(f => f && f.size)
  const photos = []
  const failures = []

  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    onProgress?.(i, list.length, file.name)
    try {
      photos.push(await uploadOne(file))
    } catch (err) {
      failures.push({ name: file.name, message: err?.message || 'Could not be added' })
    }
  }

  onProgress?.(list.length, list.length, null)
  return { photos, failures }
}

async function uploadOne (file) {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) {
    throw new PictureError('That is not a picture')
  }

  const bitmap = await decode(file)

  const full  = await render(bitmap, MAX_EDGE)
  const thumb = await render(bitmap, THUMB_EDGE)
  bitmap.close?.()

  const base       = objectPath(file.name)
  const path       = base + '.webp'
  const thumbPath  = base + '-t.webp'

  await put(path, full.blob)
  try {
    await put(thumbPath, thumb.blob)
  } catch {
    // A missing thumbnail just means grids load the full picture. Not fatal.
  }

  const { data, error } = await supabase.from('photos').insert([{
    path,
    thumb_path: thumbPath,
    caption_en: prettyName(file.name),
    width : full.width,
    height: full.height,
  }]).select('*').single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([path, thumbPath]).catch(() => {})
    throw new PictureError('Saved the file but could not save the picture — are you still signed in?')
  }
  return data
}

async function put (path, blob) {
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (error) {
    throw new PictureError(
      /policy|unauthor|jwt/i.test(error.message || '')
        ? 'Not allowed to upload — try signing out and back in'
        : 'Upload failed — check your connection'
    )
  }
}

// HEIC is the one real trap: an iPhone photo opens fine in Safari but most
// other browsers cannot decode it at all, and the failure is silent. Say so
// plainly rather than showing a broken picture.
async function decode (file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file) } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise((resolve, reject) => {
      img.onload  = resolve
      img.onerror = () => reject(new PictureError(
        /heic|heif/i.test(file.name)
          ? 'This is an iPhone HEIC picture, which this browser can’t read. On the iPhone: Settings → Camera → Formats → Most Compatible, or send it to yourself first and it becomes a JPEG.'
          : 'That file could not be opened as a picture'
      ))
      img.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function render (source, maxEdge) {
  const w0 = source.width  || source.naturalWidth
  const h0 = source.height || source.naturalHeight
  if (!w0 || !h0) throw new PictureError('That picture appears to be empty')

  const scale = Math.min(1, maxEdge / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // Photos of book covers are the main use; a white mat under any
  // transparency keeps them looking like paper rather than a hole.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve({ blob, width: w, height: h })
        : reject(new PictureError('Could not process that picture')),
      'image/webp', QUALITY
    )
  })
}

function objectPath (filename) {
  const now  = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const slug = slugify(filename.replace(/\.[^.]+$/, '')) || 'picture'
  const rand = Math.random().toString(36).slice(2, 7)
  return `${yyyy}/${mm}/${Date.now().toString(36)}-${rand}-${slug}`
}

function slugify (s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40)
}

// "the-gruffalo_final(2).JPG" -> "The Gruffalo Final 2" — a caption she can
// keep or overwrite, rather than an empty box.
function prettyName (filename) {
  const base = filename.replace(/\.[^.]+$/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\b(img|image|photo|final|copy|v?\d{1,2})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!base || /^\d+$/.test(base)) return ''
  return base.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 80)
}


// ===== THE PICKER =====
//
// A modal used by the Events editor and the Website page. Resolves to the
// chosen photo row, to null when she clears the picture, or to undefined
// when she closes without choosing.

let cachedPhotos = null

export function invalidatePhotoCache () { cachedPhotos = null }

export async function openPhotoPicker ({ currentId = null, title = 'Choose a picture' } = {}) {
  const back = document.createElement('div')
  back.className = 'pick-back'
  back.innerHTML = `
    <div class="pick" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="pick-head">
        <div class="pick-title">${escapeHtml(title)}</div>
        <button type="button" class="pick-x" aria-label="Close">&times;</button>
      </div>
      <label class="pick-drop" tabindex="0">
        <input type="file" accept="image/*" multiple hidden>
        <span class="pick-drop-icon">🖼️</span>
        <span class="pick-drop-main">Drop a picture here, or click to choose one</span>
        <span class="pick-drop-sub">JPEG, PNG or WebP · it gets resized automatically</span>
      </label>
      <div class="pick-status" hidden></div>
      <div class="pick-grid"><div class="pick-loading">Loading pictures…</div></div>
      <div class="pick-foot">
        <button type="button" class="btn-secondary pick-clear" style="margin-left:0">Remove picture</button>
        <span class="pick-count"></span>
      </div>
    </div>`

  document.body.appendChild(back)
  document.body.style.overflow = 'hidden'

  const grid    = back.querySelector('.pick-grid')
  const drop    = back.querySelector('.pick-drop')
  const input   = back.querySelector('input[type=file]')
  const status  = back.querySelector('.pick-status')
  const count   = back.querySelector('.pick-count')
  const clearEl = back.querySelector('.pick-clear')

  clearEl.hidden = !currentId

  return new Promise(resolve => {
    let done = false
    const finish = value => {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      back.remove()
      resolve(value)
    }

    const onKey = e => { if (e.key === 'Escape') finish(undefined) }
    document.addEventListener('keydown', onKey)

    back.addEventListener('mousedown', e => { if (e.target === back) finish(undefined) })
    back.querySelector('.pick-x').addEventListener('click', () => finish(undefined))
    clearEl.addEventListener('click', () => finish(null))

    drop.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() }
    })
    ;['dragenter', 'dragover'].forEach(t =>
      drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over') }))
    ;['dragleave', 'drop'].forEach(t =>
      drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over') }))
    drop.addEventListener('drop', e => take(e.dataTransfer?.files))
    input.addEventListener('change', () => { take(input.files); input.value = '' })

    async function take (files) {
      if (!files || !files.length) return
      status.hidden = false
      status.className = 'pick-status'
      status.textContent = 'Adding…'

      const { photos, failures } = await uploadPhotos(files, {
        onProgress: (i, total, name) => {
          status.textContent = i >= total
            ? 'Finishing…'
            : `Adding ${i + 1} of ${total}${name ? ' — ' + name : ''}…`
        },
      })

      invalidatePhotoCache()

      if (failures.length) {
        status.className = 'pick-status bad'
        status.textContent = failures.map(f => `${f.name}: ${f.message}`).join('  ·  ')
      } else {
        status.hidden = true
      }

      // Uploading one picture is nearly always "and use this one".
      if (photos.length === 1 && !failures.length) { finish(photos[0]); return }
      await draw()
    }

    async function draw () {
      try {
        if (!cachedPhotos) cachedPhotos = await listPhotos()
      } catch {
        grid.innerHTML = '<div class="pick-loading">Could not load your pictures.</div>'
        return
      }

      count.textContent = cachedPhotos.length
        ? `${cachedPhotos.length} picture${cachedPhotos.length === 1 ? '' : 's'} in your library`
        : ''

      if (!cachedPhotos.length) {
        grid.innerHTML = '<div class="pick-loading">Nothing here yet — add your first picture above.</div>'
        return
      }

      grid.innerHTML = cachedPhotos.map(p => `
        <button type="button" class="pick-item${p.id === currentId ? ' on' : ''}" data-id="${p.id}"
                title="${escapeHtml(p.caption_en || '')}">
          <img src="${photoUrl(p, 'thumb')}" alt="${escapeHtml(p.caption_en || 'Picture')}" loading="lazy">
          <span class="pick-cap">${escapeHtml(p.caption_en || 'Untitled')}</span>
        </button>`).join('')

      grid.querySelectorAll('.pick-item').forEach(el =>
        el.addEventListener('click', () =>
          finish(cachedPhotos.find(p => p.id === el.dataset.id))))
    }

    draw()
  })
}


// A picture slot inside a form: shows the chosen picture, or a dashed
// "add one" tile. Returns a small handle so the page can read and set it.
export function mountPhotoField (host, { label = 'Choose a picture', onChange } = {}) {
  host.classList.add('photo-field')
  host.innerHTML = `
    <button type="button" class="photo-slot empty">
      <span class="photo-slot-plus">＋</span>
      <span class="photo-slot-text">Add a picture</span>
    </button>
    <div class="photo-slot-side" hidden>
      <div class="photo-slot-cap"></div>
      <div class="photo-slot-btns">
        <button type="button" class="btn-icon photo-change">Change</button>
        <button type="button" class="btn-icon danger photo-remove">Remove</button>
      </div>
    </div>`

  const slot   = host.querySelector('.photo-slot')
  const side   = host.querySelector('.photo-slot-side')
  const cap    = host.querySelector('.photo-slot-cap')
  let value = null

  function paint () {
    if (value) {
      slot.classList.remove('empty')
      slot.innerHTML = `<img src="${photoUrl(value, 'thumb')}" alt="">`
      cap.textContent = value.caption_en || 'No caption yet'
      side.hidden = false
    } else {
      slot.classList.add('empty')
      slot.innerHTML = `<span class="photo-slot-plus">＋</span><span class="photo-slot-text">Add a picture</span>`
      side.hidden = true
    }
  }

  async function choose () {
    const picked = await openPhotoPicker({ currentId: value?.id || null, title: label })
    if (picked === undefined) return
    value = picked || null
    paint()
    onChange?.(value)
  }

  slot.addEventListener('click', choose)
  host.querySelector('.photo-change').addEventListener('click', choose)
  host.querySelector('.photo-remove').addEventListener('click', () => {
    value = null; paint(); onChange?.(null)
  })

  paint()

  return {
    get value () { return value },
    get id () { return value?.id || null },
    set (photo) { value = photo || null; paint() },
    async setById (id, photos) {
      if (!id) { value = null; paint(); return }
      const from = photos || cachedPhotos || (cachedPhotos = await listPhotos().catch(() => []))
      value = from.find(p => p.id === id) || null
      paint()
    },
  }
}


function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
