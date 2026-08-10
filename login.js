import { supabase } from './supabase.js'

const form     = document.getElementById('login-form')
const emailEl  = document.getElementById('login-email')
const passEl   = document.getElementById('login-password')
const btn      = document.getElementById('login-btn')
const errorEl  = document.getElementById('login-error')

// Only ever redirect to a plain page name in this same folder.
// Stops "?next=https://somewhere-else" from turning the login into an open redirect.
function nextTarget () {
  const raw = new URLSearchParams(location.search).get('next') || 'index.html'
  return /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(raw) ? raw : 'index.html'
}

// Already signed in? Don't make them do it again.
const { data: { session } } = await supabase.auth.getSession()
if (session) location.replace(nextTarget())

function showError (msg) {
  errorEl.textContent = msg
  errorEl.hidden = false
}

form.addEventListener('submit', async e => {
  e.preventDefault()
  errorEl.hidden = true

  const email    = emailEl.value.trim()
  const password = passEl.value

  if (!email || !password) {
    showError('Enter both your email and password.')
    return
  }

  btn.disabled = true
  btn.textContent = 'Signing in…'

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately vague: don't reveal whether the email exists.
    showError(
      /email not confirmed/i.test(error.message)
        ? 'That account still needs confirming in Supabase.'
        : 'Email or password is not right.'
    )
    btn.disabled = false
    btn.textContent = 'Sign in'
    passEl.focus()
    passEl.select()
    return
  }

  location.replace(nextTarget())
})
