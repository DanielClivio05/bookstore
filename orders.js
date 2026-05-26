import { supabase } from './supabase.js'

let allBooks = []
const thresholdInput = document.getElementById('threshold')
const tbody = document.getElementById('order-list')
const note = document.getElementById('order-note')

async function loadBooks() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('title')

  if (error) { console.error(error); return }
  allBooks = data || []
  render()
}

function render() {
  const threshold = parseInt(thresholdInput.value) || 3
  const lowBooks = allBooks.filter(b => (b.quantity || 0) < threshold)

  if (lowBooks.length === 0) {
    note.textContent = `All books are well stocked (${threshold}+ copies each).`
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-icon">✅</div><p>Nothing to reorder right now</p></div></td></tr>`
    return
  }

  note.textContent = `${lowBooks.length} book${lowBooks.length > 1 ? 's' : ''} need restocking.`

  tbody.innerHTML = lowBooks.map(b => {
    const suggested = threshold - (b.quantity || 0) + 5
    return `
      <tr>
        <td style="font-weight:500">${esc(b.title)}</td>
        <td style="color:var(--muted)">${esc(b.author || '—')}</td>
        <td>${esc(b.age_group || '—')}</td>
        <td style="color:var(--danger);font-weight:600">${b.quantity}</td>
        <td>
          <input type="number" value="${suggested}" min="1"
            style="width:60px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit">
        </td>
      </tr>
    `
  }).join('')
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

thresholdInput.addEventListener('input', render)
loadBooks()
