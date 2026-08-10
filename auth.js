// Shared login guard for the admin pages.
//
// Every protected page's module starts with:
//     import { requireAuth } from './auth.js'
//     await requireAuth()
//
// The page's <html> carries class="auth-pending", which hides the body until
// this file clears it. So an unauthenticated visitor never sees the interface,
// and the module below the await never runs.

import { supabase } from './supabase.js'

export async function requireAuth () {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const here = (location.pathname.split('/').pop() || 'index.html') + location.search
    location.replace('login.html?next=' + encodeURIComponent(here))
    // Deliberately never resolves — halts the rest of the page's module.
    await new Promise(() => {})
  }

  document.documentElement.classList.remove('auth-pending')
  mountAccountMenu(session)

  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') location.replace('login.html')
  })

  return session
}

export async function signOut () {
  await supabase.auth.signOut()
  location.replace('login.html')
}

function mountAccountMenu (session) {
  const nav = document.querySelector('.nav-links')
  if (!nav) return

  const wrap = document.createElement('div')
  wrap.className = 'nav-account'

  const email = document.createElement('span')
  email.className = 'nav-email'
  email.textContent = session.user?.email || ''

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'nav-signout'
  btn.textContent = 'Sign out'
  btn.addEventListener('click', signOut)

  wrap.append(email, btn)
  nav.appendChild(wrap)
}
