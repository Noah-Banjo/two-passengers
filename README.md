# Two Passengers

A small website for a history class. Students follow William and Ellen Craft from Macon, Georgia to Philadelphia in December 1848, using Ilyon Woo's book *Master Slave Husband Wife* (2023). Each stop shows where the two of them were and what happened there. Claims that have been checked carry a tag that says how well they are supported. A second page lays out what the route required.

It is plain web code with no framework. There is no server, no database, no login, no tracking and no build step.

## What is in the folder

Every file sits in one folder, with no sub-folders.

| File | What it is |
|---|---|
| `index.html` | The map page |
| `conditions.html` | The "What this route required" page |
| `stops.json` | Every stop and every claim. This is the file to edit. |
| `legend.json` | The wording for the evidence tags |
| `states.geojson` | State outlines used for the 1848 shading |
| `styles.css` | Colors and layout |
| `app.js` | The code, with comments throughout for anyone reading it |
| `leaflet.js`, `leaflet.css` | The Leaflet map library, saved here so the site does not depend on a CDN |
| `LEAFLET-LICENSE.txt` | Leaflet's license |

## Open it on your own computer

Browsers will not load data files when you double click an HTML file. Start a tiny web server in the project folder instead. If you have Python installed:

```bash
python3 -m http.server 8000
```

On Windows the command is usually `py -m http.server 8000`. Then open <http://localhost:8000> in your browser. Press Ctrl+C in the terminal to stop the server.

The background map tiles come from the internet. Without a connection you will see a note that the tiles could not load. The route, the shading and the cards still work.

## Put it on GitHub Pages

1. Sign in at github.com and create a new public repository. Any name works. The name becomes part of the web address.
2. On the repository page choose **Add file**, then **Upload files**. Drag in every file from this folder. Choose **Commit changes**.
3. Go to **Settings**, then **Pages**. Under "Build and deployment" set the source to **Deploy from a branch**. Pick the `main` branch and the `/ (root)` folder. Save.
4. Wait a minute or two. The page shows your address, which looks like `https://your-username.github.io/your-repository/`.

To change something later, edit the file on GitHub (the pencil icon) or upload a new copy. The site updates after a minute.

## Links for class

Add these to the web address.

| Add this | What it does |
|---|---|
| `?stop=havre` | Opens the site on that stop. Use any `id` from `stops.json`. |
| `?projector=1` | Large text, and the layers menu is hidden. |
| both | `?stop=havre&projector=1` |

The address bar updates as you move between stops, so you can copy a link to any stop.

## Edit a stop

Open `stops.json` in any text editor. Each stop is a block like this one, shortened:

```json
{
  "id": "gordon",
  "order": 3,
  "phase": 1,
  "title": "A man who knew her as a child",
  "place": "On the train near Gordon, Georgia",
  "lat": 32.8830, "lon": -83.3300,
  "date": "1848-12-20",
  "date_note": "Day 1; coordinates are approximate",
  "ellen": "Sits beside Scott Cray, who has known her since childhood. He speaks to her.",
  "william": "In the Negro car.",
  "ellen_role": "young planter",
  "william_role": "servant",
  "claims": [
    {
      "text": "Ellen ignored Cray and acted as if she could not hear him.",
      "evidence": "unreviewed",
      "quote": "pretending to be deaf",
      "page": null
    }
  ],
  "predict": { "prompt": "...", "reveal": "..." }
}
```

What each field does:

- `order` sets the sequence. `phase` is 1 for the escape and 2 for "After the escape".
- `date` is an ISO date (year, month, day) or `null`. When it is `null` the card says the date is approximate.
- `ellen_role` and `william_role` are the short labels used by the "Who they appeared to be" layer. Use `null` for none.
- `together_note` is optional. When a stop has one, the card shows a "Together" box and the map joins the two dots with a short line.
- `predict` is optional. Only its `reveal` text is shown, as a "What happened" note at the top of the card. The `prompt` is kept in the file and not shown.
- Keep the commas and quotation marks exactly as they are. If the site shows "The route could not load" after an edit, a comma or quote is usually missing. Paste the file into a JSON checker such as jsonlint.com to find it.

### Add a page number to a quote

Change `"page": null` to the page. A single page can be a number. A range needs quotation marks.

```json
"page": 112
```

```json
"page": "112-113"
```

The card then shows "Woo, p. 112" under the quote. Seventeen quotes are waiting for page numbers.

### Tag a claim

Change `"evidence"` to one of the three values below.

| Value | Tag on the card | Meaning |
|---|---|---|
| `corroborated` | Corroborated (✓) | Other records, such as newspapers, confirm it. |
| `crafts_symbolic` | Crafts' account, symbolic (◇) | Only the Crafts tell it and nothing else confirms it. Woo keeps it because it points to a real danger. |
| `unreviewed` | No tag shown | Not yet checked. Twenty of the 25 claims are in this state. |

The tags differ in symbol and border as well as color, so they read in grayscale and for color-blind students.

### Fill in a "After the escape" card

The eight stops with `"phase": 2` have a place, a date note and nothing else. Add text to `ellen` and `william`. Then add claims. The "Card to come" placeholder disappears once a stop has content. Those stops do not show the two dots yet because there is no per-person data for them.

## Quotation rules this site follows

- Every quotation in `stops.json` is word for word and short.
- The curly quotation marks around a quote are added by the stylesheet. The text in the data file has none, so it matches the book exactly.
- Racial and disability language appears in a few quotes because it is in the historical record. The site adds no new language of that kind.

## Map accuracy

- The points are approximate towns. They do not mark a station or a street. Gordon, Aquia Landing, Woodville and Ockham are rougher still.
- The lines join the stops in order. They are straight lines. They do not follow the real tracks, roads or rivers.
- The shading is a teaching approximation. It uses today's state outlines and shades each state by its status in 1848 from a fixed list of sixteen slave states and the District of Columbia. Virginia and West Virginia share one shade because West Virginia did not yet exist. Land that was not yet a state in 1848 (parts of the West) is shaded as "free" because every area outside the list is treated that way.
- Ellen's line is solid and William's line is dashed. They are drawn about 24 screen pixels apart so you can tell them apart. That gap is a drawing aid and means nothing on the ground.

## Sources and licenses

- **Map library:** Leaflet 1.9.4, BSD 2-Clause license (copy in `LEAFLET-LICENSE.txt`).
- **Background tiles:** the standard OpenStreetMap map (`tile.openstreetmap.org`), which needs no account or key. The required credit shows in the corner of the map. OpenStreetMap asks for light use, which a class easily is. If the site ever gets heavy traffic, switch to a tile provider that suits that use. The tiles are colored, and a filter in `styles.css` makes them gray.
- **State outlines:** US Census Bureau cartographic boundary files (2017 edition), which are public domain. See "Design notes" for how they were obtained.
- **Fonts:** system fonts only. Nothing is downloaded.
- **Requests:** the only requests the page makes to another site are the map tile requests to `tile.openstreetmap.org`. There are no analytics and no cookies.

## Design notes

Choices behind how the site works. Any of them can be changed.

1. **Basemap.** OpenStreetMap's standard map, turned gray by a filter, and inverted in dark mode. The first version used CARTO's free tiles, but CARTO now stamps "API KEY REQUIRED" across tiles requested without an account key, so the site moved to OpenStreetMap.
2. **State outlines.** The outlines are the Census Bureau's 2017 cartographic boundary files as redistributed in the open source `us-atlas` package. They were converted to GeoJSON, rounded to three decimals and trimmed to the lower 48 states plus the District of Columbia. To use a file straight from the Census Bureau, replace `states.geojson` with a GeoJSON file that has a `name` property on each state.
3. **Two extra fields, `ellen_role` and `william_role`.** The "Who they appeared to be" layer needs a short label for each person at each stop. They follow the wording on each card where it gives one ("young gentleman", "sick gentleman", "sick young master", "invalid"). Where a card gives no wording the labels carry forward the depot wording, "young planter" for Ellen and "servant" for William. William has no role label at the Macon cottage and neither person has one in Philadelphia. The private labels, "William's wife" and "Ellen's husband", appear at every stop.
4. **Lines apart, dots joined only when together.** Both lines are drawn apart on every leg, because `stops.json` records no leg where the two shared a space. At stops that have a `together_note` (the Macon cottage and Philadelphia) a short line joins the dots.
5. **Play.** It waits five seconds on each stop and stops at the end of the chapter.
6. **Pins.** The numbered pins show the stop's position in its chapter. The two Macon stops share one pin labeled "1,2". Choosing it goes to stop 1, then stop 2.
7. **Dates.** Stops with a `null` date show "Approximate date" unless the date note already says so. Weekdays are calculated from the ISO date. December 20, 1848 comes out as a Wednesday and December 24 as a Sunday, which matches Woo's headings.
8. **Chapter 2.** It shows one plain dashed line through its stops and no per-person dots.

## Open items

1. **Page numbers.** Seventeen quotes still have `"page": null`.
2. **Phase 2 cards.** All eight stops are stubs. They need text and claims.
3. **Woodville coordinates.** They are rough (`31.9, -81.3`) and need confirming.
4. **Shading in the West.** Land that was not yet a state in 1848 is shaded "free". A third "not yet a state" shade would avoid a student asking why California looks free in 1848.
5. **Shared legs.** If William and Ellen ever shared a car or cabin between stops, naming the legs would let the map draw one line there.
6. **Role labels.** "Servant" is used for William at every disguised stop. The depot card says Ellen is "traveling with his slave", so the wording is worth a check.
7. **Exact dates on phase 2 stops.** The Liverpool stop (December 11, 1850) and the final Charleston stop (January 27, 1900) have exact dates in their notes. They are stored only as note text, so the card still says "Approximate date". They could move into the `date` field.
8. **Evidence tags.** Twenty claims are `unreviewed`. Two are `corroborated` and three are `crafts_symbolic`.
