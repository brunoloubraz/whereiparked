# Etapa 2 — Interface mobile-first

**Branch planejada:** `feat/002-mobile-layout`  
**Situação:** a etapa 1 (bootstrap Spring Boot) está concluída.  
**Meta:** construir uma interface estática e responsiva, acessível em `http://localhost:8080`, preparada para receber mapa e geolocalização em fases posteriores.

## 1. Escopo funcional estrito
Implementar somente:
1. `src/main/resources/static/index.html`.
2. `src/main/resources/static/css/style.css`.
3. `src/main/resources/static/js/app.js` (pode estar vazio, com comentário de ponto de entrada; NÃO inventar lógica).
4. Cabeçalho com nome **Where I Parked** e, opcionalmente, um ícone simples de localização/carro sem dependência externa.
5. Região central reservada ao mapa, identificada como `id="map"`, com placeholder textual **Mapa em breve** e descrição curta.
6. Rodapé/área inferior com botão **Parked** visualmente destacado, porém `disabled` nesta fase.
7. Layout mobile-first fluido e responsivo para celular, tablet e desktop.

### Fora do escopo (não implementar)
- Leaflet, mapas reais ou tiles OpenStreetMap.
- Permissões, rastreamento de GPS ou Geolocation API.
- Nominatim, API REST, requisições HTTP ou lógica Java nova.
- localStorage, banco de dados, autenticação, históricos.
- Interação real do botão Parked, alertas fictícios ou marcadores.
- Menu de configuração, dark mode, bibliotecas CSS/JS adicionais, PWA, Docker e deploy.
- Alterações no `pom.xml`, salvo se for identificado bloqueio real e houver autorização do usuário.

## 2. Direção visual
Estilo: limpo, moderno e minimalista, com **tema claro** apenas.

### Cores de referência
- Azul primário: `#2563EB`.
- Fundo da página: `#F8FAFC`.
- Texto principal: `#0F172A`.
- Texto secundário: `#64748B`.
- Bordas: `#E2E8F0`.

### Tipografia e escala
- Preferir `system-ui, sans-serif`, sem baixar fontes.
- Título do cabeçalho: aproximadamente 20–22px, peso 600.
- Texto regular: 14–16px com boa legibilidade e contraste.
- Botão: min-height de 52–56px, texto legível; largura quase total em celular e largura máxima moderada em desktop.
- Espaçamento lateral padrão: 16px no mobile, ampliado em telas maiores.
- Bordas arredondadas: cerca de 12–20px.

### Modelo de composição (wireframe, não código final)
```
+-----------------------------------+
| [ícone] Where I Parked            |  <- header
+-----------------------------------+
|                                   |
|                                   |
|           [ícone mapa]            |
|           Mapa em breve           |  <- main id="map"
| Aqui será exibida sua localização |
|                                   |
|                                   |
+-----------------------------------+
|         [ Parked (disabled) ]     |  <- footer
+-----------------------------------+
```
No desktop, manter conteúdo centralizado e evitar botão excessivamente largo. O placeholder deve ocupar a maior parte da altura disponível.

## 3. Requisitos de responsividade e acessibilidade
- Primeiro estilizar para telas pequenas (inclusive 320px de largura); depois usar media queries apenas se necessárias.
- Testar larguras de 320px, 375/390px, 768px e 1280px.
- Não permitir rolagem horizontal ou elementos sobrepostos.
- Preferir altura `100dvh`, com fallback apropriado, e respeitar `env(safe-area-inset-bottom)` na base.
- Em telas de pouca altura, rolagem vertical é aceitável; nada pode ficar inacessível.
- Usar landmarks semânticos (`header`, `main`, `footer`), `<h1>` e botão HTML nativo.
- O botão deve continuar desabilitado de maneira acessível; não atribuir a ele um comportamento falso.
- Não usar apenas cor como significado; garantir contraste e foco visível quando aplicável.

## 4. Organização esperada
```
src/main/resources/static/
├── index.html
├── css/
│   └── style.css
└── js/
    └── app.js
```
O Spring Boot existente deve servir `index.html` automaticamente na raiz.

## 5. Plano de implementação em pequenos incrementos
1. Inspecionar a estrutura atual, branch e arquivos existentes (sem destruir alterações).
2. Criar o HTML semântico com os três blocos e referenciar CSS/JS.
3. Aplicar tokens de cor, tipografia e layout responsivo no CSS.
4. Ajustar tamanhos e alinhamento mobile e desktop.
5. Executar `./mvnw clean verify`; subir com `./mvnw spring-boot:run` se viável.
6. Relatar como validar `http://localhost:8080`, o que foi modificado e o que está fora do escopo.

## 6. Critérios de aceite
- [ ] `http://localhost:8080` exibe a página sem erro de rota quando a aplicação está rodando.
- [ ] Cabeçalho mostra **Where I Parked**.
- [ ] Centro contém placeholder do mapa com `id="map"`.
- [ ] Botão **Parked** aparece embaixo, está claramente visível e `disabled`.
- [ ] Layout é consistente em 320, 375/390, 768 e 1280px, sem overflow horizontal.
- [ ] HTML semântico e legível, incluindo em Safari mobile.
- [ ] Console sem erros causados por nossos arquivos.
- [ ] Nenhuma API externa, integração de mapa, GPS ou persistência implementada.
- [ ] Build/testes existentes passam ou os bloqueios são documentados.

## 7. Conclusão e reporte
Ao terminar, informar: arquivos criados/alterados; resumo das decisões visuais; comandos e resultados de validação; limitações; próximos passos (sem implementá-los). Não criar commit ou PR automaticamente.
