// Website text editor — writes the site_content rows the public landing page reads.
//
// The landing page picks a value with: italian ? (value_it || value_en) : (value_en || value_it)
// so anything left blank in Italian quietly falls back to the English text.
// That's why some fields below are single-box: an address or an Instagram URL
// doesn't need translating.

import { requireAuth } from './auth.js'
import { supabase } from './supabase.js'

await requireAuth()

const toast       = document.getElementById('toast')
const form        = document.getElementById('content-form')
const groupsEl    = document.getElementById('groups')
const saveBtn     = document.getElementById('save-btn')
const saveNote    = document.getElementById('save-note')
const setupNotice = document.getElementById('setup-notice')

// Keys must match exactly what landing/index.html looks up.
const GROUPS = [
  {
    title: 'About',
    sub: 'The two columns of text in the About section.',
    items: [
      { key: 'about_col_1', label: 'First column',  type: 'textarea', bilingual: true },
      { key: 'about_col_2', label: 'Second column', type: 'textarea', bilingual: true },
    ],
  },
  {
    title: 'Tongue twisters',
    sub: 'Three short lines. They show as playful cards on the site.',
    items: [
      { key: 'twister_1', label: 'Tongue twister 1', type: 'text', bilingual: true },
      { key: 'twister_2', label: 'Tongue twister 2', type: 'text', bilingual: true },
      { key: 'twister_3', label: 'Tongue twister 3', type: 'text', bilingual: true },
    ],
  },
  {
    title: 'Find us',
    sub: 'Shown at the bottom of the page.',
    items: [
      { key: 'visit_address', label: 'Address', type: 'text', bilingual: false,
        hint: 'e.g. Corso XXV Aprile 44, 21026 Gavirate (VA)' },
      { key: 'visit_hours',   label: 'Opening hours', type: 'text', bilingual: true,
        hint: 'e.g. Tue–Sat 9:30–12:30 · 15:30–19:00' },
      { key: 'visit_contact', label: 'Phone or email shown on the page', type: 'text', bilingual: false },
    ],
  },
  {
    title: 'Social links',
    sub: 'Leave one blank and that icon simply disappears from the site.',
    items: [
      { key: 'social_instagram', label: 'Instagram', type: 'url',   bilingual: false, hint: 'Full link, starting with https://' },
      { key: 'social_facebook',  label: 'Facebook',  type: 'url',   bilingual: false, hint: 'Full link, starting with https://' },
      { key: 'social_email',     label: 'Email',     type: 'email', bilingual: false, hint: 'Just the address — the site turns it into a mail link.' },
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap(g => g.items)
let original = {}


// ===== BUILD THE FORM =====

function buildForm () {
  groupsEl.innerHTML = ''

  for (const group of GROUPS) {
    const wrap = document.createElement('div')
    wrap.className = 'group'

    const title = document.createElement('div')
    title.className = 'group-title'
    title.textContent = group.title

    const sub = document.createElement('div')
    sub.className = 'group-sub'
    sub.textContent = group.sub

    wrap.append(title, sub)

    for (const item of group.items) {
      wrap.appendChild(buildField(item))
    }
    groupsEl.appendChild(wrap)
  }
}

function buildField (item) {
  const field = document.createElement('div')
  field.className = 'field'

  const label = document.createElement('label')
  label.textContent = item.label
  field.appendChild(label)

  const langs = document.createElement('div')
  langs.className = 'langs' + (item.bilingual ? '' : ' single')

  langs.appendChild(buildInput(item, 'en'))
  if (item.bilingual) langs.appendChild(buildInput(item, 'it'))

  field.appendChild(langs)

  if (item.hint) {
    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = item.hint
    field.appendChild(hint)
  }
  return field
}

function buildInput (item, lang) {
  const box = document.createElement('div')
  box.className = 'lang'

  const id = `${item.key}__${lang}`

  if (item.bilingual) {
    const tag = document.createElement('span')
    tag.className = 'lang-tag'
    tag.textContent = lang === 'en' ? 'English' : 'Italiano'
    box.appendChild(tag)
  }

  const input = item.type === 'textarea'
    ? document.createElement('textarea')
    : document.createElement('input')

  if (item.type === 'textarea') input.rows = 4
  else input.type = item.type

  input.id = id
  input.dataset.key = item.key
  input.dataset.lang = lang
  input.setAttribute('aria-label', `${item.label} (${lang === 'en' ? 'English' : 'Italian'})`)

  box.appendChild(input)
  return box
}


// ===== LOAD =====

async function load () {
  const { data, error } = await supabase.from('site_content').select('*')

  if (error) {
    setupNotice.hidden = false
    groupsEl.innerHTML = ''
    showToast('Could not load the website text', true)
    return
  }

  buildForm()

  const byKey = Object.fromEntries((data || []).map(r => [r.key, r]))
  original = {}

  for (const item of ALL_ITEMS) {
    const row = byKey[item.key] || {}
    for (const lang of ['en', 'it']) {
      const el = document.getElementById(`${item.key}__${lang}`)
      if (!el) continue
      const value = row[`value_${lang}`] || ''
      el.value = value
      original[`${item.key}__${lang}`] = value
    }
  }

  updateNote()
  form.addEventListener('input', updateNote)
}

function changedKeys () {
  const dirty = new Set()
  for (const item of ALL_ITEMS) {
    for (const lang of ['en', 'it']) {
      const el = document.getElementById(`${item.key}__${lang}`)
      if (!el) continue
      if (el.value.trim() !== (original[`${item.key}__${lang}`] || '').trim()) dirty.add(item.key)
    }
  }
  return [...dirty]
}

function updateNote () {
  const n = changedKeys().length
  saveNote.textContent = n === 0
    ? 'No unsaved changes'
    : `${n} ${n === 1 ? 'item' : 'items'} changed`
}


// ===== SAVE =====

form.addEventListener('submit', async e => {
  e.preventDefault()

  const keys = changedKeys()
  if (!keys.length) { showToast('Nothing to save'); return }

  // Only send what actually changed, so one bad field can't wipe the rest.
  const rows = keys.map(key => {
    const item = ALL_ITEMS.find(i => i.key === key)
    const en = document.getElementById(`${key}__en`)
    const it = item.bilingual ? document.getElementById(`${key}__it`) : null
    return {
      key,
      value_en: en.value.trim() || null,
      value_it: it ? (it.value.trim() || null) : null,
      updated_at: new Date().toISOString(),
    }
  })

  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'

  // Update each row by key, and insert it if the row doesn't exist yet.
  // Deliberately not upsert() — that would assume a unique constraint on `key`.
  const saved = []
  let failed = 0

  for (const row of rows) {
    const { data, error } = await supabase
      .from('site_content')
      .update({ value_en: row.value_en, value_it: row.value_it, updated_at: row.updated_at })
      .eq('key', row.key)
      .select('key')

    if (!error && data && data.length) { saved.push(row); continue }

    if (!error && (!data || !data.length)) {
      const { error: insertError } = await supabase.from('site_content').insert([row])
      if (!insertError) { saved.push(row); continue }
    }
    failed++
  }

  saveBtn.disabled = false
  saveBtn.textContent = 'Save changes'

  for (const row of saved) {
    original[`${row.key}__en`] = row.value_en || ''
    original[`${row.key}__it`] = row.value_it || ''
  }
  updateNote()

  if (failed) {
    showToast(
      saved.length
        ? `Saved ${saved.length}, but ${failed} failed — check you are still signed in`
        : 'Could not save — check you are still signed in',
      true
    )
    return
  }

  showToast(`Saved — ${saved.length === 1 ? 'it is' : 'they are'} live on the website now`)
})

// Catch her closing the tab mid-edit.
window.addEventListener('beforeunload', e => {
  if (changedKeys().length) { e.preventDefault(); e.returnValue = '' }
})


// ===== HELPERS =====

function showToast (msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}


load()
