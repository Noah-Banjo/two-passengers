/* ==========================================================================
   Two Passengers: the script behind index.html

   What this file does, in order
    0. Reads settings from the web address (?stop=... and ?projector=1)
    1. Small helper functions
    2. Builds the Leaflet map, the background tiles and the state shading
    3. Draws the route, the two dots and the numbered stop pins
    4. Moves between stops (this is the core function, goTo)
    5. Draws the stop card
    6. Wires up the buttons, the slider and the layers menu
    7. Loads the data files and starts everything

   There is no framework. The page is plain HTML plus this one file.
   The data lives in stops.json. To change what a card says, edit that
   file. Changes to the content do not need edits here.
   ========================================================================== */

(function () {
  'use strict';   // turns on stricter error checking, which catches typos early


  /* ---------- 0. Settings from the web address ------------------------- */
  // Example: index.html?stop=havre&projector=1
  const params = new URLSearchParams(window.location.search);
  const PROJECTOR = params.get('projector') === '1';   // big text, no layers menu
  // A stop id from stops.json, from ?stop=havre or from a plain #havre
  // (some hosts pass only the # part along).
  const START_STOP = params.get('stop') || window.location.hash.replace('#', '');

  if (PROJECTOR) document.documentElement.classList.add('projector');

  // True when the person has asked their device to cut down on motion.
  // We then jump between stops and do not animate the dots.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The states that allowed slavery in 1848, used by the shading layer.
  // West Virginia is added because it did not exist yet: its land was part
  // of Virginia, so it gets the same shade.
  const SLAVE_STATES = [
    'Delaware', 'Maryland', 'Virginia', 'North Carolina', 'South Carolina',
    'Georgia', 'Florida', 'Alabama', 'Mississippi', 'Louisiana', 'Texas',
    'Arkansas', 'Missouri', 'Kentucky', 'Tennessee', 'District of Columbia'
  ];
  const SHADED_AS_SLAVE = SLAVE_STATES.concat(['West Virginia']);

  const OFFSET_PX = 12;        // how far apart the two route lines are drawn, in screen pixels
  const PLAY_DELAY_MS = 5000;  // how long Play waits on each stop so students can read


  /* ---------- 1. Small helpers ----------------------------------------- */

  // Shortcut for document.getElementById.
  const $ = (id) => document.getElementById(id);

  // Builds an HTML element without using innerHTML. Text is always added as
  // text, never as markup, so a quote with odd characters shows exactly as it
  // is written in stops.json.
  //   el('p', { class: 'note' }, 'Hello')  ->  <p class="note">Hello</p>
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child);   // strings become text nodes, elements are inserted
    }
    return node;
  }

  // Makes text safe to place inside an HTML string (only needed where we must
  // build HTML as text, such as the map pins).
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // "a, b and c" with no comma before "and".
  function plainList(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  // "1848-12-20" -> "Wednesday, December 20, 1848". We build the date in UTC
  // so the weekday never shifts with the visitor's time zone.
  function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  async function loadJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load ' + url + ' (' + response.status + ')');
    return response.json();
  }


  /* ---------- Shared state --------------------------------------------- */
  const state = {
    stops: [],        // every stop from stops.json
    legend: null,     // contents of legend.json
    chapter: 1,       // 1 = the escape, 2 = after the escape
    list: [],         // the stops of the current chapter, in order
    index: 0,         // which stop of that list is showing
    offsets: null,    // screen-offset positions for the two lines (chapter 1 only)
    playing: false,
    playTimer: null,
    anim: null        // id of the running animation frame, if any
  };

  const currentStop = () => state.list[state.index];


  /* ---------- 2. The map ----------------------------------------------- */
  const map = L.map('map', {
    zoomSnap: 0.25,   // lets fitBounds choose in-between zoom levels
    minZoom: 2,       // low enough to fit the Atlantic crossing on a phone
    maxZoom: 12
  });
  // Give the map a starting view right away. A Leaflet map only accepts layers
  // once it has a view. setChapter() zooms to the real area a moment later.
  map.setView([37.5, -79], 5);
  // Keep the Leaflet credit link but drop the small flag icon Leaflet adds
  // by default, so the page stays black and white.
  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>');
  map.getContainer().setAttribute('role', 'region');
  map.getContainer().setAttribute('aria-label',
    'Map of the route. The stop card beside it has the same information in text.');

  // Background tiles: the standard OpenStreetMap map. It needs no account or
  // key, but its usage policy asks for light use and a visible credit, which
  // the attribution below provides. A class of students is well within that.
  // The tiles are in color, so styles.css turns them gray with a filter (and
  // inverts them in dark mode), keeping the page black and white.
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  // If tiles cannot load (offline, blocked network) say so once.
  tiles.once('tileerror', () => { $('map-note').hidden = false; });

  // The map must be told when its box changes size (phone sheet opens, window
  // resizes), otherwise Leaflet draws the wrong area. Until the person moves the
  // map themselves we also re-fit it to the chapter's stops, so the first
  // screen always shows the whole route whatever the window size.
  let autoFit = true;
  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    map.getContainer().addEventListener(type, () => { autoFit = false; }, { passive: true });
  }
  new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (autoFit && state.list.length) fitChapter();
  }).observe($('map'));

  // Zooms the map to fit all of the current chapter's stops.
  function fitChapter() {
    const bounds = L.latLngBounds(state.list.map((s) => [s.lat, s.lon]));
    map.fitBounds(bounds.pad(0.25), { animate: false });
  }

  // --- State shading layer ---
  // Shading sits in its own "pane" so it always draws under the route lines.
  map.createPane('states');
  map.getPane('states').style.zIndex = 250;   // tiles are 200, lines are 400
  let statesLayer = null;

  // Builds an SVG hatch pattern. Plain color alone would not tell the two kinds
  // of state apart for everyone, so the slave states get stripes as well.
  function ensureHatchPattern() {
    const first = statesLayer.getLayers()[0];
    const svg = map.getRenderer(first)._container;   // the <svg> Leaflet drew into
    if (svg.querySelector('#ts-hatch')) return;
    const NS = 'http://www.w3.org/2000/svg';
    const make = (name, attrs) => {
      const node = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };
    const pattern = make('pattern', {
      id: 'ts-hatch', width: 8, height: 8,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    pattern.append(
      make('rect', { class: 'hatch-bg', width: 8, height: 8 }),
      make('line', { class: 'hatch-line', x1: 0, y1: 0, x2: 0, y2: 8 })
    );
    const defs = make('defs', {});
    defs.append(pattern);
    svg.insertBefore(defs, svg.firstChild);
  }

  function buildStatesLayer(geojson) {
    statesLayer = L.geoJSON(geojson, {
      pane: 'states',
      interactive: false,   // shading is background only. The legend lists the states in text.
      style: (feature) => ({
        className: 'state ' + (SHADED_AS_SLAVE.includes(feature.properties.name) ? 'state-slave' : 'state-free'),
        weight: 1,
        fillOpacity: 0.5
      })
    });
    statesLayer.on('add', ensureHatchPattern);
    if ($('layer-states').checked) statesLayer.addTo(map);
  }


  /* ---------- 3. Route, dots and stop pins ----------------------------- */
  // routeLayer holds everything we draw for one chapter. Switching chapters
  // clears it and draws again.
  const routeLayer = L.layerGroup().addTo(map);
  let lines = {};    // the route polylines
  let dots = {};     // the two moving markers
  let pins = [];     // the numbered stop pins: { group, node }

  // A divIcon is a marker made from our own HTML instead of an image.
  // Ellen is a circle with an E. William is a diamond with a W.
  function dotIcon(who, letter) {
    return L.divIcon({
      className: 'dot dot-' + who,
      html: '<span class="dot-shape"><span class="dot-letter">' + letter + '</span></span>' +
            '<span class="dot-label"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  // Works out where each line and dot should sit so the two people are drawn
  // slightly apart. We do this in screen pixels so the gap looks the same at
  // every zoom level.
  //   Ellen goes on the left of the direction of travel and William on the right.
  function computeOffsets(list) {
    const points = list.map((s) => map.latLngToLayerPoint([s.lat, s.lon]));

    function shifted(i, px) {
      // Find the nearest earlier and later stop that is not on the same spot.
      let before = null;
      for (let k = i - 1; k >= 0 && !before; k--) if (points[k].distanceTo(points[i]) > 0.5) before = points[k];
      let after = null;
      for (let k = i + 1; k < points.length && !after; k++) if (points[k].distanceTo(points[i]) > 0.5) after = points[k];

      // Direction of travel at this stop.
      let dx = 0, dy = -1;   // default: north
      if (before && after) { dx = after.x - before.x; dy = after.y - before.y; }
      else if (after) { dx = after.x - points[i].x; dy = after.y - points[i].y; }
      else if (before) { dx = points[i].x - before.x; dy = points[i].y - before.y; }

      const length = Math.hypot(dx, dy) || 1;
      // Screen y points down, so "left of travel" is (dy, -dx).
      const nx = dy / length, ny = -dx / length;
      return map.layerPointToLatLng(L.point(points[i].x + nx * px, points[i].y + ny * px));
    }

    return {
      ellen: list.map((_, i) => shifted(i, OFFSET_PX)),
      william: list.map((_, i) => shifted(i, -OFFSET_PX))
    };
  }

  // Draws the lines, the dots and the pins for the current chapter.
  function rebuildGeometry() {
    cancelAnimation();
    routeLayer.clearLayers();
    lines = {};
    dots = {};
    state.offsets = null;

    if (state.chapter === 1) buildPersonRoutes();
    else buildNeutralRoute();

    buildPins();
    placeNow(state.index);
  }

  function buildPersonRoutes() {
    state.offsets = computeOffsets(state.list);
    const o = state.offsets;
    const base = { weight: 4, interactive: false };

    // Faint full routes, then brighter "traveled so far" lines on top.
    // Ellen's lines are solid and William's are dashed.
    L.polyline(o.ellen, { ...base, className: 'route-ellen', opacity: 0.35 }).addTo(routeLayer);
    L.polyline(o.william, { ...base, className: 'route-william', opacity: 0.35, dashArray: '8 8' }).addTo(routeLayer);
    lines.ellen = L.polyline([], { ...base, weight: 5, className: 'route-ellen', opacity: 1 }).addTo(routeLayer);
    lines.william = L.polyline([], { ...base, weight: 5, className: 'route-william', opacity: 1, dashArray: '8 8' }).addTo(routeLayer);
    lines.together = L.polyline([], { weight: 3, className: 'together-line', interactive: false }).addTo(routeLayer);

    // The dots. They cannot be clicked, but they do carry a text label
    // (set in updateDotInfo) for screen readers.
    const common = { interactive: false, keyboard: false, zIndexOffset: 1000 };
    dots.ellen = L.marker(o.ellen[0], { ...common, icon: dotIcon('ellen', 'E') }).addTo(routeLayer);
    dots.william = L.marker(o.william[0], { ...common, icon: dotIcon('william', 'W') }).addTo(routeLayer);
    updateDotInfo();
  }

  // Chapter 2 has no per-person data yet, so we draw one plain line through the
  // stops and no dots.
  function buildNeutralRoute() {
    const all = state.list.map((s) => [s.lat, s.lon]);
    L.polyline(all, { weight: 3, opacity: 0.35, dashArray: '2 8', className: 'route-neutral', interactive: false }).addTo(routeLayer);
    lines.neutral = L.polyline([], { weight: 4, className: 'route-neutral', interactive: false }).addTo(routeLayer);
  }

  // "On the train near Gordon, Georgia" -> "Gordon". Used for the small place
  // name beside the current stop's pin, so the map reads without background tiles.
  function shortPlace(place) {
    return place.replace(/^On the train near /, '').split(',')[0];
  }

  // Numbered pins. Stops that share the same coordinates (the two Macon stops)
  // share one pin. Clicking it moves to the next stop in that group.
  function buildPins() {
    pins = [];
    const groups = new Map();   // "lat,lon" -> [indexes into state.list]
    state.list.forEach((s, i) => {
      const key = s.lat + ',' + s.lon;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });

    // What happens when a pin is chosen: go to its first stop, or if we are
    // already on one of its stops, to the next stop in the group.
    const select = (group) => {
      const here = group.indexOf(state.index);
      goTo(here === -1 ? group[0] : group[(here + 1) % group.length]);
    };

    for (const group of groups.values()) {
      // Some browsers send both a click and a key event for one Enter press.
      // Each pin ignores a second activation within a quarter second.
      let lastActivation = 0;
      const activate = () => {
        const now = Date.now();
        if (now - lastActivation < 250) return;
        lastActivation = now;
        select(group);
      };

      const first = state.list[group[0]];
      const label = group.map((i) => i + 1).join(',');
      const name = escapeHtml(shortPlace(first.place));
      const marker = L.marker([first.lat, first.lon], {
        icon: L.divIcon({
          className: 'stop-marker',
          html: '<span class="stop-pin">' + label + '</span>' +
                '<span class="stop-place">' + name + '</span>',
          iconSize: [24 + (group.length - 1) * 14, 24],
          iconAnchor: [12 + (group.length - 1) * 7, 12]
        }),
        keyboard: true,        // lets a keyboard user tab to the pin
        title: first.place,
        zIndexOffset: 500
      }).addTo(routeLayer);

      const node = marker.getElement();
      node.setAttribute('aria-label',
        'Go to stop ' + plainList(group.map((i) => String(i + 1))) + ': ' + first.place);
      marker.on('click', activate);
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
      pins.push({ group, node });
    }
    updatePins();
  }

  function updatePins() {
    for (const pin of pins) {
      const isCurrent = pin.group.includes(state.index);
      pin.node.querySelector('.stop-pin').classList.toggle('is-current', isCurrent);
      pin.node.classList.toggle('is-current-pin', isCurrent);   // shows the place name
      if (isCurrent) pin.node.setAttribute('aria-current', 'true');
      else pin.node.removeAttribute('aria-current');
    }
  }

  // Sets the text on the two dots: the visible label (shown by the layer
  // toggle) and the aria-label that screen readers read.
  function updateDotInfo() {
    if (!dots.ellen) return;
    const stop = currentStop();
    const describe = (who, name, shape, role, tie) => {
      const marker = dots[who];
      const node = marker.getElement();
      const labelLines = [name];
      if (role) labelLines.push('Public: ' + role);
      labelLines.push('Private: ' + tie);
      node.querySelector('.dot-label').textContent = labelLines.join('\n');
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label',
        name + ' (' + shape + ') at ' + stop.place + '. ' +
        (role ? 'In public: ' + role + '. ' : '') + 'In private: ' + tie + '.');
    };
    describe('ellen', 'Ellen', 'circle', stop.ellen_role, "William's wife");
    describe('william', 'William', 'diamond', stop.william_role, "Ellen's husband");
  }

  // Puts the dots and the "traveled so far" lines at stop number `index`
  // with no animation.
  function placeNow(index) {
    if (state.chapter === 1 && state.offsets) {
      const o = state.offsets;
      dots.ellen.setLatLng(o.ellen[index]);
      dots.william.setLatLng(o.william[index]);
      lines.ellen.setLatLngs(o.ellen.slice(0, index + 1));
      lines.william.setLatLngs(o.william.slice(0, index + 1));
      // A short line joins the dots at stops where the card says they are together.
      lines.together.setLatLngs(currentStop().together_note ? [o.ellen[index], o.william[index]] : []);
    } else if (lines.neutral) {
      lines.neutral.setLatLngs(state.list.slice(0, index + 1).map((s) => [s.lat, s.lon]));
    }
  }

  // --- Animation ---
  function cancelAnimation() {
    if (state.anim) { cancelAnimationFrame(state.anim); state.anim = null; }
  }

  // Slow at the start, fast in the middle, slow at the end.
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // Finds the point `t` (0 to 1) of the way along a path of LatLngs.
  // Returns the point and which segment of the path it is on.
  function pointAlong(path, t) {
    const lengths = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const len = path[i - 1].distanceTo(path[i]);
      lengths.push(len);
      total += len;
    }
    const target = t * total;
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
      const len = lengths[i - 1];
      if (len > 0 && walked + len >= target) {
        const f = (target - walked) / len;
        const a = path[i - 1], b = path[i];
        return { seg: i - 1, latlng: L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f) };
      }
      walked += len;
    }
    return { seg: path.length - 2, latlng: path[path.length - 1] };
  }

  // Moves both dots from stop `from` to stop `to`, along the route through any
  // stops in between.
  function animateDots(from, to) {
    const step = to > from ? 1 : -1;
    const indexes = [];
    for (let i = from; i !== to + step; i += step) indexes.push(i);

    const who = ['ellen', 'william'];
    const paths = {};
    who.forEach((w) => { paths[w] = indexes.map((i) => state.offsets[w][i]); });

    lines.together.setLatLngs([]);
    const duration = Math.min(2600, 800 + 250 * (indexes.length - 1));
    const started = performance.now();

    function frame(now) {
      const raw = Math.min(1, (now - started) / duration);
      const t = ease(raw);
      who.forEach((w) => {
        const p = pointAlong(paths[w], t);
        dots[w].setLatLng(p.latlng);
        // The "traveled" line runs up to the last stop passed, then to the dot.
        const lastPassed = Math.min(indexes[p.seg], indexes[p.seg + 1]);
        lines[w].setLatLngs(state.offsets[w].slice(0, lastPassed + 1).concat([p.latlng]));
      });
      if (raw < 1) state.anim = requestAnimationFrame(frame);
      else { state.anim = null; placeNow(to); }
    }
    state.anim = requestAnimationFrame(frame);
  }

  // Zooming changes how far apart 12 pixels is on the ground, so redraw.
  map.on('zoomend', () => { if (state.list.length) rebuildGeometry(); });

  // Pan the map only if the current stop has drifted near the edge.
  function keepInView() {
    const s = currentStop();
    const here = L.latLng(s.lat, s.lon);
    if (!map.getBounds().pad(-0.2).contains(here)) {
      map.panTo(here, { animate: !reducedMotion.matches });
    }
  }


  /* ---------- 4. Moving between stops ---------------------------------- */
  // Everything that happens when the stop changes runs through goTo.
  //   index           which stop of the current chapter to show
  //   opts.animate    false to jump the dots instead of gliding (the slider does this)
  //   opts.fromPlay   true when the Play timer is the one moving us
  function goTo(index, opts) {
    opts = opts || {};
    index = Math.max(0, Math.min(state.list.length - 1, index));
    const from = state.index;
    state.index = index;

    if (!opts.fromPlay) stopPlay();   // any manual move cancels Play
    cancelAnimation();

    updateDotInfo();
    renderCard();
    updateControls();
    updatePins();
    updateUrl();
    $('status').textContent = 'Stop ' + (index + 1) + ' of ' + state.list.length + '. ' + currentStop().title + '.';

    const canAnimate = opts.animate !== false && !reducedMotion.matches &&
      from !== index && state.chapter === 1 && state.offsets;
    if (canAnimate) animateDots(from, index);
    else placeNow(index);

    keepInView();
  }

  // Switches between chapter 1 (the escape) and chapter 2 (after the escape).
  function setChapter(chapter, startIndex) {
    stopPlay();
    state.chapter = chapter;
    state.list = state.stops.filter((s) => s.phase === chapter);
    state.index = startIndex || 0;

    $('chapter-1').setAttribute('aria-pressed', String(chapter === 1));
    $('chapter-2').setAttribute('aria-pressed', String(chapter === 2));
    $('slider').max = String(state.list.length - 1);

    autoFit = true;
    fitChapter();

    rebuildGeometry();
    goTo(state.index, { animate: false });
  }

  function updateUrl() {
    // Keeps ?stop=... current so an instructor can copy the address bar.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('stop', currentStop().id);
      window.history.replaceState(null, '', url);
    } catch (err) { /* some browsers block this on local files: ignore */ }
  }

  // --- Play ---
  function startPlay() {
    if (state.index >= state.list.length - 1) goTo(0, { animate: false });
    state.playing = true;
    updateControls();
    scheduleStep();
  }

  function stopPlay(message) {
    if (!state.playing) return;
    state.playing = false;
    clearTimeout(state.playTimer);
    updateControls();
    if (message) $('status').textContent = message;
  }

  function scheduleStep() {
    clearTimeout(state.playTimer);
    state.playTimer = setTimeout(step, PLAY_DELAY_MS);
  }

  // One tick of Play: move to the next stop, or stop at the end of the chapter.
  function step() {
    if (state.index >= state.list.length - 1) { stopPlay('End of the chapter.'); return; }
    goTo(state.index + 1, { fromPlay: true });
    scheduleStep();
  }


  /* ---------- 5. The stop card ----------------------------------------- */

  function updateControls() {
    const n = state.list.length;
    $('slider').value = String(state.index);
    $('slider').setAttribute('aria-valuetext', 'Stop ' + (state.index + 1) + ' of ' + n + ': ' + currentStop().title);
    $('counter').textContent = 'Stop ' + (state.index + 1) + ' of ' + n;
    $('prev').disabled = state.index === 0;
    $('next').disabled = state.index === n - 1;
    $('play').textContent = state.playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play through the stops');
  }

  // Draws the card for the current stop: title, place, date, what happened
  // there, then what each of the two is doing and the claims.
  function renderCard() {
    const stop = currentStop();
    const card = $('card');
    card.replaceChildren(
      el('h2', { id: 'stop-title', tabindex: '-1' }, stop.title),
      el('p', { class: 'place' }, stop.place),
      whenLine(stop)
    );
    // stops.json keeps a "predict" object on some stops. Only its "reveal"
    // text is shown, as the short account of what happened.
    if (stop.predict && stop.predict.reveal) card.append(happenedBlock(stop));
    card.append(...detailBlocks(stop));
    $('card-scroll').scrollTop = 0;
  }

  // The date line. Where stops.json gives no date, the card says so plainly.
  function whenLine(stop) {
    const note = stop.date_note || '';
    const bits = [];
    if (stop.date) bits.push(el('strong', {}, formatDate(stop.date) + '.'));
    else if (!/approximate/i.test(note)) bits.push(el('strong', {}, 'Approximate date.'));
    if (note) bits.push((bits.length ? ' ' : '') + note);
    return el('p', { class: 'when' }, bits);
  }

  function happenedBlock(stop) {
    return el('section', { class: 'reveal' },
      el('h3', {}, 'What happened'),
      el('p', {}, stop.predict.reveal));
  }

  // Everything below the date line: the two people and the claims.
  function detailBlocks(stop) {
    const out = [];
    const hasPeople = Boolean(stop.ellen || stop.william);

    // A stop with nothing written yet (chapter 2 for now) gets a plain placeholder.
    if (!hasPeople && stop.claims.length === 0) {
      return [el('p', { class: 'placeholder' }, 'Card to come.')];
    }

    if (hasPeople) {
      out.push(el('h3', {}, 'What each of them is doing'));
      if (stop.ellen) out.push(personBlock('ellen', 'Ellen', stop.ellen, stop.ellen_role));
      if (stop.william) out.push(personBlock('william', 'William', stop.william, stop.william_role));
      if (stop.together_note) {
        out.push(el('div', { class: 'together' }, el('strong', {}, 'Together'), stop.together_note));
      }
    }

    if (stop.claims.length === 0) {
      out.push(el('p', { class: 'placeholder' }, 'Card to come.'));
    } else {
      out.push(el('ul', { class: 'claims' }, stop.claims.map(claimItem)));
    }

    return out;
  }

  function personBlock(who, name, text, role) {
    return el('div', { class: 'person person-' + who },
      el('div', { class: 'name' }, el('span', { class: 'glyph-' + who, 'aria-hidden': 'true' }), name),
      role ? el('p', { class: 'role' }, 'In public: ' + role) : null,
      el('p', {}, text));
  }

  // One claim: its evidence tag (if it has been checked), its text, and its
  // short quotation if it has one. Claims marked "unreviewed" show no tag.
  function claimItem(claim) {
    const info = state.legend.tags[claim.evidence];
    const showTag = info && claim.evidence !== 'unreviewed';
    return el('li', { class: 'claim' },
      showTag ? tagChip(claim.evidence, info) : null,
      el('p', {}, claim.text),
      claim.quote
        ? el('blockquote', { class: 'quote' },
            el('p', {}, claim.quote),
            // Page numbers are filled in by the instructor in stops.json.
            claim.page ? el('cite', {}, 'Woo, p. ' + claim.page) : null)
        : null);
  }

  function tagChip(key, info) {
    return el('span', { class: 'tag tag-' + key },
      el('span', { class: 'tag-symbol', 'aria-hidden': 'true' }, info.symbol),
      info.label);
  }


  /* ---------- 6. Wiring up the controls -------------------------------- */

  function wireControls() {
    $('prev').addEventListener('click', () => goTo(state.index - 1));
    $('next').addEventListener('click', () => goTo(state.index + 1));
    $('play').addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
    // The slider jumps (no gliding) so dragging feels immediate.
    $('slider').addEventListener('input', (e) => goTo(Number(e.target.value), { animate: false }));

    $('chapter-1').addEventListener('click', () => { if (state.chapter !== 1) setChapter(1, 0); });
    $('chapter-2').addEventListener('click', () => { if (state.chapter !== 2) setChapter(2, 0); });

    // Bottom sheet on phones: bigger or smaller card.
    $('sheet-toggle').addEventListener('click', () => {
      const open = $('panel').dataset.open !== 'true';
      $('panel').dataset.open = String(open);
      $('sheet-toggle').setAttribute('aria-expanded', String(open));
      $('sheet-toggle').textContent = open ? 'Show less' : 'Show more';
    });

    // --- Layers menu ---
    const menu = $('layers-menu');
    const toggleButton = $('layers-btn');
    const setMenu = (open) => {
      menu.hidden = !open;
      toggleButton.setAttribute('aria-expanded', String(open));
    };
    toggleButton.addEventListener('click', () => setMenu(menu.hidden));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggleButton.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== toggleButton) setMenu(false);
    });

    $('layer-states').addEventListener('change', (e) => {
      if (!statesLayer) return;
      if (e.target.checked) statesLayer.addTo(map);
      else map.removeLayer(statesLayer);
    });
    // The role labels are plain HTML inside the dots. A class on the map turns them on.
    $('layer-roles').addEventListener('change', (e) => {
      $('map').classList.toggle('show-roles', e.target.checked);
    });
    $('slave-list').textContent = plainList(SLAVE_STATES) +
      '. West Virginia did not yet exist and is shaded with Virginia.';
  }

  /* ---------- 7. Start up ---------------------------------------------- */

  function showFatal(err) {
    console.error(err);
    $('card').replaceChildren(
      el('h2', { id: 'stop-title' }, 'The route could not load'),
      el('p', {}, 'The data files did not load. If you opened index.html by double clicking it, ' +
                  'browsers block that. Start a small local web server instead. The README explains how.'));
  }

  async function start() {
    wireControls();
    try {
      // The states file is optional. If it is missing the map still works.
      const [stops, legend, states] = await Promise.all([
        loadJSON('stops.json'),
        loadJSON('legend.json'),
        loadJSON('states.geojson').catch(() => null)
      ]);
      state.stops = stops.slice().sort((a, b) => a.order - b.order);
      state.legend = legend;

      if (states) buildStatesLayer(states);

      // ?stop=<id> opens that stop (and its chapter).
      const wanted = state.stops.find((s) => s.id === START_STOP);
      const chapter = wanted ? wanted.phase : 1;
      const inChapter = state.stops.filter((s) => s.phase === chapter);
      setChapter(chapter, wanted ? inChapter.indexOf(wanted) : 0);
    } catch (err) {
      showFatal(err);
    }
  }

  start();
})();
