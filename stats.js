import { supabase } from './supabase.js'

async function loadStats() {
  const { data, error } = await supabase.from('books').select('*')
  if (error) { console.error(error); return }

  const books = data || []

  // Top-level stats
  const totalTitles = books.length
  const totalStock = books.reduce((s, b) => s + (b.quantity || 0), 0)
  const totalCost = books.reduce((s, b) => s + (b.price_bought || 0) * (b.quantity || 0), 0)
  const totalValue = books.reduce((s, b) => s + (b.price_sold || 0) * (b.quantity || 0), 0)

  document.getElementById('stat-titles').textContent = totalTitles
  document.getElementById('stat-stock').textContent = totalStock
  document.getElementById('stat-cost').textContent = '€' + totalCost.toFixed(2)
  document.getElementById('stat-value').textContent = '€' + totalValue.toFixed(2)

  // Low stock alert
  const lowStock = books.filter(b => b.quantity <= 2)
  const alertEl = document.getElementById('low-stock-alert')
  if (lowStock.length > 0) {
    alertEl.style.display = 'block'
    alertEl.className = 'alert'
    alertEl.innerHTML = `⚠️ ${lowStock.length} book${lowStock.length > 1 ? 's' : ''} running low on stock: ${lowStock.map(b => `<strong>${b.title}</strong>`).join(', ')}`
  }

  // Group breakdown
  const groups = {}
  const groupOrder = ['Children (0–5)', 'Children (6–12)', 'Young Adult', 'Adult']

  books.forEach(b => {
    const g = b.age_group || 'Unknown'
    if (!groups[g]) groups[g] = { titles: 0, copies: 0, value: 0 }
    groups[g].titles++
    groups[g].copies += b.quantity || 0
    groups[g].value += (b.price_sold || 0) * (b.quantity || 0)
  })

  const tbody = document.getElementById('group-stats')
  const orderedGroups = [
    ...groupOrder.filter(g => groups[g]),
    ...Object.keys(groups).filter(g => !groupOrder.includes(g))
  ]

  if (orderedGroups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="empty-icon">📊</div><p>No inventory yet</p></div></td></tr>`
    return
  }

  tbody.innerHTML = orderedGroups.map(g => `
    <tr>
      <td style="font-weight:500">${g}</td>
      <td>${groups[g].titles}</td>
      <td>${groups[g].copies}</td>
      <td>€${groups[g].value.toFixed(2)}</td>
    </tr>
  `).join('')
}

loadStats()
