import { supabase } from './supabase.js'

const form = document.getElementById('book-form')
const toast = document.getElementById('toast')
const params = new URLSearchParams(location.search)
const editId = params.get('id')

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
  })
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'

  const isbn = document.getElementById('isbn').value.trim()

  const payload = {
    title:       document.getElementById('title').value.trim(),
    author:      document.getElementById('author').value.trim() || null,
    isbn:        isbn || null,
    age_group:   document.getElementById('age_group').value,
    price_bought: parseFloat(document.getElementById('price_bought').value),
    price_sold:  parseFloat(document.getElementById('price_sold').value),
    quantity:    parseInt(document.getElementById('quantity').value),
    cover_url:   isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null
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
