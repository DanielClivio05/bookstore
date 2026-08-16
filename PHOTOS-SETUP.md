# Pictures — setup

One-time database step, then everything is done from the admin.

## 1. Run the SQL (already done on 16 Aug 2026)

Supabase dashboard → **SQL Editor** → New query → paste `photos.sql` → **Run**.

It creates:

- a `photos` table — one row per picture, with an English and an Italian caption
- `events.photo_id` — the cover picture for an event
- a **public** storage bucket called `photos`, holding the image files

Security matches the rest of the project: the public site may **read** pictures,
and only a signed-in admin may add, edit or delete them. The bucket is public so
image URLs work on the website without a key — that is the only thing "public"
means here.

## 2. That's it

The new **Photos** page in the admin does the rest. There is nothing to
configure, no API key to paste and no image service to sign up for.

## How the pieces fit

A picture is uploaded **once**, on the Photos page, into a shared library.
Everywhere else just points at it:

| Where | Set it on |
|---|---|
| Cover on an event card, and its thumbnail in the booking form | Events page → **Cover picture** |
| The **From our shelves** band on the website | Photos page → **Show on the website shelf** |
| The photo beside the About text | Website page → About → **Picture** |

So the same book cover can be an event cover *and* sit on the shelf without
being uploaded twice.

## What happens to a picture on upload

Everything is done in the browser before anything is sent:

1. resized so the longest edge is at most **1600px**
2. saved as **WebP**, plus a **480px thumbnail** for grids and cards
3. a phone photo of 4–8 MB typically ends up around 60–150 KB

That keeps the free-tier storage small and the website fast on a phone.

## Two things worth knowing

- **iPhone HEIC pictures** can't be read by most browsers. If one is rejected,
  either set the iPhone to *Settings → Camera → Formats → Most Compatible*, or
  send the photo to yourself first — it arrives as a JPEG.
- **Deleting a picture never deletes anything else.** An event that was using it
  simply loses its cover; the event, its price and its bookings are untouched.
  The admin warns you where a picture is in use before it goes.
