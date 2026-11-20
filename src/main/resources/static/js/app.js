(() => {
  'use strict';

  const PARKING_KEY = 'whereiparked:parking:v1';
  const ACQUISITION_MS = 5000;
  const TARGET_ACCURACY_M = 10;
  const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
  const parkButton = document.getElementById('park-button');
  const parkingStatus = document.getElementById('parking-status');
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const locationStatus = document.getElementById('location-status');
  const mapError = document.getElementById('map-error');
  const mapElement = document.getElementById('map');

  if (typeof window.L === 'undefined') {
    locationStatus.textContent = 'Não foi possível carregar o mapa. Verifique sua conexão e recarregue a página.';
    return;
  }

  const map = L.map(mapElement).setView([0, 0], 2);
  let tilesFailed = false;

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  })
    .on('loading', () => {
      tilesFailed = false;
    })
    .on('tileerror', () => {
      tilesFailed = true;
      mapError.textContent = 'Não foi possível carregar partes do mapa. Verifique sua conexão.';
      mapError.hidden = false;
    })
    .on('load', () => {
      mapError.hidden = !tilesFailed;
    })
    .addTo(map);

  // A barra do Safari, a rotação e as mensagens podem mudar a área do mapa.
  if (typeof ResizeObserver !== 'undefined') {
    const mapResizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    mapResizeObserver.observe(mapElement);
  }

  let parking = null;
  let parkingMarker = null;
  let currentMarker = null;
  let accuracyCircle = null;
  let locationUsable = false;
  let capturing = false;
  let operation = 0;

  function validCoordinates(value) {
    return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
      && value.latitude >= -90 && value.latitude <= 90
      && value.longitude >= -180 && value.longitude <= 180;
  }

  function validAccuracy(coords) {
    return Number.isFinite(coords.accuracy) && coords.accuracy >= 0;
  }

  function readParking() {
    const raw = window.localStorage.getItem(PARKING_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || value.version !== 1 || !validCoordinates(value)
        || typeof value.id !== 'string' || !value.id.trim()
        || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))
        || !(value.address === null || typeof value.address === 'string')
        || (value.accuracy != null && !validAccuracy(value))) {
      throw new Error('Invalid parking record');
    }
    return value;
  }

  function showParking(record, center, addressInfo = 'Endereço não disponível para este estacionamento.') {
    const point = [record.latitude, record.longitude];
    if (!parkingMarker) {
      const symbol = document.createElement('span');
      symbol.textContent = 'P';
      symbol.setAttribute('aria-hidden', 'true');
      parkingMarker = L.marker(point, {
        icon: L.divIcon({ className: 'parking-icon', html: symbol, iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: 'Seu carro está aqui',
        alt: 'Seu carro está aqui',
        keyboard: true,
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      parkingMarker.setLatLng(point);
    }
    const popup = document.createElement('div');
    popup.className = 'parking-popup';
    const label = document.createElement('strong');
    label.textContent = 'Seu carro está aqui';
    popup.append(label);
    if (record.address && record.address.trim()) {
      const address = document.createElement('p');
      address.textContent = `Endereço aproximado: ${record.address}`;
      const attribution = document.createElement('a');
      attribution.href = 'https://www.openstreetmap.org/copyright';
      attribution.textContent = 'Geocodificação: © OpenStreetMap contributors (ODbL), via Nominatim';
      popup.append(address, attribution);
    } else {
      const addressStatus = document.createElement('p');
      addressStatus.textContent = addressInfo;
      popup.append(addressStatus);
    }
    if (validAccuracy(record)) {
      popup.append(accuracyDetails(record.accuracy));
    }
    parkingMarker.bindPopup(popup, { autoPan: false });
    if (center) map.setView(point, 16);
  }

  // Restaurar antes de verificar GPS: a posição salva independe da permissão atual.
  try {
    parking = readParking();
    if (parking) {
      showParking(parking, true);
      parkingStatus.textContent = 'Estacionamento salvo restaurado.';
    }
  } catch {
    parkingStatus.textContent = 'Não foi possível recuperar o estacionamento salvo neste navegador.';
  }

  if (!window.isSecureContext || !navigator.geolocation) {
    locationStatus.textContent = 'A localização exige HTTPS ou acesso por localhost e um navegador compatível.';
    return;
  }

  function updateButton() {
    parkButton.disabled = capturing || !locationUsable;
    parkButton.textContent = capturing ? 'Marcando...' : 'Parked';
    parkButton.setAttribute('aria-busy', String(capturing));
  }

  function accuracyDetails(accuracy) {
    const text = document.createElement('p');
    text.textContent = `Precisão estimada: cerca de ${Math.ceil(accuracy)} m. É uma estimativa, não uma garantia de exatidão.`;
    return text;
  }

  function setLocationStatus(message, quiet = false) {
    locationStatus.textContent = message;
    locationStatus.className = quiet ? 'map-status visually-hidden' : 'map-status';
  }

  function updateCurrentPosition(coords) {
    const point = [coords.latitude, coords.longitude];
    if (validAccuracy(coords)) {
      if (!accuracyCircle) {
        accuracyCircle = L.circle(point, {
          radius: coords.accuracy,
          color: '#2563eb',
          weight: 1,
          opacity: 0.4,
          fillColor: '#2563eb',
          fillOpacity: 0.1,
          interactive: false
        }).addTo(map);
        accuracyCircle.bringToBack();
      } else {
        accuracyCircle.setLatLng(point).setRadius(coords.accuracy);
      }
    } else if (accuracyCircle) {
      map.removeLayer(accuracyCircle);
      accuracyCircle = null;
    }
    if (!currentMarker) {
      currentMarker = L.circleMarker(point, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
        interactive: true
      }).addTo(map);
      const markerElement = currentMarker.getElement();
      markerElement.setAttribute('tabindex', '0');
      markerElement.setAttribute('role', 'button');
      markerElement.setAttribute('aria-label', 'Localização atual. Consultar precisão estimada.');
      markerElement.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          currentMarker.openPopup();
        }
      });
    } else {
      currentMarker.setLatLng(point);
    }
    const popup = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = 'Localização atual';
    popup.append(label);
    if (validAccuracy(coords)) {
      popup.append(accuracyDetails(coords.accuracy));
    }
    currentMarker.bindPopup(popup, { autoPan: false });
    setLocationStatus('Localização disponível. Consulte o ponto azul para detalhes.', true);
  }

  function acquireParkingPosition(onSuccess, onError) {
    let best = null;
    let lastError = { code: 3 };
    let watchId = null;
    let finished = false;
    let starting = true;
    let pendingFinish = null;

    function finish(error) {
      if (finished) return;
      if (starting) {
        pendingFinish = { error };
        return;
      }
      finished = true;
      clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('pagehide', onPageHide);
      if (error || !best) onError(error || lastError);
      else onSuccess({ coords: best });
    }

    function onPageHide() {
      // Sair da página cancela a aquisição sem salvar uma amostra parcial.
      finish({ code: 2 });
    }

    // O timeout do watch vale para leituras individuais; este limita toda a operação.
    const timer = setTimeout(() => finish(), ACQUISITION_MS);
    window.addEventListener('pagehide', onPageHide);
    try {
      watchId = navigator.geolocation.watchPosition(position => {
        if (finished || pendingFinish) return;
        const coords = position.coords;
        if (!validCoordinates(coords) || !validAccuracy(coords)) {
          lastError = { code: 2 };
          return;
        }
        if (!best || coords.accuracy < best.accuracy) {
          best = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
          updateCurrentPosition(best);
        }
        if (best.accuracy <= TARGET_ACCURACY_M) finish();
      }, error => {
        if (finished || pendingFinish) return;
        lastError = error;
        // Negação de permissão encerra sem salvar, mesmo se já houve uma amostra.
        if (error.code === 1) finish(error);
      }, { ...GPS_OPTIONS, timeout: ACQUISITION_MS });
      // Se o callback ocorrer durante a criação, limpar o watch antes de salvar.
      starting = false;
      if (pendingFinish) finish(pendingFinish.error);
    } catch {
      starting = false;
      finish({ code: 2 });
    }
  }

  function gpsMessage(error) {
    const messages = {
      1: 'Permita o acesso à localização nas configurações do navegador para ver sua posição.',
      2: 'Não foi possível determinar sua localização.',
      3: 'A localização demorou demais para responder. Tente novamente.'
    };
    return messages[error.code] || 'Não foi possível obter sua localização.';
  }

  function parkingId() {
    if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    // 128 bits aleatórios para identificar a operação em navegadores sem randomUUID.
    return Array.from(window.crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function storedOperation(id) {
    if (!parking || parking.id !== id) return null;
    const current = readParking();
    return current?.id === id ? current : null;
  }

  async function enrichAddress(record, startedOperation) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let message = 'Estacionamento salvo. Endereço indisponível.';
    let detail = 'Não foi possível consultar o endereço. Verifique sua conexão ou tente mais tarde.';
    try {
      const query = new URLSearchParams({ lat: record.latitude, lon: record.longitude });
      const response = await fetch(`/api/location/reverse?${query}`, { signal: controller.signal });
      if (!response.ok) {
        const errors = {
          400: 'O serviço de endereço não aceitou a localização enviada.',
          404: 'Nenhum endereço foi encontrado para este ponto.',
          429: 'O limite de consultas de endereço foi atingido. Tente mais tarde.',
          503: 'O serviço de endereço está indisponível no momento.',
          504: 'O serviço demorou demais para consultar o endereço.'
        };
        detail = errors[response.status] || 'Não foi possível consultar o endereço no momento.';
        return;
      }
      let body;
      try {
        body = await response.json();
      } catch {
        detail = 'O serviço retornou uma resposta de endereço inválida.';
        return;
      }
      if (body?.address === null || (typeof body?.address === 'string' && !body.address.trim())) {
        detail = 'Nenhum endereço foi encontrado para este ponto.';
        return;
      }
      if (typeof body?.address !== 'string') {
        detail = 'O serviço retornou uma resposta de endereço inválida.';
        return;
      }
      const current = storedOperation(record.id);
      if (!current) {
        message = null;
        return;
      }
      const enriched = { ...current, address: body.address.trim() };
      try {
        window.localStorage.setItem(PARKING_KEY, JSON.stringify(enriched));
      } catch {
        message = 'Estacionamento salvo. Não foi possível salvar o endereço.';
        detail = 'O endereço foi encontrado, mas não pôde ser salvo neste navegador.';
        return;
      }
      parking = enriched;
      showParking(parking, false);
      message = 'Estacionamento salvo';
      detail = null;
    } catch {
      if (controller.signal.aborted) detail = 'A consulta de endereço demorou demais para responder.';
      // Endereço é opcional: nunca desfazer a gravação das coordenadas nem repetir HTTP.
    } finally {
      clearTimeout(timer);
      if (message && operation === startedOperation && parking?.id === record.id) {
        if (detail) showParking(parking, false, detail);
        parkingStatus.textContent = message;
      }
    }
  }

  parkButton.addEventListener('click', () => {
    if (capturing || !locationUsable) return;
    capturing = true;
    const startedOperation = ++operation;
    updateButton();
    parkingStatus.textContent = 'Marcando...';

    function failed(error) {
      if (error.code === 1) locationUsable = false;
      capturing = false;
      updateButton();
      parkingStatus.textContent = gpsMessage(error);
    }

    try {
      acquireParkingPosition(position => {
        if (!validCoordinates(position.coords)) {
          failed({ code: 2 });
          return;
        }
        let record;
        try {
          record = {
            version: 1,
            id: parkingId(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: null,
            accuracy: position.coords.accuracy,
            savedAt: new Date().toISOString()
          };
          window.localStorage.setItem(PARKING_KEY, JSON.stringify(record));
        } catch {
          capturing = false;
          updateButton();
          parkingStatus.textContent = 'Não foi possível salvar neste navegador.';
          return;
        }
        parking = record;
        updateCurrentPosition(position.coords);
        showParking(parking, true, 'Buscando endereço...');
        capturing = false;
        updateButton();
        parkingStatus.textContent = 'Estacionamento salvo';
        void enrichAddress(record, startedOperation);
      }, failed);
    } catch {
      failed({ code: 2 });
    }
  });

  locationStatus.textContent = 'Obtendo sua localização...';
  try {
    navigator.geolocation.getCurrentPosition(position => {
      if (!validCoordinates(position.coords)) {
        setLocationStatus(gpsMessage({ code: 2 }));
        return;
      }
      locationUsable = true;
      updateCurrentPosition(position.coords);
      if (!parking) map.setView([position.coords.latitude, position.coords.longitude], 16);
      updateButton();
    }, error => {
      setLocationStatus(gpsMessage(error));
      updateButton();
    }, GPS_OPTIONS);
  } catch {
    setLocationStatus(gpsMessage({ code: 2 }));
  }
})();
