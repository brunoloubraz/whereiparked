const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync('src/main/resources/static/js/app.js', 'utf8');
const KEY = 'whereiparked:parking:v1';
const record = (extra = {}) => ({ version: 1, id: 'old', latitude: 10, longitude: 20,
  address: null, savedAt: '2026-11-16T23:00:00.000Z', ...extra });
const position = (latitude = 30, longitude = 40, accuracy = 5) => ({ coords: { latitude, longitude, accuracy } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(options = {}) {
  const elements = {};
  function element() {
    return { textContent: '', disabled: true, hidden: false, children: [], attributes: {}, listeners: {},
      focus() { assert.equal(this.disabled, false); assert.equal(this.hidden, false); document.activeElement = this; },
      setAttribute(k, v) { this.attributes[k] = v; },
      append(...children) { this.children.push(...children); },
      addEventListener(k, callback) { this.listeners[k] = callback; } };
  }
  const document = { getElementById: id => elements[id] ||= element(), createElement: element };
  const data = new Map(options.raw === undefined ? [] : [[KEY, options.raw]]);
  const writes = [], removals = [], confirmations = [], removedLayers = [];
  const storage = {
    getItem(key) { if (options.readError) throw new Error('SecurityError'); return data.get(key) ?? null; },
    removeItem(key) {
      removals.push(key);
      if (options.removeError) throw new Error('SecurityError');
      data.delete(key);
    },
    setItem(key, value) {
      if (options.writeError) throw new Error('QuotaExceededError');
      options.onWrite?.();
      writes.push([key, value]); data.set(key, value);
    }
  };
  const views = [], cars = [], currents = [], gps = [], requests = [], timers = new Set();
  const circles = [], watches = [], cleared = [], activeWatches = new Set(), windowEvents = {};
  const tileEvents = {}, tileConfigs = [], resizeObservers = [], invalidations = [];
  const map = { setView(point, zoom) { views.push({ point: [...point], zoom }); return this; }, invalidateSize(options) { invalidations.push({ ...options }); }, removeLayer(layer) { removedLayers.push(layer); layer.removed = true; } };
  function marker(point, config, collection) {
    const m = { point: [...point], config, addTo() { return this; },
      setLatLng(point) { this.point = [...point]; return this; },
      setRadius(radius) { this.config.radius = radius; return this; },
      bringToBack() { this.sentToBack = true; return this; },
      getElement() { return this.element ||= element(); },
      openPopup() { this.open = true; return this; },
      bindPopup(popup, options) { this.popup = popup; this.popupOptions = options; return this; },
      bindTooltip(text) { this.tooltip = text; return this; } };
    collection.push(m); return m;
  }
  const L = {
    map: () => map,
    tileLayer: (url, config) => {
      tileConfigs.push({ url, ...config });
      return { on(event, callback) { tileEvents[event] = callback; return this; }, addTo() { return this; } };
    },
    marker: (p, c) => marker(p, c, cars), circleMarker: (p, c) => marker(p, c, currents),
    circle: (p, c) => marker(p, c, circles),
    divIcon: config => config
  };
  const window = {
    confirm(message) { confirmations.push(message); return options.confirm !== false; },
    addEventListener(event, callback) { windowEvents[event] = callback; },
    removeEventListener(event, callback) { if (windowEvents[event] === callback) delete windowEvents[event]; },
    L: options.noLeaflet ? undefined : L, isSecureContext: options.secure !== false,
    crypto: options.fallbackCrypto ? { getRandomValues: a => webcrypto.getRandomValues(a) } : webcrypto };
  Object.defineProperty(window, 'localStorage', { get() {
    if (options.storageAccessError) throw new Error('SecurityError'); return storage;
  } });
  const navigator = options.noGps ? {} : { geolocation: {
    getCurrentPosition(success, error, config) {
      if (options.gpsThrows) throw new Error('GPS unavailable');
      gps.push({ success, error, config });
    },
    watchPosition(success, error, config) {
      if (options.watchThrows) throw new Error('Watch unavailable');
      const watch = { success, error, config };
      const id = watches.length;
      watches.push(watch); gps.push(watch); activeWatches.add(id);
      if (options.syncPosition) success(options.syncPosition);
      if (options.syncError) error(options.syncError);
      return id;
    },
    clearWatch(id) { cleared.push(id); activeWatches.delete(id); }
  } };
  document.getElementById('parking-status').disabled = false;
  document.getElementById('clear-parking-button').hidden = true;
  vm.runInNewContext(source, {
    window, L, document, navigator, URLSearchParams, AbortController, Uint8Array,
    ResizeObserver: options.noResizeObserver ? undefined : class {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe(target) { this.target = target; }
    },
    setTimeout(callback, ms) { const timer = { callback, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    fetch(url, config) {
      return new Promise((resolve, reject) => {
        requests.push({ url, config, resolve, reject });
        config.signal.addEventListener('abort', () => reject(new Error('AbortError')));
      });
    }
  });
  return { elements, document, data, writes, removals, confirmations, removedLayers, views, cars, currents, gps, requests, timers, options, circles, watches, cleared, activeWatches, windowEvents, tileEvents, tileConfigs, resizeObservers, invalidations,
    saved: () => JSON.parse(data.get(KEY)),
    status: () => elements['parking-status'].textContent,
    button: () => elements['park-button'],
    clearButton: () => elements['clear-parking-button'],
    clear: () => elements['clear-parking-button'].listeners.click(),
    click: () => elements['park-button'].listeners.click(),
    ready() { gps[0].success(position(1, 2)); },
    finish() { [...timers].find(timer => timer.ms === 5000)?.callback(); },
    save(lat = 30, lon = 40) { this.click(); gps.at(-1).success(position(lat, lon)); this.finish(); },
    respond(index, body, status = 200) {
      requests[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
    }
  };
}

test('empty startup and fresh click: one record, lock during GPS, one HTTP after storage', async () => {
  const app = setup();
  assert.equal(app.cars.length, 0);
  assert.equal(app.button().disabled, true);
  app.ready();
  assert.equal(app.button().disabled, false);
  app.click(); app.click();
  assert.equal(app.gps.length, 2);
  assert.equal(app.button().disabled, true);
  assert.equal(app.button().textContent, 'Marcando...');
  assert.equal(app.requests.length, 0);
  assert.equal(app.gps[1].config.maximumAge, 0);
  assert.equal(app.gps[1].config.enableHighAccuracy, true);
  assert.equal(app.gps[1].config.timeout, 5000);
  assert.equal([...app.timers][0].ms, 5000);
  app.gps[1].success(position());
  assert.equal(app.activeWatches.size, 0);
  assert.equal(app.status(), 'Estacionamento salvo');
  app.finish();
  assert.deepEqual(app.cleared, [0]);
  assert.equal(app.writes.length, 1);
  assert.equal(app.data.size, 1);
  assert.equal(app.saved().latitude, 30);
  assert.equal(app.saved().address, null);
  assert.equal(app.saved().version, 1);
  assert.ok(app.saved().id);
  assert.ok(Number.isFinite(Date.parse(app.saved().savedAt)));
  assert.equal(app.requests[0].url, '/api/location/reverse?lat=30&lon=40');
  assert.equal(app.cars.length, 1);
  assert.equal(app.currents.length, 1);
  assert.equal(app.cars[0].config.title, 'Seu carro está aqui');
  assert.equal(app.button().disabled, false);
  app.respond(0, { address: ' Avenida Paulista ', latitude: 99, longitude: 99 });
  await tick();
  assert.equal(app.saved().address, 'Avenida Paulista');
  assert.equal(app.saved().latitude, 30);
  assert.equal(app.saved().longitude, 40);
  assert.equal(app.timers.size, 0);
});

test('restore without HTTP or GPS, and late GPS never pans away from saved car', () => {
  const raw = JSON.stringify(record({ address: 'Brasil' }));
  for (const options of [{ noGps: true }, { secure: false }, {}]) {
    const app = setup({ raw, ...options });
    assert.equal(app.cars.length, 1);
    assert.deepEqual(app.views.at(-1).point, [10, 20]);
    assert.equal(app.requests.length, 0);
    assert.equal(app.cars[0].popup.children[1].textContent, 'Endereço aproximado: Brasil');
    if (app.gps.length) {
      app.ready();
      assert.deepEqual(app.views.at(-1).point, [10, 20]);
      assert.equal(app.currents.length, 1);
    }
  }
  const app = setup({ raw });
  app.gps[0].error({ code: 1 });
  assert.equal(app.cars.length, 1);
  assert.equal(app.button().disabled, true);
  assert.equal(app.data.get(KEY), raw);
});

test('replacement keeps a single car and object; reopening uses last saved address', async () => {
  const app = setup({ raw: JSON.stringify(record()) }); app.ready();
  app.save(50, 60); app.respond(0, { address: 'Novo local' }); await tick();
  app.save(-90, -180); app.respond(1, { address: 'Último local' }); await tick();
  assert.equal(app.cars.length, 1);
  assert.equal(app.data.size, 1);
  assert.deepEqual(app.cars[0].point, [-90, -180]);
  assert.equal(app.saved().address, 'Último local');
  const reopened = setup({ raw: app.data.get(KEY) });
  assert.deepEqual(reopened.cars[0].point, [-90, -180]);
  assert.equal(reopened.requests.length, 0);
});

test('GPS denied/unavailable/timeout and invalid coordinates preserve old parking', () => {
  for (const code of [1, 2, 3]) {
    const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.click();
    app.gps[1].error({ code }); app.finish();
    assert.equal(app.data.get(KEY), raw);
    assert.deepEqual(app.cars[0].point, [10, 20]);
    assert.equal(app.requests.length, 0);
    assert.equal(app.button().disabled, code === 1);
    assert.ok(app.status());
  }
  for (const [lat, lon] of [[NaN, 0], [Infinity, 0], [91, 0], [0, -181], ['10', 20]]) {
    const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.save(lat, lon);
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.requests.length, 0);
  }
});

test('blocked storage, including getter, never reports false save or starts HTTP', () => {
  for (const failure of ['writeError', 'storageAccessError']) {
    const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready();
    app.options[failure] = true; app.save();
    assert.equal(app.data.get(KEY), raw);
    assert.deepEqual(app.cars[0].point, [10, 20]);
    assert.equal(app.requests.length, 0);
    assert.match(app.status(), /Não foi possível salvar/);
    assert.equal(app.button().disabled, false);
  }
});

test('corrupt or unsupported records and storage read failures do not break GPS', () => {
  const invalid = ['{', 'null', '[]', JSON.stringify(record({ version: 2 })),
    JSON.stringify(record({ latitude: 91 })), JSON.stringify(record({ longitude: -181 })),
    JSON.stringify(record({ latitude: '10' })), JSON.stringify(record({ id: '' })),
    JSON.stringify(record({ savedAt: 'invalid' })), JSON.stringify(record({ address: {} }))];
  for (const raw of invalid) {
    const app = setup({ raw }); app.ready();
    assert.equal(app.cars.length, 0);
    assert.equal(app.button().disabled, false);
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.requests.length, 0);
  }
  for (const failure of ['readError', 'storageAccessError']) {
    const app = setup({ [failure]: true }); app.ready();
    assert.match(app.status(), /Não foi possível recuperar/);
    assert.equal(app.button().disabled, false);
  }
});

test('HTTP errors, malformed body and offline retain coordinates without retry', async () => {
  for (const status of [400, 404, 429, 503, 504]) {
    const app = setup(); app.ready(); app.save();
    app.respond(0, { code: 'ERROR', message: 'External error' }, status); await tick();
    assert.equal(app.saved().address, null);
    assert.equal(app.saved().latitude, 30);
    assert.equal(app.cars.length, 1);
    assert.match(app.status(), /Estacionamento salvo. Endereço indisponível/);
    assert.equal(app.requests.length, 1);
  }
  for (const body of [{ address: null, city: 'Brasil' }, { address: ' ' }, { address: 123 }, null]) {
    const app = setup(); app.ready(); app.save(); app.respond(0, body); await tick();
    assert.equal(app.saved().address, null);
    assert.equal(app.requests.length, 1);
  }
  for (const invalidJson of [false, true]) {
    const app = setup(); app.ready(); app.save();
    if (invalidJson) app.requests[0].resolve({ ok: true, json: async () => { throw new Error('JSON'); } });
    else app.requests[0].reject(new Error('offline'));
    await tick();
    assert.equal(app.saved().address, null);
    assert.equal(app.timers.size, 0);
  }
});

test('HTTP timeout aborts once without deleting saved parking', async () => {
  const app = setup(); app.ready(); app.save();
  const timer = [...app.timers][0]; assert.equal(timer.ms, 10000); timer.callback(); await tick();
  assert.equal(app.requests[0].config.signal.aborted, true);
  assert.equal(app.saved().latitude, 30);
  assert.equal(app.requests.length, 1);
  assert.match(app.status(), /Endereço indisponível/);
});

test('late address and late error from A cannot change B or its feedback', async () => {
  for (const fail of [false, true]) {
    const app = setup(); app.ready(); app.save(10, 20);
    const firstId = app.saved().id;
    app.save(30, 40);
    assert.notEqual(app.saved().id, firstId);
    app.respond(1, { address: 'B' }); await tick();
    const saved = app.data.get(KEY), status = app.status();
    if (fail) app.requests[0].reject(new Error('late failure'));
    else app.respond(0, { address: 'A' });
    await tick();
    assert.equal(app.data.get(KEY), saved);
    assert.equal(app.status(), status);
    assert.deepEqual(app.cars[0].point, [30, 40]);
  }
});

test('rereads storage before enrichment to preserve replacement from another tab', async () => {
  const app = setup(); app.ready(); app.save();
  const newer = JSON.stringify(record({ id: 'another-tab', latitude: 60 }));
  const status = app.status();
  app.data.set(KEY, newer); app.respond(0, { address: 'Old response' }); await tick();
  assert.equal(app.data.get(KEY), newer);
  assert.equal(app.writes.length, 1);
  assert.equal(app.status(), status);
});

test('pending address never masks the feedback from a later GPS attempt', async () => {
  const app = setup(); app.ready(); app.save(); app.click();
  const capturingStatus = app.status();
  app.respond(0, { address: 'Previous parking' }); await tick();
  assert.equal(app.status(), capturingStatus);
  assert.equal(app.button().disabled, true);
  assert.equal(app.saved().address, 'Previous parking');
  app.gps.at(-1).error({ code: 3 }); app.finish();
  assert.match(app.status(), /demorou demais/);
  assert.equal(app.button().disabled, false);
});

test('initial invalid position cannot enable parking; late storage read failure is safe', async () => {
  const invalid = setup(); invalid.gps[0].success(position(NaN, 10));
  assert.equal(invalid.button().disabled, true);
  assert.equal(invalid.cars.length, 0);
  const app = setup(); app.ready(); app.save(); const saved = app.data.get(KEY);
  app.options.readError = true;
  app.respond(0, { address: 'Unavailable storage' }); await tick();
  assert.equal(app.data.get(KEY), saved);
  assert.equal(app.saved().address, null);
  assert.match(app.status(), /Estacionamento salvo. Endereço indisponível/);
  assert.equal(app.timers.size, 0);
});

test('address write failure preserves coordinate save and does not show unsaved address', async () => {
  const app = setup(); app.ready(); app.save(); const saved = app.data.get(KEY);
  app.options.writeError = true; app.respond(0, { address: 'Unsaved address' }); await tick();
  assert.equal(app.data.get(KEY), saved);
  assert.match(app.status(), /Não foi possível salvar o endereço/);
  assert.ok(app.cars[0].popup.children.some(child => /não pôde ser salvo/.test(child.textContent)));
  assert.ok(!app.cars[0].popup.children.some(child => child.textContent.includes('Unsaved address')));
});

test('address remains text, fallback ID works, and unavailable Leaflet/GPS fail gracefully', async () => {
  const app = setup({ fallbackCrypto: true }); app.ready(); app.save();
  assert.match(app.saved().id, /^[0-9a-f]{32}$/);
  const address = '<img src=x onerror=alert(1)>';
  app.respond(0, { address }); await tick();
  assert.equal(app.cars[0].popup.children[1].textContent, `Endereço aproximado: ${address}`);
  assert.equal(app.cars[0].popup.children[2].href, 'https://www.openstreetmap.org/copyright');
  const noMap = setup({ noLeaflet: true });
  assert.match(noMap.elements['location-status'].textContent, /Não foi possível carregar o mapa/);
  assert.equal(noMap.gps.length, 0);
  const noGps = setup({ gpsThrows: true });
  assert.match(noGps.elements['location-status'].textContent, /Não foi possível determinar/);
  assert.equal(noGps.button().disabled, true);
});

test('temporary watch chooses the smallest accuracy without averaging coordinates', async () => {
  const app = setup({ raw: JSON.stringify(record()) }); app.ready(); app.click();
  const watch = app.watches[0];
  assert.equal(watch.config.enableHighAccuracy, true);
  assert.equal(watch.config.maximumAge, 0);
  assert.equal(app.activeWatches.size, 1);
  const samples = [position(30, 40, 52), position(31, 41, 12.2),
    position(32, 42, 48), position(33, 43, 12.2)];
  for (const sample of samples) watch.success(sample);
  assert.equal(app.saved().id, 'old');
  assert.deepEqual(app.currents[0].point, [31, 41]);
  assert.equal(app.circles[0].config.radius, 12.2);
  assert.equal(app.requests.length, 0);
  assert.equal(app.button().disabled, true);
  app.finish();
  assert.equal(app.saved().latitude, 31);
  assert.equal(app.saved().longitude, 41);
  assert.deepEqual(app.cars[0].point, [31, 41]);
  assert.equal(app.requests[0].url, '/api/location/reverse?lat=31&lon=41');
  assert.equal(app.writes.length, 1);
  assert.deepEqual(app.cleared, [0]);
  assert.equal(app.activeWatches.size, 0);
  assert.equal(app.status(), 'Estacionamento salvo');
  assert.ok(app.cars[0].popup.children.some(child => /cerca de 13 m/.test(child.textContent)));
  assert.equal(app.saved().accuracy, 12.2);
  app.respond(0, { address: 'Approximate address' }); await tick();
  assert.equal(app.status(), 'Estacionamento salvo');
  assert.ok(app.cars[0].popup.children.some(child => /cerca de 13 m/.test(child.textContent)));
  assert.equal(app.saved().accuracy, 12.2);
});

test('deadline without improvement saves the best fresh sample, regardless of poor accuracy', () => {
  const app = setup(); app.ready(); app.click();
  const watch = app.watches[0];
  watch.success(position(30, 40, 52));
  watch.success(position(31, 41, 55));
  watch.error({ code: 3 });
  assert.equal(app.writes.length, 0);
  assert.equal(app.activeWatches.size, 1);
  app.finish();
  assert.equal(app.saved().latitude, 30);
  assert.equal(app.saved().longitude, 40);
  assert.equal(app.status(), 'Estacionamento salvo');
  assert.ok(app.cars[0].popup.children.some(child => /cerca de 52 m/.test(child.textContent)));
  assert.equal(app.activeWatches.size, 0);
  assert.deepEqual(app.cleared, [0]);
  // A leitura inicial de 5 m não foi reutilizada: só amostras após o clique participam.
  assert.equal(app.circles[0].config.radius, 52);
});

test('no fresh sample times out preserving old parking and disposing timer and watch', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.click();
  assert.equal(app.watches.length, 1);
  app.finish();
  assert.equal(app.data.get(KEY), raw);
  assert.deepEqual(app.cars[0].point, [10, 20]);
  assert.equal(app.requests.length, 0);
  assert.equal(app.activeWatches.size, 0);
  assert.equal(app.timers.size, 0);
  assert.deepEqual(app.cleared, [0]);
  assert.match(app.status(), /demorou demais/);
  assert.equal(app.button().disabled, false);
});

test('permission denial stops immediately and preserves old parking even after a valid sample', () => {
  for (const hasSample of [false, true]) {
    const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.click();
    const watch = app.watches[0];
    if (hasSample) watch.success(position(30, 40, 18));
    watch.error({ code: 1 });
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.requests.length, 0);
    assert.equal(app.timers.size, 0);
    assert.deepEqual(app.cleared, [0]);
    assert.equal(app.button().disabled, true);
    assert.match(app.status(), /Permita o acesso/);
    watch.success(position(50, 60, 1));
    assert.equal(app.data.get(KEY), raw);
  }
});

test('invalid watch samples never participate in selection or break the accuracy circle', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.click();
  const watch = app.watches[0];
  for (const sample of [position(NaN, 0, 1), position(91, 0, 1), position(0, -181, 1),
    position(10, 20, NaN), position(10, 20, Infinity), position(10, 20, -1),
    position(10, 20, '5'), { coords: null }]) {
    watch.success(sample);
  }
  assert.deepEqual(app.currents[0].point, [1, 2]);
  assert.equal(app.circles[0].config.radius, 5);
  app.finish();
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.requests.length, 0);
  assert.deepEqual(app.cleared, [0]);
});

test('transient errors and invalid positions can be followed by a valid best sample', () => {
  const app = setup(); app.ready(); app.click();
  const watch = app.watches[0];
  watch.error({ code: 2 });
  watch.success(position(91, 0, 1));
  watch.success(position(20, 30, 50));
  watch.error({ code: 3 });
  watch.success(position(21, 31, 9));
  app.finish();
  assert.equal(app.saved().latitude, 21);
  assert.equal(app.saved().longitude, 31);
  assert.deepEqual(app.cleared, [0]);
});

test('queued GPS updates after saving cannot move markers, circle or stored coordinates', () => {
  const app = setup(); app.ready(); app.save();
  const saved = app.data.get(KEY), status = app.status();
  const watch = app.watches[0];
  watch.success(position(60, 70, 0.5));
  watch.error({ code: 1 });
  app.finish();
  assert.equal(app.data.get(KEY), saved);
  assert.equal(app.status(), status);
  assert.deepEqual(app.cars[0].point, [30, 40]);
  assert.deepEqual(app.currents[0].point, [30, 40]);
  assert.deepEqual(app.circles[0].point, [30, 40]);
  assert.equal(app.circles[0].config.radius, 5);
  assert.deepEqual(app.cleared, [0]);
  assert.equal(app.requests.length, 1);
});

test('accuracy circle uses metres and is reused separately from the true parking point', () => {
  const app = setup(); app.ready();
  assert.equal(app.circles.length, 1);
  assert.equal(app.circles[0].config.radius, 5);
  assert.equal(app.circles[0].config.fillColor, '#2563eb');
  assert.ok(app.circles[0].config.fillOpacity > 0 && app.circles[0].config.fillOpacity < 0.3);
  assert.equal(app.circles[0].config.interactive, false);
  assert.equal(app.circles[0].sentToBack, true);
  app.click(); app.watches[0].success(position(11, 22, 48.5));
  assert.equal(app.circles.length, 1);
  assert.deepEqual(app.circles[0].point, [11, 22]);
  assert.equal(app.circles[0].config.radius, 48.5);
  assert.equal(app.cars.length, 0);
  app.finish();
  assert.deepEqual(app.cars[0].point, app.currents[0].point);
  assert.deepEqual(app.cars[0].point, app.circles[0].point);
  assert.equal(app.cars[0].config.icon.className, 'parking-icon');
  assert.deepEqual([...app.cars[0].config.icon.iconAnchor], [18, 18]);
  assert.equal(app.elements['location-status'].className, 'map-status visually-hidden');
  assert.ok(app.currents[0].popup.children.some(child => /estimativa, não uma garantia/.test(child.textContent)));
});

test('watch is disposed before a storage failure and when leaving the page', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready();
  app.options.writeError = true; app.save();
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.activeWatches.size, 0);
  assert.equal(app.timers.size, 0);
  assert.deepEqual(app.cleared, [0]);
  assert.match(app.status(), /Não foi possível salvar/);
  const leaving = setup({ raw }); leaving.ready(); leaving.click();
  const watch = leaving.watches[0]; watch.success(position(30, 40, 20));
  leaving.windowEvents.pagehide();
  assert.equal(leaving.data.get(KEY), raw);
  assert.equal(leaving.activeWatches.size, 0);
  assert.equal(leaving.timers.size, 0);
  assert.equal(leaving.windowEvents.pagehide, undefined);
  watch.success(position(60, 70, 1));
  assert.equal(leaving.data.get(KEY), raw);
});

test('watch setup exception removes the deadline and permits retry without modifying old parking', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw, watchThrows: true });
  app.ready(); app.click();
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.timers.size, 0);
  assert.equal(app.button().disabled, false);
  assert.match(app.status(), /Não foi possível determinar/);
  app.options.watchThrows = false;
  app.save();
  assert.equal(app.saved().latitude, 30);
  assert.equal(app.activeWatches.size, 0);
});


test('good accuracy ends immediately at or below 10 metres without waiting for the deadline', () => {
  for (const accuracy of [0, 4, 10]) {
    const app = setup({ raw: JSON.stringify(record()) }); app.ready(); app.click();
    const deadline = [...app.timers].find(timer => timer.ms === 5000);
    assert.ok(deadline);
    assert.equal(app.button().textContent, 'Marcando...');
    app.watches[0].success(position(12, 34, accuracy));
    assert.equal(app.saved().latitude, 12);
    assert.equal(app.saved().accuracy, accuracy);
    assert.equal(app.status(), 'Estacionamento salvo');
    assert.equal(app.button().textContent, 'Parked');
    assert.equal(app.button().disabled, false);
    assert.equal(app.activeWatches.size, 0);
    assert.deepEqual(app.cleared, [0]);
    assert.equal(app.timers.has(deadline), false);
    const saved = app.data.get(KEY);
    deadline.callback();
    assert.equal(app.data.get(KEY), saved);
    assert.equal(app.requests.length, 1);
  }
});

test('accuracy just above 10 metres waits up to 5 seconds and uses the best sample', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw }); app.ready(); app.click();
  assert.equal(app.watches[0].config.timeout, 5000);
  app.watches[0].success(position(10, 20, 10.001));
  app.watches[0].success(position(11, 21, 50));
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.activeWatches.size, 1);
  assert.equal(app.requests.length, 0);
  app.finish();
  assert.equal(app.saved().latitude, 10);
  assert.equal(app.saved().accuracy, 10.001);
  assert.equal(app.status(), 'Estacionamento salvo');
  assert.ok(app.cars[0].popup.children.some(child => /cerca de 11 m/.test(child.textContent)));
});

test('synchronous early callbacks still clear watch ID zero before saving or reporting permission failure', () => {
  const app = setup({ syncPosition: position(12, 34, 4),
    onWrite() { assert.equal(app.activeWatches.size, 0); } });
  app.ready(); app.click();
  assert.deepEqual(app.cleared, [0]);
  assert.equal(app.saved().latitude, 12);
  assert.equal(app.status(), 'Estacionamento salvo');
  assert.equal(app.windowEvents.pagehide, undefined);
  const raw = JSON.stringify(record()); const denied = setup({ raw, syncError: { code: 1 } });
  denied.ready(); denied.click();
  assert.deepEqual(denied.cleared, [0]);
  assert.equal(denied.data.get(KEY), raw);
  assert.equal(denied.timers.size, 0);
  assert.equal(denied.button().disabled, true);
});

test('current location details are available by touch and keyboard without a permanent tooltip', () => {
  const app = setup(); app.ready();
  const marker = app.currents[0];
  assert.equal(marker.config.interactive, true);
  assert.equal(marker.tooltip, undefined);
  assert.equal(marker.popup.children[0].textContent, 'Localização atual');
  assert.match(marker.popup.children[1].textContent, /cerca de 5 m/);
  assert.equal(app.elements['location-status'].className, 'map-status visually-hidden');
  assert.ok(!app.elements['location-status'].textContent.includes('precisão'));
  const element = marker.getElement();
  assert.equal(element.attributes.tabindex, '0');
  assert.equal(element.attributes.role, 'button');
  assert.match(element.attributes['aria-label'], /Localização atual/);
  for (const key of ['Enter', ' ']) {
    let prevented = false; marker.open = false;
    element.listeners.keydown({ key, preventDefault() { prevented = true; } });
    assert.equal(marker.open, true);
    assert.equal(prevented, true);
  }
  const invalid = setup(); invalid.gps[0].success(position(NaN, 0));
  assert.equal(invalid.elements['location-status'].className, 'map-status');
  assert.match(invalid.elements['location-status'].textContent, /Não foi possível/);
});

test('saved precision survives reload while old records without accuracy still restore', async () => {
  const app = setup(); app.ready(); app.save();
  app.respond(0, { address: 'Address' }); await tick();
  assert.equal(app.status(), 'Estacionamento salvo');
  const reopened = setup({ raw: app.data.get(KEY), noGps: true });
  assert.ok(reopened.cars[0].popup.children.some(child => /cerca de 5 m/.test(child.textContent)));
  assert.equal(reopened.requests.length, 0);
  assert.equal(reopened.saved().address, 'Address');
  const old = setup({ raw: JSON.stringify(record()), noGps: true });
  assert.equal(old.cars.length, 1);
  assert.ok(!old.cars[0].popup.children.some(child => /Precisão estimada/.test(child.textContent)));
  const invalid = setup({ raw: JSON.stringify(record({ accuracy: -1 })) });
  assert.equal(invalid.cars.length, 0);
  assert.match(invalid.status(), /Não foi possível recuperar/);
});

test('HTTP failures remain visible with controlled details and never expose raw provider errors', async () => {
  const cases = [[400, /não aceitou/], [404, /Nenhum endereço/], [429, /limite de consultas/],
    [503, /indisponível/], [504, /demorou demais/], [500, /Não foi possível consultar/]];
  for (const [status, expected] of cases) {
    const app = setup(); app.ready(); app.save();
    app.respond(0, { code: 'GEOCODING_UNAVAILABLE', message: '<script>raw provider error</script>' }, status);
    await tick();
    assert.equal(app.status(), 'Estacionamento salvo. Endereço indisponível.');
    assert.ok(app.cars[0].popup.children.some(child => expected.test(child.textContent)));
    assert.ok(!app.cars[0].popup.children.some(child => /raw provider/.test(child.textContent)));
    assert.equal(app.saved().address, null);
    assert.equal(app.saved().latitude, 30);
    assert.equal(app.requests.length, 1);
  }
});


test('parking button exposes busy state during acquisition and resets on success or failure', () => {
  for (const outcome of ['success', 'denied', 'timeout', 'storage']) {
    const app = setup(); app.ready();
    assert.equal(app.button().attributes['aria-busy'], 'false');
    app.click();
    assert.equal(app.button().attributes['aria-busy'], 'true');
    assert.equal(app.button().disabled, true);
    if (outcome === 'denied') app.watches[0].error({ code: 1 });
    else if (outcome === 'timeout') app.finish();
    else {
      app.options.writeError = outcome === 'storage';
      app.watches[0].success(position());
    }
    assert.equal(app.button().attributes['aria-busy'], 'false');
    assert.equal(app.button().textContent, 'Parked');
    assert.equal(app.button().disabled, outcome === 'denied');
  }
});

test('tile error stays visible until a successful loading cycle without affecting saved parking', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw });
  app.tileEvents.loading();
  app.tileEvents.tileerror();
  const error = app.elements['map-error'];
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /Não foi possível carregar partes do mapa/);
  app.tileEvents.load();
  assert.equal(error.hidden, false);
  app.tileEvents.loading();
  app.tileEvents.load();
  assert.equal(error.hidden, true);
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.writes.length, 0);
  assert.equal(app.requests.length, 0);
  assert.deepEqual(app.cars[0].point, [10, 20]);
});

test('map resize invalidates size without panning and works without ResizeObserver', () => {
  const raw = JSON.stringify(record()); const app = setup({ raw });
  assert.equal(app.resizeObservers.length, 1);
  assert.equal(app.resizeObservers[0].target, app.elements.map);
  const views = [...app.views];
  app.resizeObservers[0].callback();
  assert.deepEqual(app.invalidations, [{ pan: false }]);
  assert.deepEqual(app.views, views);
  assert.equal(app.data.get(KEY), raw);
  const unsupported = setup({ raw, noResizeObserver: true });
  unsupported.ready();
  assert.equal(unsupported.resizeObservers.length, 0);
  assert.equal(unsupported.cars.length, 1);
  assert.equal(unsupported.button().disabled, false);
});

// Clear Parking: exercise the real handlers, including defensive calls on disabled buttons.
test('clear action is hidden without valid parking and available on restoration without GPS', () => {
  for (const options of [{}, { raw: '{' }, { raw: JSON.stringify(record({ version: 2 })) }]) {
    const app = setup(options);
    assert.equal(app.clearButton().hidden, true);
    assert.equal(app.clearButton().disabled, true);
    app.clear();
    assert.equal(app.confirmations.length, 0);
    assert.equal(app.removals.length, 0);
    app.ready(); app.save();
    assert.equal(app.clearButton().hidden, false);
    assert.equal(app.clearButton().disabled, false);
  }
  for (const options of [{ noGps: true }, { secure: false }, { gpsThrows: true }, {}]) {
    const app = setup({ raw: JSON.stringify(record()), ...options });
    if (app.gps.length) app.gps[0].error({ code: 1 });
    assert.equal(app.clearButton().hidden, false);
    assert.equal(app.clearButton().disabled, false);
    const gpsCalls = app.gps.length;
    app.clear();
    assert.equal(app.data.has(KEY), false);
    assert.equal(app.status(), 'Marcação removida');
    assert.equal(app.button().disabled, true);
    assert.equal(app.document.activeElement, app.elements['parking-status']);
    assert.equal(app.gps.length, gpsCalls);
    assert.equal(app.requests.length, 0);
  }
  const noMap = setup({ noLeaflet: true, raw: JSON.stringify(record()) });
  assert.equal(noMap.clearButton().hidden, true);
  assert.equal(noMap.clearButton().disabled, true);
  assert.equal(noMap.data.has(KEY), true);
});

test('cancelling removal preserves parking, feedback and pending address operation', async () => {
  const app = setup({ confirm: false }); app.ready(); app.save();
  const raw = app.data.get(KEY), car = app.cars[0], popup = car.popup, status = app.status();
  app.clear();
  assert.deepEqual(app.confirmations, ['Remover a marcação do estacionamento?']);
  assert.equal(app.data.get(KEY), raw);
  assert.equal(app.cars[0], car);
  assert.equal(car.popup, popup);
  assert.equal(app.status(), status);
  assert.equal(app.removals.length, 0);
  assert.equal(app.removedLayers.length, 0);
  assert.equal(app.document.activeElement, undefined);
  app.respond(0, { address: 'Still current' }); await tick();
  assert.equal(app.saved().address, 'Still current');
  assert.equal(app.status(), 'Estacionamento salvo');
});

test('confirmed removal deletes only parking and preserves current location, accuracy and map view', () => {
  const app = setup(); app.ready(); app.save();
  app.data.set('unrelated', 'keep');
  const current = app.currents[0], circle = app.circles[0];
  const views = JSON.stringify(app.views), gpsCalls = app.gps.length, requests = app.requests.length;
  const point = [...current.point], radius = circle.config.radius;
  const tiles = JSON.stringify(app.tileConfigs);
  app.clear();
  assert.deepEqual(app.removals, [KEY]);
  assert.equal(app.data.has(KEY), false);
  assert.equal(app.data.get('unrelated'), 'keep');
  assert.deepEqual(app.removedLayers, [app.cars[0]]);
  assert.equal(app.currents[0], current);
  assert.equal(app.circles[0], circle);
  assert.equal(current.removed, undefined);
  assert.equal(circle.removed, undefined);
  assert.deepEqual(current.point, point);
  assert.equal(circle.config.radius, radius);
  assert.equal(JSON.stringify(app.views), views);
  assert.equal(JSON.stringify(app.tileConfigs), tiles);
  assert.match(app.tileConfigs[0].attribution, /OpenStreetMap/);
  assert.equal(app.gps.length, gpsCalls);
  assert.equal(app.requests.length, requests);
  assert.equal(app.clearButton().hidden, true);
  assert.equal(app.clearButton().disabled, true);
  assert.equal(app.status(), 'Marcação removida');
  assert.equal(app.document.activeElement, app.button());
  app.clear();
  assert.equal(app.confirmations.length, 1);
  const reopened = setup({ raw: app.data.get(KEY), noGps: true });
  assert.equal(reopened.cars.length, 0);
  assert.equal(reopened.clearButton().hidden, true);
  assert.equal(reopened.requests.length, 0);
});

test('storage removal and getter failures preserve parking and allow a subsequent retry', () => {
  for (const failure of ['removeError', 'storageAccessError']) {
    const app = setup({ raw: JSON.stringify(record()) }); app.ready();
    const raw = app.data.get(KEY), popup = app.cars[0].popup;
    app.options[failure] = true; app.clear();
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.cars[0].popup, popup);
    assert.equal(app.removedLayers.length, 0);
    assert.equal(app.clearButton().hidden, false);
    assert.equal(app.clearButton().disabled, false);
    assert.match(app.status(), /Não foi possível remover/);
    assert.equal(app.document.activeElement, undefined);
    app.options[failure] = false; app.clear();
    assert.equal(app.data.has(KEY), false);
    assert.equal(app.status(), 'Marcação removida');
  }
});

test('late HTTP outcomes after removal cannot rewrite storage, markers or confirmation', async () => {
  for (const outcome of ['success', 'http', 'network', 'timeout', 'invalid-json']) {
    const app = setup(); app.ready(); app.save(); app.clear();
    const writes = app.writes.length;
    if (outcome === 'success') app.respond(0, { address: 'Old address' });
    if (outcome === 'http') app.respond(0, {}, 503);
    if (outcome === 'network') app.requests[0].reject(new Error('offline'));
    if (outcome === 'timeout') [...app.timers].find(t => t.ms === 10000).callback();
    if (outcome === 'invalid-json') app.requests[0].resolve({ ok: true, json: async () => { throw new Error('JSON'); } });
    await tick();
    assert.equal(app.data.has(KEY), false);
    assert.equal(app.writes.length, writes);
    assert.equal(app.cars.length, 1);
    assert.equal(app.cars[0].removed, true);
    assert.equal(app.status(), 'Marcação removida');
    assert.equal(app.timers.size, 0);
  }
});

test('pending JSON after removal cannot restore parking even after a new parking is saved', async () => {
  for (const parkAgain of [false, true]) {
    const app = setup(); app.ready(); app.save();
    let resolveJson;
    app.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve; }) });
    await tick();
    assert.equal(typeof resolveJson, 'function');
    const oldId = app.saved().id;
    app.clear();
    if (parkAgain) {
      app.save(50, 60);
      assert.notEqual(app.saved().id, oldId);
      app.respond(1, { address: 'New address' }); await tick();
      assert.equal(app.cars.length, 2);
      assert.notEqual(app.cars[0], app.cars[1]);
      assert.equal(app.cars[1].removed, undefined);
      assert.deepEqual(app.cars[1].point, [50, 60]);
      assert.equal(app.clearButton().hidden, false);
      assert.equal(app.clearButton().disabled, false);
      assert.equal(app.data.size, 1);
    }
    const raw = app.data.get(KEY), status = app.status(), writes = app.writes.length;
    resolveJson({ address: 'Old JSON' }); await tick();
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.status(), status);
    assert.equal(app.writes.length, writes);
    assert.equal(app.cars.length, parkAgain ? 2 : 1);
  }
});

test('late HTTP cannot hide a removal error but may still enrich the preserved parking', async () => {
  for (const outcome of ['success', 'http', 'network']) {
    const app = setup(); app.ready(); app.save();
    app.options.removeError = true; app.clear();
    const error = app.status(), id = app.saved().id;
    if (outcome === 'success') app.respond(0, { address: 'Preserved address' });
    if (outcome === 'http') app.respond(0, {}, 503);
    if (outcome === 'network') app.requests[0].reject(new Error('offline'));
    await tick();
    assert.equal(app.status(), error);
    assert.equal(app.saved().id, id);
    assert.equal(app.cars.length, 1);
    assert.equal(app.removedLayers.length, 0);
    if (outcome === 'success') assert.equal(app.saved().address, 'Preserved address');
    app.save(60, 70); app.respond(1, { address: 'Next address' }); await tick();
    assert.equal(app.status(), 'Estacionamento salvo');
    assert.equal(app.saved().address, 'Next address');
  }
});

test('removal is blocked during acquisition and reenabled after success or failure', () => {
  for (const outcome of ['success', 'denied', 'timeout', 'storage']) {
    const app = setup({ raw: JSON.stringify(record()) }); app.ready(); app.click();
    assert.equal(app.clearButton().hidden, false);
    assert.equal(app.clearButton().disabled, true);
    const raw = app.data.get(KEY);
    app.clear();
    assert.equal(app.data.get(KEY), raw);
    assert.equal(app.confirmations.length, 0);
    assert.equal(app.removals.length, 0);
    if (outcome === 'denied') app.watches[0].error({ code: 1 });
    else if (outcome === 'timeout') app.finish();
    else {
      app.options.writeError = outcome === 'storage';
      app.watches[0].success(position());
    }
    assert.equal(app.clearButton().disabled, false);
    app.clear();
    assert.equal(app.status(), 'Marcação removida');
  }
});
