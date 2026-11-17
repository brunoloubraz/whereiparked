# Where I Parked — Etapa 3: Mapa e Geolocalização

**Branch:** `feat/003-map-geolocation`  
**Status:** A implementar  
**Pré-requisito:** Etapa 2 (layout mobile-first) concluída.

## 1. Objetivo

Substituir o placeholder "Mapa em breve" por um mapa real e interativo, centralizado na localização atual do usuário após sua autorização, sem mudar o objetivo ou as funcionalidades da etapa 2.

**Definition of Done:** Ao abrir `http://localhost:8080`, visualizar tiles do mapa e, ao permitir a localização, ver a posição atual identificada sobre ele; se a permissão falhar, o mapa continua utilizável e uma mensagem compreensível aparece. A interface segue responsiva, e o botão **Parked** continua desabilitado.

## 2. Escopo incluído

1. Integrar **Leaflet 1.9.4** ao frontend estático existente (sem instalar Node, Vite ou React).
2. Usar tiles raster do **OpenStreetMap** com URL HTTPS oficial, atribuição visível e respeito à política de uso.
3. Substituir o placeholder por um contêiner de mapa com altura real, preservando cabeçalho e rodapé.
4. Obter **uma única leitura** da localização atual com `navigator.geolocation.getCurrentPosition()` após carregar a tela.
5. Centralizar o mapa nessa posição e exibir marcador de **localização atual** distinto do futuro marcador de estacionamento.
6. Exibir feedback de carregamento, sucesso e erros (permissão negada, posição indisponível, timeout, ambiente não seguro ou API não suportada).
7. Preservar responsividade e experiência de toque em celulares, especialmente Safari no iPhone.
8. Verificar o comportamento e registrar resultados no PR.

## 3. Fora do escopo — NÃO implementar

- Não habilitar o botão **Parked**.
- Não salvar ou recuperar estacionamentos; não usar `localStorage`, IndexedDB ou banco de dados.
- Não implementar marcadores de estacionamento ou histórico.
- Não fazer chamadas a `/api/location/reverse` nem ao Nominatim.
- Não modificar controllers, services, `pom.xml` ou lógica Java; Spring Boot continua servindo arquivos estáticos.
- Não criar login, PWA, serviço de rotas, busca de endereços, tracking contínuo (`watchPosition`), notificações ou novos menus.
- Não fazer commits ou abrir PR automaticamente.

## 4. Stack e responsabilidades

| Recurso | Tecnologia | Responsabilidade |
|---|---|---|
| Mapa interativo | Leaflet **1.9.4** | Renderizar mapa, zoom, arrasto, ponto atual |
| Dados visuais do mapa | OSM raster tiles | Desenhar ruas e geografia, com atribuição |
| Posição do dispositivo | Geolocation API | Uma leitura após autorização explícita do navegador |
| Layout e feedback | HTML + CSS | Mapa responsivo e mensagens de estado |
| Comportamento | JavaScript simples | Inicialização, geolocalização e tratamento de erros |
| Entrega dos arquivos | Spring Boot | Servir HTML, CSS e JS já existentes |

**Nota:** Leaflet 2.x está em beta (em nov/2026); usar a linha estável 1.9.4 e API global `L`.

## 5. Arquivos esperados

Arquivos já existentes a modificar conforme necessário:

```text
src/main/resources/static/
├── index.html
├── css/style.css
└── js/app.js
```

Sem necessidade de diretórios extra. É aceitável incluir um arquivo JS/CSS dedicado ao mapa se isso melhorar claramente a organização, mas não criar infraestrutura de build frontend apenas para a etapa 3.

## 6. Experiência esperada

### 6.1 Entrada
- A tela abre com cabeçalho "Where I Parked", área de mapa e botão **Parked** desabilitado.
- O mapa carrega no contêiner central e exibe controle de zoom e atribuição visível.
- Mensagem discreta: **"Obtendo sua localização..."**.
- Se a API solicitar permissão, o navegador deve apresentar a permissão nativa (não criar modal próprio).

### 6.2 Localização autorizada
- Ler `latitude`, `longitude` e `accuracy` do objeto retornado pela API.
- Centralizar o mapa no ponto atual com zoom adequado a ruas (por exemplo 16–17).
- Exibir **um indicador azul para a localização atual**, diferente do futuro pin do carro.
- Substituir a mensagem de carregamento por **"Localização atual"** ou ocultá-la se o marcador indicar claramente o estado.
- Nenhuma coordenada será gravada no armazenamento persistente.

### 6.3 Falhas
- **Permissão negada:** "Permita o acesso à localização nas configurações do navegador para ver sua posição."
- **Localização indisponível:** "Não foi possível determinar sua localização."
- **Tempo esgotado:** "A localização demorou demais para responder."
- **API ausente/contexto inseguro:** "A localização exige HTTPS ou acesso por localhost e um navegador compatível."
- Em qualquer falha, o mapa deve continuar visível e operável (pode abrir em visualização global neutra, não inventar uma posição de usuário).
- Não exibir alertas bloqueantes e não gerar erros de JS não tratados.

## 7. Diretrizes técnicas

### Leaflet

Incluir CSS e JS da versão estável 1.9.4, com integridade (SRI) se servido de CDN, conforme documentação oficial:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="" defer></script>
```

**Atenção:** `app.js` deve ser carregado com `defer` depois do script do Leaflet para `L` estar definido; não carregar o CSS da biblioteca depois do CSS que depende dele. Validar a ordem real do HTML existente.

Usar:

```js
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
```

- Manter a atribuição visível, inclusive sobre o rodapé no mobile.
- Não implementar prefetch, downloads em massa, modo offline ou cache-busting de tiles.
- Não definir política de Referrer que remova o Referer necessário aos tiles do OSM.
- Configurar URL de tiles em uma constante fácil de substituir no futuro, se for necessário outro provedor.

### HTML/CSS

- Preservar layout da etapa 2, substituindo a mensagem no bloco `#map` por renderização da biblioteca.
- O contêiner do Leaflet precisa de **altura não zero** e largura real em mobile/desktop.
- Manter região de status separada do nó que o Leaflet controla; evitar alterações de `innerHTML` depois que o mapa foi inicializado.
- Usar `role="status"` e `aria-live="polite"` para o texto de estado.
- Não permitir sobreposição do mapa com cabeçalho, botão ou atribuição.
- Considerar `100dvh`, área segura do iPhone e possibilidade de rolagem vertical em telas baixas.
- Não recriar completamente o design da etapa 2.

### Geolocalização

Preferir:

```js
navigator.geolocation.getCurrentPosition(onSuccess, onError, {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0
});
```

- `getCurrentPosition` faz **uma leitura**; não usar `watchPosition` neste PR.
- Se `navigator.geolocation` não existir ou `window.isSecureContext` for falso, exibir mensagem amigável.
- Exibir apenas a posição autorizada como localização atual; não atribuir coordenadas fixas de uma cidade ao usuário.
- A precisão é estimada em metros, nunca garantir posicionamento exato; não é obrigatório desenhar círculo de acurácia neste PR.
- Não imprimir latitude e longitude precisas nos logs ou analytics.

## 8. Plano de implementação (incremental)

1. **Revisar:** ler `AGENTS.md` e o layout existente; apresentar plano curto, sem alterar arquivos.
2. **Mapa:** integrar Leaflet 1.9.4, criar/ajustar contêiner, carregar tiles OSM e atribuição. Conferir que o botão Parked permanece desabilitado.
3. **Localização:** chamar `getCurrentPosition` uma vez, criar marcador azul de localização atual e centralizar a visualização quando houver sucesso.
4. **Estados e erros:** indicar carregamento/sucesso, falhas de permissão, indisponibilidade, timeout, HTTPS e falta de suporte.
5. **Responsividade e QA:** verificar altura do contêiner, interações touch, atribuição, rolagens e console.
6. **Revisão:** rodar `./mvnw clean verify`, `git diff --check` e listar arquivos alterados, critérios cumpridos e limitações. Não criar commit/PR.

## 9. Critérios de aceite (checklist)

- [ ] `./mvnw spring-boot:run` serve o app em `http://localhost:8080`.
- [ ] Mapa Leaflet real substitui "Mapa em breve" e permite zoom/arrasto.
- [ ] Tiles OSM são carregados com atribuição visível.
- [ ] Permissão de localização é solicitada pelo navegador ao usar a API.
- [ ] Permissão concedida: mapa centralizado na posição atual e marcador azul visível.
- [ ] Permissão negada, timeout e indisponibilidade exibem textos úteis, sem quebrar o mapa.
- [ ] O app funciona sem scroll horizontal a 320/375/390/440 px, além de tablet/desktop.
- [ ] Em Safari/ambiente HTTPS a localização pode ser testada; teste emulado no Chrome não equivale a teste real no iPhone.
- [ ] `Parked` permanece com `disabled`, sem listener que registre estacionamento.
- [ ] Nenhum `localStorage`, Nominatim, API REST nova, backend ou PWA introduzido.
- [ ] Sem erros de aplicação no console e `./mvnw clean verify` passa.

## 10. Atenção a localhost x iPhone

- `http://localhost:8080` é considerado contexto seguro no próprio computador.
- A simulação de iPhone no DevTools usa a geolocalização do navegador/ambiente desktop; não testa o GPS real do telefone.
- `http://IP_DO_MAC:8080` acessado **pelo iPhone** normalmente **não é contexto seguro** e pode bloquear a Geolocation API.
- Para teste real no Safari do iPhone, utilizar uma URL HTTPS válida (por exemplo um túnel HTTPS configurado para o servidor local) ou posteriormente o deploy HTTPS.
- A API só funciona se o usuário autorizar e as permissões do sistema operacional permitirem.

## 11. Referências

- Leaflet 1.9.4 Quick Start: https://leafletjs.com/examples-v1/quick-start/
- Leaflet 1.9.4 API: https://leafletjs.com/reference-1.9.4.html
- Leaflet versões: https://leafletjs.com/reference-versions.html
- OpenStreetMap Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- MDN getCurrentPosition: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- MDN Secure Contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts

## 12. Orientação para o Codex

Consultar este documento e `AGENTS.md`. Trabalhar na branch `feat/003-map-geolocation`. **Primeiro inspecionar os arquivos atuais e propor um plano sem escrever código.** Após aprovação, implementar incrementalmente, preservando o design concluído. Não alterar arquivos de outras etapas, não criar commits nem PR sem solicitação, e apresentar relatório de validação.
