# Where I Parked

Site mobile-first para ajudar o usuário a reencontrar onde estacionou. A interface
possui mapa Leaflet/OpenStreetMap e geolocalização. A etapa 4 acrescenta uma API
Java de geocodificação reversa, ainda sem integração com o frontend. O botão
**Parked** permanece desabilitado.

## Requisitos e execução

- JDK 21, com `JAVA_HOME` configurado.
- Spring Boot 4.1.2 e Maven Wrapper incluído no repositório.
- Nenhuma dependência adicional foi necessária nesta etapa.

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
Ao integrar o endereço ao frontend na etapa seguinte, exibir a atribuição da
geocodificação de forma adequada; não considerar a atribuição dos tiles suficiente
para qualquer novo uso dos resultados.

Referência da API: <https://nominatim.org/release-docs/latest/api/Reverse/>.

## Verificação e escopo

Os testes cobrem MVC, contrato de erros, serviço, fallbacks, cache, concorrência,
limite, cliente HTTP e o fluxo completo com servidor externo simulado. Usam
`MockRestServiceServer` e domínios `.invalid`: nenhuma chamada ao Nominatim público
é necessária. O tempo é controlado nos testes, sem esperar o TTL real. O Mockito
usa o mock maker inline padrão, com anexação de agente à JVM. Ambientes restritos
podem bloquear essa anexação e exigir execução dos testes fora do sandbox.

Para uma consulta manual real, primeiro configurar um identificador válido e
executar a aplicação. Só então chamar o endpoint, por exemplo:

```sh
curl 'http://localhost:8080/api/location/reverse?lat=-23.5614&lon=-46.6559'
```

Respeitar o intervalo e evitar consultas repetidas. Esta etapa não implementa
chamadas do frontend à API, estacionamento salvo, localStorage, banco de dados,
login ou sincronização. Não inclui deploy.
