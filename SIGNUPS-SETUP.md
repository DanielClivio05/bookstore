# Sign-ups — replacing the Jotform

The booking form now lives on the Book Nook Lane website and writes straight
into the same database the admin uses. No more keeping a form and an events
list in step by hand.

The old Jotform hard-coded the five August sessions into the form itself. This
one reads them out of the **Events** page, so a session created once shows up
on the website, in the booking form, and in the Sign-ups calendar.

---

## What changed

| | |
|---|---|
| **Website** (`landing/index.html`) | Each event card shows its price and how many places are left. **Sign up** opens a bilingual booking sheet listing every open session with a 1–5 people counter and a running total — the same shape as the Jotform. |
| **Events** (`events.html`) | The *Sign-up link* box is gone. In its place: **Price per person**, **Places**, and an **Accepting sign-ups** switch. Each event shows a bar of how full it is. |
| **Sign-ups** (`signups.html`) | New page. A month calendar with every session on its date and a head count; click a day for the full register — who is coming, contact details, child's age, school, first visit, amount due, and a **paid** tick box. Printable, and exports to CSV. |
| **Database** (`signups.sql`) | Two new tables, four new columns on `events`, and one function that takes bookings. Already applied to the live project. |

The form asks exactly what her Jotform asked and nothing more: full name,
e-mail, phone, child's age, first visit yes/no, school, which sessions, and
the terms box. Two fixes came along the way — the Age field no longer carries
Jotform's leftover `Format: (000) 000-0000` placeholder, and the terms box now
actually links to `terms.html` and `privacy.html`.

---

## Already done

- `signups.sql` has been run against the live project.
- The `notify-signup` edge function is deployed (dormant until step 2 below).
- The trigger function is off the public API; only `book_sessions` is callable
  by the website, which is the point of it.

## Still to do

### 1. Put prices and places on the August events

Events → edit each session → **Price per person** and **Places**. The website
starts counting down as soon as places are set. Leave Places blank for no
limit; leave Price blank for a free session.

### 2. Turn on the notification e-mail

She gets nothing by e-mail until this is done — bookings still arrive safely,
they just sit in the Sign-ups page waiting to be noticed.

1. Make a free account at **resend.com** and create an API key.
2. Supabase dashboard → **Edge Functions → notify-signup → Secrets**, add:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | `re_…` from Resend |
   | `NOTIFY_TO` | `booknooklane@gmail.com` |
   | `NOTIFY_FROM` | `Book Nook Lane <bookings@booknooklane.com>` |
   | `WEBHOOK_SECRET` | any long random string |
   | `ADMIN_URL` | `https://moms-bookstore.netlify.app/signups.html` |

   Resend will only send *from* a domain you have verified. Verifying
   `booknooklane.com` is a couple of DNS records at Cloudflare. Until then use
   `Book Nook Lane <onboarding@resend.dev>`, which can only send to your own
   address — fine for testing.

3. Supabase dashboard → **Database → Webhooks → Create a new hook**:

   - Table: `signups`, Events: **Insert**
   - Type: **Supabase Edge Functions** → `notify-signup`
   - HTTP Headers: keep the `Authorization: Bearer <service role key>` header
     the dashboard fills in, and add `x-webhook-secret` set to the same string
     you used above.

4. Book a test place on the website and check the inbox.

### 3. Retire the Jotform

Once a real booking has come through, close the Jotform so nobody uses the old
one. Worth keeping the existing submissions — export them to CSV first.

### 4. Mention it in the privacy policy

This is the one that matters legally. Until now Jotform held the parents'
names, e-mails, phone numbers and children's ages; now Book Nook Lane does, on
Supabase in Frankfurt. The Iubenda policy needs to say so: what is collected,
why, how long it is kept, and how to ask for it to be deleted. Iubenda has a
"booking/reservation" clause that covers most of it.

---

## How it hangs together

The website never touches the `signups` tables directly. It calls one database
function, `book_sessions()`, which checks everything before writing anything:

- the terms box was ticked
- name, e-mail, phone, age and school are present and sane
- every chosen session is published, open, and in the future
- no session is overfilled — the events rows are locked while it counts, so
  two families cannot take the same last place
- that e-mail hasn't already booked that session
- the honeypot field is empty (a hidden box only a bot fills in)
- no more than five bookings an hour from one address

Anything else gets a polite refusal in the visitor's language and nothing is
written. Because bookings only arrive this way, the public key on the website
**cannot read the guest list, edit a booking, or delete one** — verified by
trying all three. `events.spots_taken` is maintained by a database trigger, so
the "places left" on the website can't drift out of step with reality.

If the database can't be reached at all — the free Supabase tier sleeps after
about a week of no traffic — the form doesn't fail silently. It offers a
pre-filled e-mail with all the answers in it instead.

---

## Worth knowing

- **The sleeping database.** Still the biggest risk here, and now it has teeth:
  a paused project means the events list is empty and nobody can book. Worth
  solving before the QR code goes out.
- **Cancellations.** A parent can't cancel their own booking; they have to get
  in touch and she cancels it in the register (the ✕ button), which frees the
  place. A self-service cancel link is doable later if it turns out to matter.
- **Leaked-password protection** is off on the Supabase project. Unrelated to
  this work, one toggle in Authentication → Policies, worth turning on.
