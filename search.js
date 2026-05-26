import { supabase } from './supabase.js'

const tbody = document.getElementById('results')
const searchInput = document.getElementById('search-input')
const toast = document.getElementById('toast')

let allBooks = []
let activeGroup = 'all'

async function loadBooks() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('title')

  if (error) { showToast('Error loading books', true); return }
  allBooks = data || []
  render()
}

function render() {
  const query = searchInput.value.toLowerCase().trim()
  let filtered = allBooks

  if (activeGroup !== 'all') {
    filtered = filtered.filter(b => b.age_group === activeGroup)
  }
  if (query) {
    filtered = filtered.filter(b =>
      b.title?.toLowerCase().includes(query) ||
      b.author?.toLowerCase().includes(query)
    )
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">📭</div><p>No books found</p></div></td></tr>`
    return
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td class="td-title">${esc(b.title)}</td>
      <td class="td-author">${esc(b.author || '—')}</td>
      <td>${esc(b.age_group || '—')}</td>
      <td class="td-qty ${b.quantity <= 2 ? 'low' : ''}">${b.quantity}</td>
      <td>€${fmt(b.price_bought)}</td>
      <td>€${fmt(b.price_sold)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon" onclick="editBook('${b.id}')">✏️</button>
          <button class="btn-icon danger" onclick="deleteBook('${b.id}', '${esc(b.title)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('')
}

window.editBook = (id) => {
  location.href = `add-book.html?id=${id}`
}

window.deleteBook = async (id, title) => {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) { showToast('Error deleting book', true); return }
  showToast(`"${title}" removed`)
  loadBooks()
}

function showToast(msg, isError = false) {
  toast.textContent = msg
  toast.className = 'toast' + (isError ? ' error' : '')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function fmt(n) { return Number(n || 0).toFixed(2) }

// Filters
document.getElementById('filters').addEventListener('click', e => {
  if (!e.target.matches('.filter-btn')) return
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
  e.target.classList.add('active')
  activeGroup = e.target.dataset.group
  render()
})

searchInput.addEventListener('input', render)

loadBooks()
