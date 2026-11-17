(() => {
  'use strict';

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

  if (!window.isSecureContext || !navigator.geolocation) {
    locationStatus.textContent = 'A localização exige HTTPS ou acesso por localhost e um navegador compatível.';
    return;
  }

  locationStatus.textContent = 'Obtendo sua localização...';

  function onSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const currentPosition = [latitude, longitude];

    map.setView(currentPosition, 16);
    L.circleMarker(currentPosition, {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
      interactive: false
    })
      .addTo(map)
      .bindTooltip('Localização atual', {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
        className: 'current-location-label'
      });

    locationStatus.textContent = 'Localização atual';
    if (Number.isFinite(accuracy) && accuracy >= 0) {
      locationStatus.textContent += ` — precisão estimada de ${Math.round(accuracy)} m.`;
    }
  }

  function onError(error) {
    const messages = {
      1: 'Permita o acesso à localização nas configurações do navegador para ver sua posição.',
      2: 'Não foi possível determinar sua localização.',
      3: 'A localização demorou demais para responder.'
    };
    locationStatus.textContent = messages[error.code] || 'Não foi possível determinar sua localização.';
  }

  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  });
})();
