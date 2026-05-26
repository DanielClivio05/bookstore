import { supabase } from './supabase.js'

const AGE_GROUPS = ['Children (0–5)', 'Children (6–12)', 'Young Adult', 'Adult']
const GROUP_EMOJI = {
  'Children (0–5)': '🧸',
  'Children (6–12)': '🎒',
  'Young Adult': '🌟',
  'Adult': '📖'
}

async function loadLibrary() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('title')

  const container = document.getElementById('library-content')

  if (error) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">❌</div><p>Error loading library</p></div>`
    return
  }

  const books = data || []
  if (books.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">📚</div><p>No books in inventory yet. <a href="add-book.html" style="color:var(--primary);font-weight:600">Add your first book →</a></p></div>`
    return
  }

  // Group books
  const grouped = {}
  books.forEach(b => {
    const g = b.age_group || 'Other'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(b)
  })

  const orderedGroups = [
    ...AGE_GROUPS.filter(g => grouped[g]),
    ...Object.keys(grouped).filter(g => !AGE_GROUPS.includes(g))
  ]

  container.innerHTML = orderedGroups.map(group => {
    const booksInGroup = grouped[group]
    const emoji = GROUP_EMOJI[group] || '📚'
    return `
      <div class="section-title">${emoji} ${group} <span style="font-size:13px;font-weight:400;color:var(--muted)">(${booksInGroup.length} title${booksInGroup.length !== 1 ? 's' : ''})</span></div>
      <div class="book-grid">
        ${booksInGroup.map(b => bookCard(b)).join('')}
      </div>
    `
  }).join('')
}

function bookCard(b) {
  const coverUrl = b.cover_url || (b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg` : null)
  const coverHtml = coverUrl
    ? `<div class="book-cover"><img src="${coverUrl}" alt="${esc(b.title)}" onerror="this.parentElement.innerHTML='📖'"></div>`
    : `<div class="book-cover">📖</div>`

  return `
    <div class="book-card" onclick="location.href='add-book.html?id=${b.id}'">
      ${coverHtml}
      <div class="book-info">
        <div class="book-info-title">${esc(b.title)}</div>
        <div class="book-info-author">${esc(b.author || '')}</div>
        <div class="book-info-qty">${b.quantity} in stock</div>
      </div>
    </div>
  `
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

loadLibrary()
