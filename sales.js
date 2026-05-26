import { supabase } from './supabase.js'

const form = document.getElementById('sale-form')
const toast = document.getElementById('toast')
const titleInput = document.getElementById('title')
const dropdown = document.getElementById('title-dropdown')
const bookIdInput = document.getElementById('book-id')
const authorInput = document.getElementById('author')
const quantityInput = document.getElementById('quantity_sold')
const costInput = document.getElementById('cost_price')
const saleInput = document.getElementById('sale_price')
const dateInput = document.getElementById('date_sold')
const notesInput = document.getElementById('notes')
const submitBtn = document.getElementById('submit-btn')
const qtyError = document.getElementById('quantity-error')
const historySearch = document.getElementById('history-search')
const filterFrom = document.getElementById('filter-from')
const filterTo = document.getElementById('filter-to')
const historyBody = document.getElementById('history-body')
const totalUnitsEl = document.getElementById('total-units')
const totalRevenueEl = document.getElementById('total-revenue')
const totalProfitEl = document.getElementById('total-profit')
const dateRangeError = document.getElementById('date-range-error')

let selectedBook = null
let searchTimeout = null
let isSubmitting = false
let allSales = []
let historyLoading = true
let historyLoadFailed = false
let isDeletingSale = false

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function setDefaultDate() {
  const today = todayISO()
  dateInput.max = today
  dateInput.value = today
}

setDefaultDate()

titleInput.addEventListener('input', () => {
  const val = titleInput.value.trim()
  if (selectedBook && val !== selectedBook.title) {
    clearBookSelection(false)
  }
  if (val.length < 2) {
    hideDropdown()
    return
  }
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchBooks(val), 250)
})

titleInput.addEventListener('focus', () => {
  const val = titleInput.value.trim()
  if (val.length >= 2) searchBooks(val)
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrap')) hideDropdown()
})

quantityInput.addEventListener('input', validateQuantity)
dateInput.addEventListener('change', validateDate)

async function searchBooks(query) {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, price_bought, price_sold, quantity')
      .ilike('title', `%${query}%`)
      .order('title')
      .limit(8)

    if (error) {
      showToast('Error searching books', true)
      return
    }
    renderDropdown(data || [])
  } catch {
    showToast('Error searching books', true)
  }
}

function renderDropdown(books) {
  if (books.length === 0) {
    dropdown.innerHTML = '<div class="autocomplete-empty">No books found</div>'
  } else {
    dropdown.innerHTML = books.map(b => `
      <button type="button" class="autocomplete-item" data-id="${b.id}">
        <span class="autocomplete-item-title">${escapeHtml(b.title)}</span>
        <span class="autocomplete-item-meta">${escapeHtml(b.author || 'Unknown author')} · ${b.quantity ?? 0} in stock</span>
      </button>
    `).join('')

    dropdown.querySelectorAll('.autocomplete-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const book = books.find(b => String(b.id) === btn.dataset.id)
        if (book) selectBook(book)
      })
    })
  }
  dropdown.hidden = false
}

function selectBook(book) {
  selectedBook = book
  bookIdInput.value = book.id
  titleInput.value = book.title
  authorInput.value = book.author || ''
  costInput.value = book.price_bought ?? ''
  saleInput.value = book.price_sold ?? ''
  hideDropdown()
  validateQuantity()
}

function clearBookSelection(clearTitle = true) {
  selectedBook = null
  bookIdInput.value = ''
  if (clearTitle) titleInput.value = ''
  authorInput.value = ''
  costInput.value = ''
  saleInput.value = ''
  validateQuantity()
}

function getQuantityValidation(book, qtyRaw) {
  if (!book) {
    return { ok: false, message: '', blockSubmit: false }
  }

  const stock = book.quantity ?? 0
  if (stock === 0) {
    return { ok: false, message: 'This book is out of stock', blockSubmit: true }
  }

  if (qtyRaw === '') {
    return { ok: false, message: '', blockSubmit: false }
  }

  const qty = parseInt(qtyRaw, 10)
  if (isNaN(qty) || qty < 1) {
    return { ok: false, message: 'Enter at least 1', blockSubmit: true }
  }

  if (qty > stock) {
    return { ok: false, message: `Only ${stock} in stock`, blockSubmit: true }
  }

  return { ok: true, message: '', blockSubmit: false }
}

function validateQuantity() {
  const result = getQuantityValidation(selectedBook, quantityInput.value)

  if (result.message) {
    qtyError.textContent = result.message
    qtyError.hidden = false
  } else {
    qtyError.textContent = ''
    qtyError.hidden = true
  }

  submitBtn.disabled = result.blockSubmit
}

function validateDate() {
  if (dateInput.value > todayISO()) {
    dateInput.value = todayISO()
    showToast('Date sold cannot be in the future', true)
  }
}

function hasValidBookSelection() {
  return (
    selectedBook &&
    bookIdInput.value &&
    String(bookIdInput.value) === String(selectedBook.id) &&
    titleInput.value.trim() === selectedBook.title
  )
}

function finishSubmit() {
  isSubmitting = false
  submitBtn.textContent = 'Log Sale'
  validateQuantity()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  if (isSubmitting) return

  if (!hasValidBookSelection()) {
    showToast('Please select a book from the list', true)
    return
  }

  if (dateInput.value > todayISO()) {
    showToast('Date sold cannot be in the future', true)
    return
  }

  const rawCost = parseFloat(costInput.value)
  const rawSale = parseFloat(saleInput.value)
  if (Number.isNaN(rawCost) || Number.isNaN(rawSale)) {
    showToast('Please enter valid prices before submitting.', true)
    return
  }

  const quantitySold = parseInt(quantityInput.value, 10)
  const inlineQty = getQuantityValidation(selectedBook, quantityInput.value)
  if (!inlineQty.ok) {
    if (inlineQty.message) {
      qtyError.textContent = inlineQty.message
      qtyError.hidden = false
      showToast(inlineQty.message, true)
    }
    submitBtn.disabled = true
    return
  }

  isSubmitting = true
  submitBtn.disabled = true
  submitBtn.textContent = 'Saving…'

  try {
    const { data: book, error: fetchError } = await supabase
      .from('books')
      .select('id, title, quantity')
      .eq('id', bookIdInput.value)
      .single()

    if (fetchError || !book) {
      showToast('Book not found. Please select again.', true)
      clearBookSelection(false)
      return
    }

    if (book.title !== titleInput.value.trim()) {
      showToast('Please select a book from the list', true)
      clearBookSelection(false)
      return
    }

    const stock = book.quantity ?? 0
    if (stock === 0) {
      selectedBook = { ...selectedBook, quantity: 0 }
      qtyError.textContent = 'This book is out of stock'
      qtyError.hidden = false
      showToast('This book is out of stock', true)
      return
    }

    if (!Number.isInteger(quantitySold) || quantitySold < 1) {
      qtyError.textContent = 'Enter at least 1'
      qtyError.hidden = false
      showToast('Enter at least 1', true)
      return
    }

    if (quantitySold > stock) {
      selectedBook = { ...selectedBook, quantity: stock }
      qtyError.textContent = `Only ${stock} in stock`
      qtyError.hidden = false
      showToast(`Only ${stock} in stock`, true)
      return
    }

    const payload = {
      book_id: bookIdInput.value,
      book_title: titleInput.value.trim(),
      author: authorInput.value.trim() || null,
      quantity_sold: quantitySold,
      cost_price: Number.isNaN(rawCost) ? null : rawCost,
      sale_price: Number.isNaN(rawSale) ? null : rawSale,
      date_sold: dateInput.value,
      notes: notesInput.value.trim() || null
    }

    const { data: inserted, error: insertError } = await supabase
      .from('sales')
      .insert([payload])
      .select('id')
      .single()

    if (insertError || !inserted) {
      showToast('Error recording sale', true)
      return
    }

    const newQty = stock - quantitySold
    const { error: updateError } = await supabase
      .from('books')
      .update({ quantity: newQty })
      .eq('id', bookIdInput.value)

    if (updateError) {
      const { error: rollbackError } = await supabase
        .from('sales')
        .delete()
        .eq('id', inserted.id)

      if (rollbackError) {
        showToast('Error updating stock. Sale may need manual cleanup.', true)
      } else {
        showToast('Error updating stock. Sale was not saved.', true)
      }
      return
    }

    showToast('Sale recorded!')
    resetForm()
    await loadSalesHistory()
  } catch {
    showToast('Error recording sale', true)
  } finally {
    if (isSubmitting) finishSubmit()
  }
})

function resetForm() {
  form.reset()
  setDefaultDate()
  selectedBook = null
  bookIdInput.value = ''
  hideDropdown()
  qtyError.textContent = ''
  qtyError.hidden = true
  isSubmitting = false
  submitBtn.disabled = false
  submitBtn.textContent = 'Log Sale'
}

function hideDropdown() {
  dropdown.hidden = true
  dropdown.innerHTML = ''
}

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

function fmtEuro(n) {
  return '€' + Number(n || 0).toFixed(2)
}

function saleProfit(sale) {
  const cost = Number(sale.cost_price) || 0
  const price = Number(sale.sale_price) || 0
  const qty = Number(sale.quantity_sold) || 0
  return (price - cost) * qty
}

function formatDateSold(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString()
}

function isDateRangeInvalid() {
  const from = filterFrom.value
  const to = filterTo.value
  return Boolean(from && to && to < from)
}

function saleToPayload(sale) {
  return {
    id: sale.id,
    book_id: sale.book_id,
    book_title: sale.book_title,
    author: sale.author,
    quantity_sold: sale.quantity_sold,
    cost_price: sale.cost_price,
    sale_price: sale.sale_price,
    date_sold: sale.date_sold,
    notes: sale.notes
  }
}

function formatNotes(notes) {
  if (notes == null || String(notes).trim() === '') return '—'
  return escapeHtml(String(notes).trim())
}

function getFilteredSales() {
  if (historyLoading || historyLoadFailed || isDateRangeInvalid()) {
    return []
  }

  const query = historySearch.value.toLowerCase().trim()
  const from = filterFrom.value
  const to = filterTo.value

  return allSales.filter(sale => {
    if (query && !sale.book_title?.toLowerCase().includes(query)) return false
    if (from && sale.date_sold < from) return false
    if (to && sale.date_sold > to) return false
    return true
  })
}

function setHistoryTotals(units, revenue, profit, { loading = false } = {}) {
  if (loading) {
    totalUnitsEl.textContent = '—'
    totalRevenueEl.textContent = '—'
    totalProfitEl.textContent = '—'
    totalProfitEl.classList.remove('negative')
    return
  }
  totalUnitsEl.textContent = units
  totalRevenueEl.textContent = fmtEuro(revenue)
  totalProfitEl.textContent = fmtEuro(profit)
  totalProfitEl.classList.toggle('negative', profit < 0)
}

function renderHistoryLoading() {
  setHistoryTotals(0, 0, 0, { loading: true })
  dateRangeError.hidden = true
  historyBody.innerHTML = `
    <tr><td colspan="9">
      <div class="empty"><div class="empty-icon">⏳</div><p>Loading sales…</p></div>
    </td></tr>`
}

function renderSalesHistory() {
  if (historyLoading) {
    renderHistoryLoading()
    return
  }

  if (historyLoadFailed) {
    setHistoryTotals(0, 0, 0, { loading: true })
    dateRangeError.hidden = true
    historyBody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty"><div class="empty-icon">⚠️</div><p>Could not load sales history</p></div>
      </td></tr>`
    return
  }

  const invalidRange = isDateRangeInvalid()
  if (invalidRange) {
    dateRangeError.textContent = '"To" date must be on or after the "From" date.'
    dateRangeError.hidden = false
  } else {
    dateRangeError.hidden = true
    dateRangeError.textContent = ''
  }

  const filtered = getFilteredSales()

  let units = 0
  let revenue = 0
  let profit = 0

  for (const sale of filtered) {
    const qty = Number(sale.quantity_sold) || 0
    const price = Number(sale.sale_price) || 0
    units += qty
    revenue += price * qty
    profit += saleProfit(sale)
  }

  setHistoryTotals(units, revenue, profit)

  if (allSales.length === 0) {
    historyBody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty"><div class="empty-icon">📋</div><p>No sales recorded yet</p></div>
      </td></tr>`
    return
  }

  if (invalidRange) {
    historyBody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty"><div class="empty-icon">📅</div><p>Fix the date range to see results</p></div>
      </td></tr>`
    return
  }

  if (filtered.length === 0) {
    historyBody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty"><div class="empty-icon">🔍</div><p>No sales match your filters</p></div>
      </td></tr>`
    return
  }

  const deleteDisabled = isDeletingSale ? 'disabled' : ''

  historyBody.innerHTML = filtered.map(sale => {
    const profitVal = saleProfit(sale)
    const profitClass = profitVal < 0 ? 'td-profit negative' : 'td-profit'
    return `
      <tr>
        <td>${escapeHtml(formatDateSold(sale.date_sold))}</td>
        <td class="td-title">${escapeHtml(sale.book_title || '—')}</td>
        <td class="td-author">${escapeHtml(sale.author || '—')}</td>
        <td class="td-qty">${sale.quantity_sold}</td>
        <td>${fmtEuro(sale.cost_price)}</td>
        <td>${fmtEuro(sale.sale_price)}</td>
        <td class="${profitClass}">${fmtEuro(profitVal)}</td>
        <td>${formatNotes(sale.notes)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn-icon danger" data-delete-sale="${escapeHtml(sale.id)}" ${deleteDisabled}>🗑️</button>
          </div>
        </td>
      </tr>
    `
  }).join('')
}

async function loadSalesHistory() {
  historyLoading = true
  historyLoadFailed = false
  renderSalesHistory()

  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('date_sold', { ascending: false })

    if (error) {
      historyLoadFailed = true
      showToast('Error loading sales history', true)
      return
    }

    allSales = data || []
  } catch {
    historyLoadFailed = true
    showToast('Error loading sales history', true)
  } finally {
    historyLoading = false
    renderSalesHistory()
  }
}

function beginDeleteSale() {
  isDeletingSale = true
  historyBody.querySelectorAll('[data-delete-sale]').forEach(btn => {
    btn.disabled = true
  })
}

function endDeleteSale() {
  isDeletingSale = false
  renderSalesHistory()
}

async function deleteSale(saleId) {
  if (isDeletingSale || historyLoading) return

  const sale = allSales.find(s => String(s.id) === String(saleId))
  if (!sale) return

  const qty = sale.quantity_sold
  const title = sale.book_title || 'this book'
  const canRestore = Boolean(sale.book_id)

  let msg
  if (canRestore) {
    msg = `Are you sure? This will restore ${qty} copies of "${title}" to inventory.`
  } else {
    msg = `Are you sure? "${title}" is no longer in inventory — the sale will be removed but stock cannot be restored.`
  }
  if (!confirm(msg)) return

  beginDeleteSale()

  try {
    const salePayload = saleToPayload(sale)

    const { error: deleteError } = await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id)

    if (deleteError) {
      showToast('Error deleting sale', true)
      return
    }

    if (!canRestore) {
      showToast('Sale deleted (inventory not restored — book unavailable)')
      await loadSalesHistory()
      return
    }

    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('quantity')
      .eq('id', sale.book_id)
      .single()

    if (bookError || !book) {
      const { error: rollbackError } = await supabase.from('sales').insert([salePayload])
      if (rollbackError) {
        showToast('Book not found and sale rollback failed. Check records.', true)
      } else {
        showToast('Book not found — sale was not deleted', true)
      }
      return
    }

    const previousQty = book.quantity ?? 0
    const restoredQty = previousQty + qty

    const { error: updateError } = await supabase
      .from('books')
      .update({ quantity: restoredQty })
      .eq('id', sale.book_id)

    if (updateError) {
      const { error: rollbackError } = await supabase.from('sales').insert([salePayload])
      if (rollbackError) {
        showToast('Restore failed and sale rollback failed. Check inventory.', true)
      } else {
        showToast('Error restoring inventory. Sale was not deleted.', true)
      }
      return
    }

    showToast('Sale deleted')
    await loadSalesHistory()
  } catch {
    showToast('Error deleting sale', true)
    endDeleteSale()
  } finally {
    if (isDeletingSale) {
      isDeletingSale = false
      renderSalesHistory()
    }
  }
}

historySearch.addEventListener('input', renderSalesHistory)
filterFrom.addEventListener('change', renderSalesHistory)
filterTo.addEventListener('change', renderSalesHistory)

historyBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete-sale]')
  if (btn) {
    deleteSale(btn.dataset.deleteSale).catch(() => {
      showToast('Error deleting sale', true)
      endDeleteSale()
    })
  }
})

loadSalesHistory()
