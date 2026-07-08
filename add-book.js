import { supabase } from './supabase.js'

const form = document.getElementById('book-form')
const toast = document.getElementById('toast')
const params = new URLSearchParams(location.search)
const editId = params.get('id')

const isbnInput    = document.getElementById('isbn')
const lookupBtn    = document.getElementById('lookup-btn')
const statusEl     = document.getElementById('isbn-status')
const dupWarning   = document.getElementById('dup-warning')
const dupText      = document.getElementById('dup-warning-text')
const dupAddStock  = document.getElementById('dup-add-stock')
const dupEdit      = document.getElementById('dup-edit')
const resultEl     = document.getElementById('lookup-result')
const coverPreview = document.getElementById('cover-preview')
const lookupTitle  = document.getElementById('lookup-title')
const lookupAuthor = document.getElementById('lookup-author')

let fetchedCoverUrl = null   // best cover URL found by the lookup
let duplicateBook   = null   // existing book row matching this ISBN, if any

// If editing, load existing book data
if (editId) {
  document.getElementById('form-title').textContent = 'Edit Book'
  document.getElementById('submit-btn').textContent = 'Save Changes'

  supabase.from('books').select('*').eq('id', editId).single().then(({ data, error }) => {
    if (error || !data) { showToast('Book not found', true); return }
    document.getElementById('book-id').value = data.id
    document.getElementById('title').value = data.title || ''
    document.getElementById('author').value = data.author || ''
    document.getElementById('isbn').value = data.isbn || ''
    document.getElementById('age_group').value = data.age_group || ''
    document.getElementById('price_bought').value = data.price_bought || ''
    document.getElementById('price_sold').value = data.price_sold || ''
    document.getElementById('quantity').value = data.quantity ?? ''
    fetchedCoverUrl = data.cover_url || null
    if (fetchedCoverUrl) showResult(data.title, data.author, fetchedCoverUrl)
  })
}

// ===== ISBN LOOKUP =====

function cleanIsbn(raw) {
  return String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase()
}

function setStatus(msg, kind = '') {
  if (!msg) { statusEl.hidden = true; return }
  statusEl.hidden = false
  statusEl.textContent = msg
  statusEl.className = 'isbn-status' + (kind ? ' ' + kind : '')
}

function showResult(title, author, cover) {
  resultEl.hidden = false
  lookupTitle.textContent = title || 'Unknown title'
  lookupAuthor.textContent = author || ''
  if (cover) {
    coverPreview.hidden = false
    coverPreview.src = cover
  } else {
    coverPreview.hidden = true
  }
}

async function fetchFromGoogleBooks(isbn) {
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
  if (!res.ok) return null
  const json = await res.json()
  const info = json.items?.[0]?.volumeInfo
  if (!info) return null
  return {
    title:  info.title || '',
    author: (info.authors || []).join(', '),
    cover:  info.imageLinks?.thumbnail?.replace(/^http:/, 'https:') || null,
  }
}

async function fetchFromOpenLibrary(isbn) {
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`)
  if (!res.ok) return null
  const json = await res.json()
  const book = json[`ISBN:${isbn}`]
  if (!book) return null
  return {
    title:  book.title || '',
    author: (book.authors || []).map(a => a.name).join(', '),
    cover:  book.cover?.large || book.cover?.medium || null,
  }
}

async function checkDuplicate(isbn) {
  duplicateBook = null
  dupWarning.hidden = true
  if (editId) return // editing an existing book — no duplicate warning needed
  const { data } = await supabase.from('books').select('id,title,quantity').eq('isbn', isbn).limit(1)
  if (data && data.length) {
    duplicateBook = data[0]
    dupText.textContent = `"${duplicateBook.title}" is already in the catalog (${duplicateBook.quantity} in stock).`
    dupWarning.hidden = false
  }
}

let lookupSeq = 0
async function lookupIsbn() {
  const isbn = cleanIsbn(isbnInput.value)
  if (isbn.length !== 10 && isbn.length !== 13) {
    setStatus('Enter a full 10 or 13 digit ISBN', 'error')
    return
  }
  const seq = ++lookupSeq
  setStatus('Looking up…')
  resultEl.hidden = true

  const dupPromise = checkDuplicate(isbn)

  let book = null
  try { book = await fetchFromGoogleBooks(isbn) } catch { /* network hiccup — try fallback */ }
  if (!book) {
    try { book = await fetchFromOpenLibrary(isbn) } catch { /* fallback failed too */ }
  }
  await dupPromise
  if (seq !== lookupSeq) return // a newer lookup superseded this one

  if (!book) {
    setStatus('No match found — you can fill the details in manually below.', 'error')
    fetchedCoverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
    return
  }

  fetchedCoverUrl = book.cover || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
  document.getElementById('title').value = book.title
  document.getElementById('author').value = book.author
  showResult(book.title, book.author, fetchedCoverUrl)
  setStatus('Found ✓ — now set age group, prices and quantity.', 'ok')
  document.getElementById('age_group').focus()
}

lookupBtn.addEventListener('click', lookupIsbn)

// Auto-lookup as soon as a complete ISBN is typed or scanned
isbnInput.addEventListener('input', () => {
  const isbn = cleanIsbn(isbnInput.value)
  if (isbn.length === 13 || isbn.length === 10) lookupIsbn()
  else { setStatus(''); dupWarning.hidden = true }
})

// Barcode scanners typically send Enter after the code — trigger lookup, don't submit
isbnInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); lookupIsbn() }
})

// ===== DUPLICATE ACTIONS =====

dupAddStock.addEventListener('click', async () => {
  if (!duplicateBook) return
  const { error } = await supabase.from('books')
    .update({ quantity: duplicateBook.quantity + 1 })
    .eq('id', duplicateBook.id)
  if (error) { showToast('Error updating stock', true); return }
  duplicateBook.quantity += 1
  dupText.textContent = `"${duplicateBook.title}" — stock updated to ${duplicateBook.quantity}.`
  showToast(`+1 copy of "${duplicateBook.title}" (now ${duplicateBook.quantity})`)
})

dupEdit.addEventListener('click', () => {
  if (duplicateBook) location.href = `add-book.html?id=${duplicateBook.id}`
})

// ===== SAVE =====

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'

  const isbn = cleanIsbn(isbnInput.value)

  const payload = {
    title:       document.getElementById('title').value.trim(),
    author:      document.getElementById('author').value.trim() || null,
    isbn:        isbn || null,
    age_group:   document.getElementById('age_group').value,
    price_bought: parseFloat(document.getElementById('price_bought').value),
    price_sold:  parseFloat(document.getElementById('price_sold').value),
    quantity:    parseInt(document.getElementById('quantity').value),
    cover_url:   fetchedCoverUrl || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null)
  }

  let error

  if (editId) {
    ;({ error } = await supabase.from('books').update(payload).eq('id', editId))
  } else {
    ;({ error } = await supabase.from('books').insert([payload]))
  }

  if (error) {
    showToast('Error saving book', true)
    btn.disabled = false
    btn.textContent = editId ? 'Save Changes' : 'Add Book'
    return
  }

  showToast(editId ? 'Book updated!' : 'Book added!')
  setTimeout(() => location.href = 'index.html', 1200)
})

function showToast(msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}
