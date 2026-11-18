# Importing LTFRB board resolutions

LTFRB publishes route approvals as Board Resolutions (BR) in its
[issuances library](https://ltfrb.gov.ph/issuances-library/). Each new or modified route
resolution has an **Annex A** listing the streets for each direction. The admin portal turns one into
LUVYO routes:

**Admin → 📜 LTFRB resolutions**

1. **Upload the PDF** and click **Read it**. The server reads it:
   - with **Claude**, when `ANTHROPIC_API_KEY` is set on the server. This is the most accurate
     option for scanned PDFs and sideways annex tables, at about ₱5–15 per resolution;
   - otherwise from the PDF's **text layer**, if it has one;
   - otherwise with **OCR** (Tesseract, included in the Docker image). OCR reads the header fields
     well (number, series, date, route names, case number, length, units, conditions) but not the
     annex table, so you type the street lists. The streets it did recognise are shown as clickable
     hints.
2. **Check every field against the PDF.** Street lists go one row per line, in travel order, with the
   terminals first and last: `Quirino Highway | Quezon City`. Abbreviations (Ave, Blvd, St, Sta.) are
   fine. **Reverse of westbound** fills the return list when it's the same roads; then edit what
   differs (one-way streets).
3. **Trace route.** For each pair of consecutive streets the server finds where they meet on
   OpenStreetMap, then draws the road path through those corners. This takes about a minute per
   direction. Check:
   - every row has a ✓; for a ✗, fix the spelling, add the missing connecting street, or pin the
     point by hand: `Stop & Shop @14.6019,121.0118` (right-click in Google Maps to copy coordinates);
   - the length against the resolution's (a **check** badge appears when they differ by more than
     15%; resolutions often round, and some measure differently);
   - the map: the line should follow the listed roads without loops.
4. **Create routes.** Two one-way routes are created, `br<year>-<number>-westbound` and
   `-eastbound`, with a stop at each terminal and corner. They are:
   - `sourceType: official`, citing the resolution (e.g. *LTFRB BR No. 383 s. 2026 (Sep 18, 2026)*),
     with the full details (case number, conditions, units) in `legalBasis`;
   - **not verified**: a resolution approves a route, it doesn't prove that jeepneys run it. Riders'
     confirmations or a staff check verify it later;
   - **not operational** unless you tick *Jeepneys already run this route*. Non-operational routes are
     stored but never offered in trip planning. Switch them on in **Routes** when service starts.

   For a modification, put the old route's id in *Routes this one replaces*: it is marked not
   operational, with a note pointing to the new routes. Importing the same resolution again replaces
   its routes instead of duplicating them. Every change is in the audit log.

Fares: resolutions don't set fares (they direct the operator to get a fare guide from the regional
office), so these routes use the jeepney fare schedule in **Fares** until a route-specific one is
added.

## Server settings

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Optional. Lets Claude read uploaded resolutions. Without it, OCR is used |
| `LUVYO_EXTRACT_MODEL` | Optional. Claude model for reading (default `claude-opus-5-5`) |
| `NOMINATIM_URL`, `OSRM_URL` | Optional. Your own OpenStreetMap geocoder/router for heavy use. The public servers allow light use only (Nominatim: one request per second) |

The Render blueprint builds from the `Dockerfile`, which installs the PDF tools and Tesseract. When the
server runs without them (e.g. `npm start` on Windows), upload still works but you fill in the form
by hand.

OpenStreetMap data is © OpenStreetMap contributors, under the ODbL. Paths traced from it are
shared under the same licence when the dataset is published.
