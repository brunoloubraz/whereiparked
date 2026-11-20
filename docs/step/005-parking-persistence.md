# Where I Parked — Etapa 5: Parked + persistência local

**Branch proposta:** `feat/005-parking-persistence`  
**Estado anterior:** etapas 1–4 concluídas e integradas.  
**Objetivo:** integrar o botão **Parked**, preservar **um único** estacionamento no navegador e consultar a API Java já existente para obter um endereço opcional.

## 1. Resultado esperado

1. A pessoa abre o site: o mapa Leaflet e a geolocalização atual da etapa 3 continuam funcionando.
2. Quando há uma localização utilizável, o botão **Parked** fica habilitado.
3. Ao pressionar **Parked**, a aplicação coleta **novas leituras** com `navigator.geolocation.watchPosition()` por até 5 segundos e encerra antecipadamente com precisão estimada de até 10 m; caso contrário, escolhe a melhor amostra válida ao final (não reutiliza a posição do carregamento).
4. Ao final da aquisição, com uma amostra válida, salva **um registro único** em `localStorage`, substituindo o anterior.
5. Um marcador **visualmente distinto da localização atual** aparece no ponto estacionado, acompanhado de confirmação acessível de sucesso.
6. A aplicação faz **uma única tentativa** de consulta a `GET /api/location/reverse?lat=...&lon=...` e acrescenta o endereço ao registro **se** a consulta funcionar.
7. Se a geocodificação falhar (429, 503, 504, offline, timeout etc.), o estacionamento **continua salvo pelas coordenadas**; a pessoa pode voltar para vê-lo.
8. Ao fechar e reabrir a página no **mesmo navegador/origem**, o marcador estacionado é restaurado sem exigir nova geocodificação e **mesmo se o GPS atual não estiver disponível**.
9. Se estacionar novamente, a nova posição **substitui** a anterior; não há histórico.

## 2. Escopo e restrições

**Incluído:** estado visual do botão, captura pontual, `localStorage`, marcador de estacionamento, restauração, endereço opcional via API existente, mensagens discretas de estado/erro e tratamento dos casos de falha.

**Não incluído:** login, banco remoto, histórico, rotas, botão de apagar histórico, navegação guiada, notificações, PWA, service worker, polling, rastreamento contínuo, nova API Java, novas dependências grandes, deploy e alterações de infraestrutura.

**Preservar:** layout da etapa 2, mapa e indicação de posição atual da etapa 3, contratos/códigos de erro da API Java da etapa 4.

## 3. Contrato de armazenamento local

**Chave fixa:** `whereiparked:parking:v1`.

Exemplo de valor JSON salvo pelo frontend:

```json
{
  "version": 1,
  "id": "e2dd0e43-c601-45dc-b8c9-4db09546ab23",
  "latitude": -23.5614,
  "longitude": -46.6559,
  "address": null,
  "savedAt": "2026-11-16T23:00:00.000Z"
}
```

- `latitude` e `longitude` são a **fonte da verdade** para o marcador.
- `address` é informação opcional para exibição, jamais uma dependência para salvar. O JSON acima é um exemplo, não contém um endereço real.
- `id` identifica uma operação de estacionamento e permite descartar respostas atrasadas da API; gere com `crypto.randomUUID()` quando disponível em contexto seguro. Se a implementação optar por outra estratégia segura de identificação, documentá-la.
- `accuracy` é opcional na versão 1; novos registros guardam a precisão estimada em metros. Ausência nos registros antigos é aceita.
- `savedAt` é metadado técnico; não criar uma nova tela ou histórico com ele nesta etapa.
- A chave armazena **um objeto**, não um array.
- A leitura deve validar JSON, versão e coordenadas finitas dentro dos intervalos (-90 a 90, -180 a 180); dados corrompidos não podem quebrar a página.
- Tratar `SecurityError`, `QuotaExceededError` e outras falhas de leitura/escrita. **Não comunicar sucesso** se a escrita falhar; manter marcador anterior intacto.
- A persistência é por **origem e navegador**: `localhost` e um domínio de produção não compartilham automaticamente dados. Modo privado, limpeza de dados e políticas de retenção podem removê-los.

## 4. Fluxo de implementação

### 4.1 Inicialização

- Inicializar o mapa como já ocorre na etapa 3.
- Ler/validar o estacionamento salvo e, se válido, criar o marcador estacionado.
- Priorizar a visualização do **ponto estacionado salvo** ao reabrir a página; a localização atual pode ser mostrada separadamente, mas a chegada posterior do GPS não deve tirar o carro da tela inadvertidamente.
- Caso não haja estacionamento salvo, conservar o comportamento atual de centralizar na localização da pessoa.
- Não chamar a API de endereço na inicialização: usar o texto armazenado (quando houver).

### 4.2 Botão Parked

- Habilitar somente quando o navegador oferece geolocalização e a aplicação tem uma leitura inicial utilizável; se a permissão for negada, mantê-lo indisponível e explicar o motivo.
- Ao clicar, impedir cliques repetidos durante a captura. Informar estado transitório, `Marcando...`.
- Coletar posições **novas** com `watchPosition()` e `{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }`. Um timer independente limita a operação a 5 segundos: o timeout do watch refere-se às leituras, não à duração total.
- Selecionar a amostra de menor precisão estimada finita e não negativa, sem médias e sem exigir um limite impossível. Em empate, conservar a primeira. Não usar a posição inicial como fallback.
- Encerrar antecipadamente assim que uma amostra válida tiver `accuracy <= 10` metros. Não aguardar o prazo nesse caso. Ao final do prazo sem atingir essa precisão, usar a melhor amostra disponível, mesmo sem melhoria. Sem amostra válida, preservar o registro anterior. Erros transitórios permitem continuar até o prazo; permissão negada encerra imediatamente sem salvar.
- Executar `clearWatch()` ao encerrar, inclusive em falhas ou saída da página; ignorar callbacks posteriores. Não manter rastreamento depois de salvar.
- Validar coordenadas finitas e dentro dos intervalos antes de salvar.
- Preparar registro com endereço `null` e gravar em `localStorage` **antes** de anunciar sucesso e antes da consulta HTTP. Se armazenamento falhar, manter registro anterior/indicador anterior e exibir mensagem de falha.
- Após gravação bem-sucedida, atualizar marcador de estacionamento (distinto do ponto azul de localização atual), centralizar no novo estacionamento e comunicar confirmação em um elemento com `role="status"` ou `aria-live="polite"`.
- Não usar um endereço retornado pela API como fonte de coordenadas.

### 4.3 Endereço opcional

- Fazer **uma** chamada HTTP para `/api/location/reverse?lat=...&lon=...` após a gravação bem-sucedida.
- Reutilizar contrato e tratamento HTTP da etapa 4; o backend já controla sua integração com Nominatim, cache e limites.
- Se a API retornar 200 com endereço utilizável, atualizar **somente** `address` do registro correspondente à operação atual (comparar `id` antes de gravar). Caso outro estacionamento já tenha substituído o primeiro, **ignorar resposta atrasada**.
- Se a API falhar, manter endereço `null` e mostrar, se necessário, `Endereço indisponível` sem retirar o marcador. Não fazer retries automáticos (especialmente por 429).
- Nunca inserir resposta externa como HTML arbitrário. Usar `textContent` ou sanitização equivalente.
- Não registrar coordenadas precisas nos logs do navegador.

## 5. Interface mínima

- Manter cabeçalho, mapa, ponto azul da **localização atual** e botão **Parked**.
- Adicionar marcador de **carro estacionado** com símbolo/cor distinto; rótulo ou popup acessível do tipo `Seu carro está aqui`, exibindo endereço somente quando disponível.
- Pequeno feedback visual/textual próximo ao botão: `Estacionamento salvo` / `Não foi possível obter sua localização` / `Não foi possível salvar neste navegador`.
- Evitar modais, dashboards, telas de histórico e componentes extras.
- Não sugerir que o endereço é exato: o GPS e a geocodificação têm precisão limitada.
- Mostrar confirmação curta `Estacionamento salvo` e manter um `L.circle()` azul translúcido para a localização atual, com raio em metros igual a `coords.accuracy`. Não é garantia de que a posição real esteja dentro do círculo. Localização e precisão atual ficam no popup do ponto azul, sem balão permanente ou texto longo sob o mapa; o ponto deve aceitar toque e teclado.
- Usar anel verde vazado com **P** lateral para o carro, mantendo o ponto azul visível quando coincidem, sem deslocar coordenadas. O círculo acompanha as melhorias da leitura atual durante a captura.
- Preservar a chave e versão local v1, aceitando `accuracy` opcional (número finito não negativo) para exibir a precisão no popup do estacionamento após reabrir. Registros antigos sem esse campo continuam válidos; não inventar precisão. O endereço e seus erros detalhados também ficam nesse popup. Não desenhar raio de precisão fictício para um carro restaurado sem GPS atual.

## 6. Arquivos esperados

O Codex deve primeiro inspecionar o repositório e usar os arquivos reais, normalmente:

- `src/main/resources/static/index.html`: status acessível, atributo `disabled` gerenciado pela lógica.
- `src/main/resources/static/css/style.css`: diferenças visuais e pequenos estados.
- `src/main/resources/static/js/app.js`: orquestração da geolocalização, storage, mapa e API; refatorações pequenas opcionais se melhorarem a clareza.
- `README.md` e `docs/step/005-parking-persistence.md`: documentação de uso, armazenamento por origem, erro externo e limitações.

Não alterar classes Java nem `pom.xml` sem causa técnica comprovada.

## 7. Incrementos de desenvolvimento

1. **Leitura e restauração:** criar abstração mínima de armazenamento e marcador estacionado; verificar que o registro salvo aparece ao reabrir a página.
2. **Botão e captura recente:** habilitar/desabilitar corretamente, obter nova posição, escrever `localStorage` e substituir marcador anterior.
3. **Integração Java:** consultar endpoint existente uma vez, enriquecer endereço opcional e proteger contra respostas atrasadas.
4. **Erros e UX:** erros de GPS, armazenamento e API, estados de botão, feedback acessível e responsividade.
5. **Verificação final:** testar fluxos e critérios de aceite, `./mvnw clean verify`, `git diff --check` e revisar alterações.

## 8. Testes de aceite obrigatórios

- [ ] Sem registro: mapa funciona e nenhum marcador de carro é exibido.
- [ ] Com permissão: Parked habilita, captura posição nova, salva uma entrada válida e mostra marcador de carro.
- [ ] Recarregar página/fechar e reabrir: marcador do carro persiste no mesmo navegador e endereço (se salvo) reaparece sem nova chamada HTTP.
- [ ] Salvar novo estacionamento: somente o último marcador continua visível e há um único objeto na chave de armazenamento.
- [ ] GPS negado/prazo encerrado sem amostra válida ao estacionar: mensagem compreensível, **registro anterior preservado**.
- [ ] API 503 (sem GEOCODING_USER_AGENT), 429, 504 ou sem rede: coordenadas permanecem salvas e marcador funciona.
- [ ] API 200: endereço é exibido e persistido, mas coordenadas originais são mantidas.
- [ ] Resposta da primeira consulta chega depois de salvar outra posição: não substitui o endereço do estacionamento mais recente.
- [ ] Falha de `localStorage.setItem`: nenhuma confirmação falsa, sem destruir registro anterior.
- [ ] JSON corrompido/versão desconhecida/coordenadas inválidas: página carrega sem falha fatal.
- [ ] Botão não permite múltiplos salvamentos simultâneos; textos acessíveis; mapa responsivo.
- [ ] Nenhuma alteração de frontend da etapa 3 foi quebrada; API da etapa 4 continua com testes passando.
- [ ] `./mvnw clean verify` e `git diff --check` sem erros.

Testes automatizados de JavaScript são desejáveis se houver infraestrutura viável, porém **não adicionar um framework grande somente para esta etapa**. Para cenários impossíveis de verificar automaticamente no ambiente CLI, registrar como **não verificados** e descrever como testar manualmente no navegador. Teste físico no Safari/iPhone continua previsto para o deploy.

## 9. Condições de conclusão

O usuário consegue salvar **um único** estacionamento, sair e voltar ao site e encontrar o carro no mapa. Se a consulta ao endereço falhar, as coordenadas continuam preservadas. Erros de GPS/armazenamento não apagam o estacionamento anterior. Nenhuma nova funcionalidade fora desse escopo foi introduzida.

## 10. Referências oficiais

- Geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- localStorage: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Web Storage availability: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
- Leaflet reference: https://leafletjs.com/reference.html
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/

## 11. Implementação e verificação local — 2026-11-20

- Fluxo implementado em `app.js`, com feedback acessível no HTML e marcador verde
  **P** distinto do ponto azul. Backend e `pom.xml` preservados.
- Registro único na chave especificada, com validação na restauração e captura
  nova a cada clique. A confirmação ocorre somente depois de `setItem` funcionar.
- Identificação por `crypto.randomUUID()`, com fallback de 128 bits aleatórios de
  `crypto.getRandomValues()` em hexadecimal. `savedAt` permanece metadado técnico.
- Endereço opcional via uma tentativa HTTP com timeout de 10 segundos, sem retry;
  somente `address` é enriquecido. `200` com endereço nulo não compõe um substituto.
- O `id` é conferido em memória e na chave relida antes de persistir endereço;
  respostas antigas não alteram um estacionamento recente. A interface não
  sincroniza abas, e `localStorage` não oferece transação entre abas concorrentes.
- A atribuição da geocodificação aparece junto ao endereço no popup.
- `node --test src/test/js/parking.test.cjs`: **14 testes aprovados**, com APIs do
  navegador e Leaflet simulados; nenhuma consulta ao Nominatim público.
- `./mvnw clean verify`: **149 testes aprovados**, sem falhas ou erros. A tentativa
  inicial no sandbox falhou na inicialização do agente Mockito; execução fora do
  sandbox passou, sem alterar a configuração do projeto.
- `git diff --check`: sem erros.

Os testes automatizados verificam lógica de restauração/reabertura com o mesmo
conteúdo persistido, falhas e respostas fora de ordem. **Validação visual no
navegador, permissões reais, fechamento/reabertura reais, leitor de tela e
Safari/iPhone físico não foram verificados**: o acesso ao navegador deste
ambiente estava indisponível. O roteiro manual está no README; esses itens de
aceite não devem ser interpretados como validados apenas pelos mocks.

## 12. Melhoria de aquisição de localização

A captura pontual no clique foi substituída pela aquisição temporária descrita
acima; a leitura inicial continua usando `getCurrentPosition()`. O frontend
mantém um único estacionamento, geocodificação opcional e proteção por `id`.
Não há alteração Java, nova dependência, rastreamento contínuo ou ajuste manual.

Testes JavaScript foram ampliados de 14 para **24**, incluindo seleção da melhor
amostra, timeout sem melhoria, ausência de amostra, permissão negada após leitura,
precisão inválida, limpeza do watch/timer, saída da página, callbacks após salvar
e círculo de precisão. A suíte Maven passou com **149 testes**, sem falhas ou
erros, e `git diff --check` não apontou erros. Renderização real e comportamento físico do GPS ainda
precisam de validação no navegador/dispositivo; os testes locais simulam essas APIs.

## 13. Refinamento de UX: coleta rápida e detalhes sob demanda

- Janela de aquisição de até **5 segundos** e encerramento antecipado em **10 m**
  ou menos, com `clearWatch()` inclusive no callback antecipado e watch ID zero.
- Botão `Marcando...`, confirmação `Estacionamento salvo`, detalhes de precisão
  nos popups. Ponto azul acessível por toque/teclado, sem tooltip permanente;
  anel verde e círculo de precisão preservados, sem deslocar coordenadas.
- `accuracy` opcional persiste nos novos registros v1; antigos continuam legíveis.
- Falhas reais de geocodificação seguem com aviso curto e causa controlada no
  popup; não há retry nem exposição de payload externo ou configuração na UI.
- Diagnóstico local: resposta **503 GEOCODING_UNAVAILABLE**, variável
  `GEOCODING_USER_AGENT` ausente no shell do agente e padrão vazio no backend.
  É uma causa possível, não confirmação da configuração do processo do iPhone.
  O README orienta configurar o processo Java com contato real e reiniciá-lo.
- Usuário relatou Safari/iPhone via HTTPS com aproximadamente **4 m** na versão
  anterior. Esta revisão de UX ainda precisa ser revalidada no dispositivo.

Verificação desta revisão: **30 testes JavaScript aprovados**, **149 testes Java
aprovados** em `./mvnw clean verify` fora do sandbox, e `git diff --check` sem
erros. Backend e `pom.xml` não foram alterados. Os testes usam mocks para
localização, relógio e interação com marcadores; a revisão de UX no iPhone e
com leitor de tela real permanece pendente.
