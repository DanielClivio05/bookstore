// notify-signup — e-mails the shop when somebody books on the website.
//
// Fired by a Supabase Database Webhook on INSERT into public.signups.
// The webhook sends the new row; this function looks up which sessions the
// booking covers and sends one tidy e-mail through Resend.
//
// Setup lives in SIGNUPS-SETUP.md. In short:
//   supabase secrets set RESEND_API_KEY=re_... NOTIFY_TO=booknooklane@gmail.com \
//                        NOTIFY_FROM="Book Nook Lane <bookings@booknooklane.com>" \
//                        WEBHOOK_SECRET=<a long random string>
//   supabase functions deploy notify-signup
//
// If RESEND_API_KEY is missing the function logs and returns 200 rather than
// failing — a booking must never be lost because the e-mail step is broken.

const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')      ?? ''
const NOTIFY_TO   = Deno.env.get('NOTIFY_TO')           ?? 'booknooklane@gmail.com'
const NOTIFY_FROM = Deno.env.get('NOTIFY_FROM')         ?? 'Book Nook Lane <onboarding@resend.dev>'
const SECRET      = Deno.env.get('WEBHOOK_SECRET')      ?? ''
const ADMIN_URL   = Deno.env.get('ADMIN_URL')           ?? 'https://moms-bookstore.netlify.app/signups.html'

const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const euro = (n: number) =>
  '€' + Number(n || 0).toFixed(2).replace(/\.00$/, '')

async function sb (path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

Deno.serve(async req => {
  // The webhook is a public URL, so make sure the caller is ours.
  if (SECRET && req.headers.get('x-webhook-secret') !== SECRET) {
    return new Response('nope', { status: 401 })
  }

  let booking: Record<string, unknown>
  try {
    const body = await req.json()
    booking = body.record ?? body          // webhook payload, or a manual test
    if (!booking?.id) throw new Error('no booking id in payload')
  } catch (err) {
    console.error('bad payload:', err)
    return new Response('bad payload', { status: 400 })
  }

  try {
    const items = await sb(
      `signup_items?select=participants,unit_price,event_id&signup_id=eq.${booking.id}`)

    const ids = [...new Set(items.map((i: any) => i.event_id))]
    const events = ids.length
      ? await sb(`events?select=id,name,date,time&id=in.(${ids.join(',')})`)
      : []
    const byId = new Map(events.map((e: any) => [e.id, e]))

    let total = 0
    const lines = items.map((i: any) => {
      const ev  = byId.get(i.event_id) as any
      const due = (Number(i.unit_price) || 0) * i.participants
      total += due
      const when = ev
        ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-GB',
            { weekday: 'short', day: 'numeric', month: 'long' }) + (ev.time ? ` · ${ev.time}` : '')
        : ''
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E6E0D6">
          <b>${esc(ev?.name ?? 'Unknown session')}</b><br>
          <span style="color:#5F6873;font-size:13px">${esc(when)}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #E6E0D6;text-align:center">${i.participants}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E6E0D6;text-align:right">${
          i.unit_price == null ? 'Free' : euro(due)}</td>
      </tr>`
    }).join('')

    const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#2A2E33;max-width:560px">
        <h2 style="font-family:Georgia,serif;color:#5B7189;margin:0 0 4px">New booking</h2>
        <p style="margin:0 0 20px;color:#5F6873">
          ${esc(booking.full_name)} has booked ${items.length} session${items.length === 1 ? '' : 's'}.
        </p>

        <table style="border-collapse:collapse;width:100%;font-size:14px;
                      border:1px solid #E6E0D6;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#FBF9F5">
              <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:.05em;
                         text-transform:uppercase;color:#5F6873">Session</th>
              <th style="padding:8px 12px;font-size:11px;letter-spacing:.05em;
                         text-transform:uppercase;color:#5F6873">People</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:.05em;
                         text-transform:uppercase;color:#5F6873">Due</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
          <tfoot>
            <tr style="background:#FBF9F5">
              <td colspan="2" style="padding:10px 12px;font-weight:600">Total, payable on the day</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700">${euro(total)}</td>
            </tr>
          </tfoot>
        </table>

        <table style="margin-top:22px;font-size:14px;line-height:1.7">
          <tr><td style="color:#5F6873;padding-right:16px">Name</td><td>${esc(booking.full_name)}</td></tr>
          <tr><td style="color:#5F6873;padding-right:16px">E-mail</td>
              <td><a href="mailto:${esc(booking.email)}">${esc(booking.email)}</a></td></tr>
          <tr><td style="color:#5F6873;padding-right:16px">Phone</td>
              <td><a href="tel:${esc(booking.phone)}">${esc(booking.phone)}</a></td></tr>
          <tr><td style="color:#5F6873;padding-right:16px">Child’s age</td><td>${esc(booking.child_age)}</td></tr>
          <tr><td style="color:#5F6873;padding-right:16px">School</td><td>${esc(booking.school)}</td></tr>
          <tr><td style="color:#5F6873;padding-right:16px">First visit</td>
              <td>${booking.first_visit ? 'Yes — say hello!' : 'No, they’ve been before'}</td></tr>
        </table>

        <p style="margin-top:26px">
          <a href="${esc(ADMIN_URL)}"
             style="background:#5B7189;color:#fff;text-decoration:none;font-weight:600;
                    padding:11px 22px;border-radius:999px;display:inline-block">
            Open the sign-ups calendar
          </a>
        </p>
      </div>`

    if (!RESEND_KEY) {
      console.log('No RESEND_API_KEY set — booking saved, e-mail skipped.', booking.id)
      return new Response(JSON.stringify({ ok: true, emailed: false }), { status: 200 })
    }

    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        reply_to: String(booking.email ?? ''),
        subject: `New booking — ${booking.full_name} (${items.length} session${
          items.length === 1 ? '' : 's'})`,
        html,
      }),
    })

    if (!sent.ok) {
      // Log loudly, but still 200: the booking is safely in the database and
      // re-running the webhook would not change that.
      console.error('Resend refused:', sent.status, await sent.text())
      return new Response(JSON.stringify({ ok: true, emailed: false }), { status: 200 })
    }

    return new Response(JSON.stringify({ ok: true, emailed: true }), { status: 200 })

  } catch (err) {
    console.error('notify-signup failed:', err)
    return new Response(JSON.stringify({ ok: false }), { status: 200 })
  }
})
