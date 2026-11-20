# Where I Parked

Site mobile-first para ajudar o usuário a reencontrar onde estacionou. A interface
possui mapa Leaflet/OpenStreetMap e geolocalização. O botão **Parked** salva um
único estacionamento neste navegador e consulta a API Java para acrescentar um
endereço aproximado, quando disponível.

## Requisitos e execução

- JDK 21, com `JAVA_HOME` configurado.
- Spring Boot 4.1.2 e Maven Wrapper incluído no repositório.
- Node.js 24 para a suíte JavaScript; não é necessário para iniciar o backend.

Compilar, testar e gerar o JAR:

```sh
./mvnw clean verify
```

Executar e acessar `http://localhost:8080`:

```sh
./mvnw spring-boot:run
```

No Windows, usar `.\mvnw.cmd` em lugar de `./mvnw`. Encerrar com `Ctrl+C`.
O primeiro build precisa de internet para baixar Maven e dependências. Com o
cache Maven completo, `./mvnw -o clean verify` executa offline.

## Configuração da geocodificação

| Variável de ambiente | Padrão | Uso |
|---|---|---|
| `GEOCODING_BASE_URL` | `https://nominatim.openstreetmap.org` | Provedor compatível com `/reverse` e JSON v2. |
| `GEOCODING_USER_AGENT` | vazio | Identificador específico da aplicação com contato real do mantenedor. |
| `GEOCODING_CONNECT_TIMEOUT` | `2s` | Timeout de conexão. |
| `GEOCODING_READ_TIMEOUT` | `5s` | Timeout de resposta HTTP. |
| `GEOCODING_CACHE_TTL` | `5m` | Validade do resultado temporário em memória. |

Antes de qualquer consulta real, definir `GEOCODING_USER_AGENT` no ambiente com o
nome e a versão da aplicação e uma URL de contato ou e-mail real mantido pelo
responsável. Não usar o identificador padrão de uma biblioteca, nem contatos
fictícios. O programa impede chamadas quando o valor está vazio; a validade do
contato e a conformidade do identificador são responsabilidade do mantenedor.
Não colocar credenciais no repositório.

Sem essa configuração o site inicia normalmente, e consultas válidas à API
retornam `503 GEOCODING_UNAVAILABLE` sem acessar o provedor. Timeouts e TTL devem
ser positivos; URL e configuração malformadas impedem a inicialização.

## API de geocodificação reversa

```http
GET /api/location/reverse?lat=-23.5614&lon=-46.6559
```

`lat` e `lon` são decimais obrigatórios. Latitude aceita de -90 a 90 e longitude
de -180 a 180, inclusive. Texto inválido, vazio, `NaN` e infinitos retornam 400
antes de consultar o serviço externo. Cada parâmetro aceita até 64 caracteres e
escala decimal entre -32 e 32, inclusive. Notação científica dentro desses limites
é aceita sem arredondamento; formatos extremos retornam 400 antes das operações
de comparação e formatação. A equivalência numérica do cache é preservada.

Exemplo ilustrativo de resposta:

```json
{
  "latitude": -23.5614,
  "longitude": -46.6559,
  "address": "Avenida Paulista, São Paulo, Brasil",
  "street": "Avenida Paulista",
  "city": "São Paulo",
  "state": "São Paulo",
  "country": "Brasil"
}
```

As coordenadas refletem a entrada, inclusive em resultados reutilizados do cache.
A posição do objeto retornado pelo provedor nunca substitui a posição consultada.
O resultado é aproximado. Todos os campos opcionais permanecem no JSON com `null`
quando ausentes ou vazios. `address` vem de `display_name`, sem compor ou inventar
um texto substituto. Fallbacks usam o primeiro valor não vazio:

- `street`: `road`, `pedestrian`, `residential`, `footway`, `path`.
- `city`: `city`, `town`, `village`, `municipality`.
- `state` e `country`: respectivos campos externos.

Se não houver `display_name` nem qualquer um dos componentes públicos úteis,
a resposta será 404. Um resultado parcial pode retornar 200 com campos nulos. Os campos textuais
utilizados do Nominatim aceitam somente strings ou `null`; números, booleanos,
objetos e arrays são respostas incompatíveis e resultam em 503. Essa regra fica
restrita aos DTOs do provedor, sem alterar o mapper JSON global.

Erros usam somente `code` e `message`, com mensagens controladas:

| HTTP | Código | Condição |
|---|---|---|
| 400 | `INVALID_COORDINATES` | Entrada ausente, malformada ou fora dos limites. |
| 404 | `ADDRESS_NOT_FOUND` | Nenhum endereço útil, HTTP 404 externo ou erro reconhecido `Unable to geocode`. |
| 429 | `GEOCODING_RATE_LIMITED` | Limite local ou consulta externa já em andamento. |
| 503 | `GEOCODING_UNAVAILABLE` | Identificação ausente, rede, JSON inválido, corpo vazio ou outros erros externos, inclusive 429 e 5xx. |
| 504 | `GEOCODING_TIMEOUT` | Timeout de conexão ou resposta. |

Não há retries automáticos implementados, redirecionamentos HTTP ou repasse de
payloads do provedor ao consumidor. O `RestClient` usa transporte HTTP do JDK.

## Limites, privacidade e atribuição

**A política pública do Nominatim é obrigatória:**
<https://operations.osmfoundation.org/policies/nominatim/>.
A escolha do serviço público é deliberada para o MVP e a responsabilidade pelo
uso é do mantenedor. O máximo de uma requisição por segundo vale para o site
inteiro; exige identificação e atribuição. Polling, autocomplete, busca em grade,
consultas em lote e consultas automáticas a cada movimento do mapa não fazem
parte deste projeto. A política também menciona restrições a rastreamento de
veículos e envio de dados pessoais/confidenciais; avaliar a adequação deste fluxo
manual antes de uso público. O serviço não oferece garantia de disponibilidade.

O backend permite somente uma consulta externa em andamento e mantém intervalo
mínimo de um segundo entre tentativas, incluindo falhas. Chamadas que excedem o
limite recebem 429 imediatamente, sem fila ou repetição automática. O cache é
consultado antes desse limite e mantém no máximo um resultado bem-sucedido em
memória. Coordenadas numericamente iguais reutilizam a entrada, sem arredondamento;
pontos distintos não compartilham resultados. Erros não são armazenados.

O TTL invalida a entrada logicamente. O objeto permanece na memória até ser
substituído ou a aplicação encerrar; não há gravação em disco nem limpeza física
agendada. O cache não sobrevive a reinícios. Esse controle é adequado somente a
**uma instância**. Antes de múltiplas réplicas ou deploy público será necessário
coordenar o limite global ou adotar um provedor com capacidade adequada.
Alterar a URL permite usar um serviço compatível; outro contrato requer substituir
o cliente Java, sem acoplar o Controller ao fornecedor.

Uma consulta real transmite coordenadas ao backend e ao terceiro. O código não
registra coordenadas, URLs de consulta ou payloads em logs/métricas. O logging dos
pacotes HTTP/web do Spring está desabilitado para evitar exposição por diagnóstico.
Não ativar wire logging, captura de query strings ou access logs com URLs completas
na aplicação/proxy para esse endpoint.

Dados de geocodificação: **© OpenStreetMap contributors**, disponíveis sob a
[ODbL](https://www.openstreetmap.org/copyright), consultados via Nominatim.
Essa atribuição é independente da atribuição dos tiles já exibida no mapa.
O popup do carro exibe a atribuição da geocodificação junto ao endereço
aproximado, além da atribuição dos tiles já presente no mapa.

Referência da API: <https://nominatim.org/release-docs/latest/api/Reverse/>.

## Verificação e escopo

Os testes cobrem MVC, contrato de erros, serviço, fallbacks, cache, concorrência,
limite, cliente HTTP e o fluxo completo com servidor externo simulado. Usam
`MockRestServiceServer` e domínios `.invalid`: nenhuma chamada ao Nominatim público
é necessária. O tempo de cache/limite é controlado nos testes, sem esperar o TTL
real; os testes do transporte exercitam timeouts curtos em HTTP local. As configurações
em `src/test/resources/geocoding-test.properties` substituem `GEOCODING_*` do ambiente;
os testes de transporte usam servidor em `127.0.0.1` com porta efêmera.

O Mockito mantém o mock maker inline e é carregado ao iniciar a JVM de testes com
`-javaagent`, sem depender de autoanexação. O goal `properties` do
`maven-dependency-plugin` resolve o JAR `mockito-core` já presente na árvore de testes;
o Surefire usa essa propriedade, sem caminho absoluto ou versão duplicada. A
configuração segue a [documentação oficial do Mockito para Java 21+](https://github.com/mockito/mockito/blob/main/mockito-core/src/main/java/org/mockito/Mockito.java).
O primeiro build pode precisar baixar dependências dos plugins. Um sandbox ainda
pode restringir o cache Maven ou sockets locais, independentemente do agente.

Para uma consulta manual real, primeiro configurar um identificador válido e
executar a aplicação. Só então chamar o endpoint, por exemplo:

```sh
curl 'http://localhost:8080/api/location/reverse?lat=-23.5614&lon=-46.6559'
```

Respeitar o intervalo e evitar consultas repetidas. O frontend consulta somente
este endpoint, após salvar um estacionamento; não consulta diretamente o Nominatim.

## Salvar e reencontrar o carro

1. Acesse o site por HTTPS ou `http://localhost:8080` e permita a localização.
2. Após uma leitura válida, **Parked** fica habilitado. Ao clicar, um
   `watchPosition()` temporário coleta amostras por até 5 segundos, com alta precisão
   e `maximumAge: 0`. Uma amostra válida de até 10 m encerra a coleta imediatamente;
   sem isso, salva a melhor amostra disponível ao final. Não calcula médias nem
   desloca coordenadas. A leitura inicial não participa dessa seleção.
3. Se a gravação local funcionar, aparece um anel verde com **P** lateral e a
   confirmação curta `Estacionamento salvo`. Durante a captura, o botão mostra
   `Marcando...`. O centro do anel é a coordenada real; ele é vazado para deixar o ponto azul
   visível mesmo quando as posições coincidem. Um círculo azul translúcido usa
   `coords.accuracy` como raio em metros, representando uma estimativa, sem
   garantir que a posição real esteja dentro dele. Não há balão permanente: toque
   no ponto azul para consultar a localização atual e a precisão, ou no **P** para
   consultar endereço e precisão do estacionamento. Ambos permitem acesso por
   teclado; estados e erros continuam anunciados via `aria-live`.
4. O endereço aproximado é opcional e aparece no popup do carro se a API responder.
5. Recarregue ou reabra na mesma origem e navegador: o carro é restaurado sem
   consulta de endereço e mesmo se o GPS atual for negado. A localização atual
   não desloca automaticamente o mapa para longe do carro salvo.
6. Ao estacionar novamente, o novo registro substitui o anterior, sem histórico.

A chave `whereiparked:parking:v1` contém um único objeto JSON com `version: 1`,
`id`, `latitude`, `longitude`, `address` (texto ou `null`) e `savedAt` (ISO 8601).
Novos registros também guardam `accuracy` em metros, opcional na versão 1, para
exibir a precisão no popup após reabrir. Registros antigos sem esse campo continuam
válidos e não recebem uma precisão inventada.
As coordenadas são a fonte da verdade. O identificador usa `crypto.randomUUID()`;
em navegadores sem esse método, usa 128 bits de `crypto.getRandomValues()` em
hexadecimal. Não há identificador de conta ou rastreamento contínuo.

A observação termina com `clearWatch()` antes de gravar ou informar falha. Não
há rastreamento após salvar, e callbacks tardios são ignorados. Sem melhoria, a
melhor amostra recente é usada, mesmo se ainda indicar 50 m ou mais. Não há meta
obrigatória de precisão: a seleção não melhora artificialmente o sinal recebido.
Erros transitórios permitem novas amostras até o prazo; permissão negada encerra
imediatamente sem salvar enquanto a aquisição estiver ativa. Após salvar,
callbacks posteriores são ignorados. Sair da página cancela a aquisição, sem
gravação parcial.

GPS negado, prazo encerrado sem amostra válida ou falha ao gravar não substituem o
estacionamento anterior. Coordenadas e precisão não finita/negativa são ignoradas
na seleção. A precisão detalhada aparece apenas nos popups. Ao restaurar, o
círculo vem de uma nova leitura atual, nunca da posição histórica do carro. JSON
inválido ou versão desconhecida é ignorado com mensagem, sem apagar automaticamente
o conteúdo. Erros de acesso ao armazenamento
são tratados, inclusive `SecurityError` e quota excedida. Se o endereço não puder
ser persistido, as coordenadas já salvas continuam válidas.

A consulta de endereço ocorre uma vez por estacionamento salvo, sem retry,
polling ou consulta ao recarregar. O timeout do frontend é de 10 segundos. Falhas
HTTP (inclusive 429, 503 e 504), rede ou JSON inválido mantêm `address: null`.
Um `200` com endereço nulo também é aceito sem inventar endereço a partir dos
componentes. Respostas atrasadas só podem atualizar o registro com o mesmo `id`;
a chave é relida antes da gravação. Não há sincronização da interface entre abas
nem transação entre elas; `localStorage` não oferece comparação e troca atômicas.

A persistência depende da **origem e navegador**: porta, protocolo ou domínio
diferentes não compartilham o registro. Navegação privada, limpeza de dados ou
políticas do navegador podem removê-lo. A consulta de endereço transmite a posição
ao backend e ao provedor. Não há garantia de endereço exato nem de funcionamento
integral offline: Leaflet e tiles ainda dependem da rede. Não há banco de dados,
login, histórico, sincronização entre dispositivos ou deploy nesta etapa.

## Testes automatizados e CI

Com Java 21 e Node.js 24 (versão usada no CI), executar na raiz do repositório:

```sh
./mvnw clean verify
node --test src/test/js/*.test.cjs
git diff --check
```

Não é necessário executar `npm install`: não há dependências npm.
Para executar somente a suíte JavaScript atual:

```sh
node --test src/test/js/parking.test.cjs
```

Usam o código real de `app.js` com DOM, Leaflet, GPS, armazenamento e HTTP simulados.
Cobrem captura recente, bloqueio de cliques, restauração, substituição, validação,
falhas de GPS/armazenamento/API, timeout, respostas fora de ordem, endereço como
texto e falha na persistência do endereço. Também cobrem múltiplas amostras,
menor precisão estimada, prazo sem melhoria/sem leitura, `clearWatch()`, permissão
revogada, saída da página, callbacks após salvar e atualização do círculo em metros.
Não acessam o Nominatim público. A suíte também verifica `aria-busy`, falha e
recuperação dos tiles e redimensionamento do mapa sem mover a visualização.
Não substituem testes de renderização ou permissões reais do navegador.

O workflow [CI](.github/workflows/ci.yml) executa em Pull Requests, pushes para
`main` e por disparo manual (`workflow_dispatch`, disponível quando o workflow
estiver na branch padrão). Os jobs são independentes em `ubuntu-latest`:

- **Java Tests:** Temurin 21, Maven Wrapper e cache Maven; executa
  `./mvnw -B --no-transfer-progress clean verify`, com limite de 15 minutos.
- **JavaScript Tests:** Node.js 24, sem instalação ou cache npm; executa
  `node --test src/test/js/*.test.cjs`, com limite de 5 minutos.

As ações oficiais são `actions/checkout@v7`, `actions/setup-java@v6` e
`actions/setup-node@v7`. O token recebe somente `contents: read`, e o checkout não
persiste credenciais. Não são necessários secrets, GPS, navegador, tiles ou
Nominatim público para as suítes. Downloads de ferramentas e dependências precisam
de acesso à internet quando não estiverem em cache.

A validação local do YAML não comprova uma execução no GitHub. Após publicar as
alterações por ação autorizada do mantenedor, conferir os dois jobs verdes no PR.
Safari/iPhone via HTTPS, renderização e leitor de tela permanecem verificações
manuais, conforme o roteiro abaixo; não fazem parte do CI.

Validação local da etapa 6: **168 testes Java** e **33 testes JavaScript**
aprovados, preservando os 149/30 casos anteriores. Java foi executado com Temurin
21.0.13, inclusive com carregamento dinâmico de agentes desativado e `GEOCODING_*`
inválidas no ambiente. A suíte completa precisou de execução fora do sandbox por
restrições ao cache Maven e aos sockets locais. JavaScript passou em Node.js
20.12.1; Node.js 24 não estava instalado. YAML parseado e revisado localmente;
execução real dos dois jobs no GitHub Actions permanece pendente.

Diagnóstico de endereço indisponível:

- O backend usa `GEOCODING_USER_AGENT` vazio por padrão. Sem identificador com
  contato real no ambiente do **processo Java**, retorna `503 GEOCODING_UNAVAILABLE`
  antes de acessar o Nominatim. O túnel HTTPS fornece acesso seguro ao GPS, mas
  não configura o identificador do backend. Defina-o no terminal/IDE que inicia
  Java e reinicie a aplicação; não coloque credenciais ou contato fictício no código.
- A consulta local desta revisão, com coordenadas fictícias `0, 0`, retornou
  `503 GEOCODING_UNAVAILABLE`. A variável estava ausente no shell do agente. Isso
  é compatível com a configuração faltante, mas não confirma o ambiente do processo
  que atendeu ao iPhone: 503 também pode indicar falha de rede/provedor ou resposta
  externa incompatível. Confira a configuração efetiva e a resposta no painel
  Network, sem divulgar coordenadas reais em logs ou capturas.
- O frontend informa falhas com aviso curto e detalha o motivo controlado no popup:
  400 (entrada recusada), 404 (sem endereço), 429 (limite), 503 (indisponibilidade),
  504 (tempo excedido), rede/timeout ou resposta inválida. Não exibe texto bruto
  do provedor, não confunde esses erros com GPS e não faz novas tentativas automáticas.
- Um 200 com `address: null` continua sem endereço, mesmo se houver componentes
  parciais. Falhas de leitura/gravação do endereço não removem o estacionamento.

Verificação Java e formatação do diff:

```sh
./mvnw clean verify
git diff --check
```

Roteiro manual no navegador:

- Comece sem a chave salva: confira mapa e botão habilitado após permitir GPS.
- Clique em **Parked**, aguarde até 5 segundos (ou o encerramento antecipado) e
  confira o objeto único em Application/Storage e o anel verde. Confira a margem estimada nos popups e o
  círculo azul no mapa; quando as posições coincidem, o ponto azul deve continuar
  visível no centro do anel. Clique no marcador para conferir endereço e atribuição,
  se disponíveis.
- Recarregue, feche e reabra na mesma origem; negue GPS e confira que o carro
  continua visível. No painel Network, não deve haver geocodificação na abertura.
- Salve outro ponto: confirme um único marcador de carro e substituição do objeto.
- Sem `GEOCODING_USER_AGENT`, confirme a resposta 503 e a preservação do carro salvo.
- Com DevTools/mocks locais, simule GPS negado/timeout, storage bloqueado, API
  429/504/offline e respostas fora de ordem. Confira preservação e feedback.
- Verifique teclado, anúncio dos estados com leitor de tela, largura de 320 px,
  orientação e ausência de sobreposição ou rolagem horizontal.
- Com GPS simulado, envie amostras de 52 m, 12 m e 48 m; confira que a amostra de
  12 m é salva ao final dos 5 segundos. Com 4 m ou 10 m, deve salvar imediatamente.
  Envie outra após salvar: nada deve mudar.
- Sem melhoria (por exemplo, 52 m e 55 m), confira uso dos 52 m e aviso da margem.
  Sem nenhuma amostra válida ou negando permissão, confira o estacionamento anterior.

O usuário relatou teste físico anterior no Safari/iPhone via túnel HTTPS com
precisão de aproximadamente 4 m. Este refinamento de interface e tempo de captura
ainda requer nova validação no dispositivo; testes visuais e leitor de tela real
permanecem **não verificados pelo agente** neste ambiente. Não realizar deploy
para executar estes testes.
