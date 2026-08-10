# Self-hosted fonts

The site currently loads its three typefaces from Google Fonts. That sends every
visitor's IP address to Google, which is the one real GDPR exposure the site has —
a Munich court awarded damages over exactly this in 2022, specifically because
self-hosting is free and therefore "legitimate interest" doesn't hold up.

Hosting the files ourselves removes the issue completely, drops Google from the
privacy policy, and makes the page load slightly faster.

## What Daniel needs to do (about two minutes)

Download the three families from Google Fonts and drop the unzipped `.ttf`
files anywhere in this folder. Subfolders are fine — the build script searches
recursively.

- https://fonts.google.com/specimen/Zilla+Slab
- https://fonts.google.com/specimen/Caveat
- https://fonts.google.com/specimen/Nunito

On each page use the **"Get font"** button, then **"Download all"**. You'll get a
zip per family; unzip them in here. Don't worry about which weights — the script
picks the ones the site actually uses and ignores the rest.

## What happens next

    python3 build-fonts.py

This converts only the needed weights to WOFF2 (roughly a quarter the size of
TTF), writes `fonts.css`, and prints the two edits needed in the HTML.

## Weights the site actually uses

| Family     | Weights            | Italic |
|------------|--------------------|--------|
| Zilla Slab | 500, 600, 700      | no     |
| Caveat     | 600, 700           | no     |
| Nunito     | 400, 600, 700, 800 | 400    |

Anything else in the download is skipped — no point shipping bytes nobody loads.
