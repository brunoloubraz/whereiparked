# Where I Parked — Etapa 4: API REST Java + Nominatim

> Branch: `feat/004-reverse-geocoding-api`  
> Status: planejada  
> Escopo: implementar e testar o backend de geocodificação reversa, sem alterar a funcionalidade do frontend.

## 1. Objetivo

Implementar uma API REST em Java 21 + Spring Boot 4.1.2 que receba coordenadas geográficas (`lat`, `lon`), consulte um provedor de geocodificação reversa (Nominatim, escolhido deliberadamente para o MVP) e retorne um JSON simplificado com o endereço aproximado.

O endpoint não deve criar, consultar nem persistir registros de estacionamento; essa integração pertence à etapa 5.

## 2. Contexto e restrições

- A etapa 3 já implementou um mapa Leaflet/OpenStreetMap e mostra a localização do usuário no navegador.
- O botão **Parked** permanece desabilitado nesta etapa.
- O mapa e o código de geolocalização existentes não devem ser alterados, exceto se houver um problema de compilação comprovado e autorizado.
- Não criar banco de dados, autenticação, Spring Data JPA, histórico, novos fluxos de usuário, nem chamadas do frontend para o novo endpoint neste PR.
- Manter o Spring Boot servindo os arquivos estáticos da aplicação na mesma origem.
- Reutilizar os starters já existentes no `pom.xml` (`webmvc`, `restclient`, `validation` e testes). Acrescentar dependências somente se essenciais e explicar o motivo.
- Não criar commits ou pull requests automaticamente.

## 3. Contrato público

### Endpoint

`GET /api/location/reverse?lat=-23.5614&lon=-46.6559`

- `lat`: decimal obrigatório, entre -90 e 90 (inclusive).
- `lon`: decimal obrigatório, entre -180 e 180 (inclusive).
- Valores ausentes, inválidos, `NaN`, infinitos, fora de intervalo ou não numéricos devem gerar **400**.
- Validar parâmetros antes de qualquer consulta ao serviço externo.
- Proteção de formato: no máximo 64 caracteres por parâmetro e escala BigDecimal entre -32 e 32, inclusive; formatos extremos retornam 400, sem arredondamento.

### Resposta `200 OK` (exemplo ilustrativo)

```json
{
  "latitude": -23.5614,
  "longitude": -46.6559,
  "address": "Avenida Paulista, São Paulo, SP, Brasil",
  "street": "Avenida Paulista",
  "city": "São Paulo",
  "state": "São Paulo",
  "country": "Brasil"
}
```

Notas:
- Os campos `latitude` e `longitude` devem refletir o **input do cliente**, não as coordenadas do objeto do Nominatim.
- Rua, cidade, estado, país e texto formatado podem estar ausentes na resposta externa. Nunca inventar um endereço.
- Definir e testar uma política consistente para campos opcionais (`null` ou omissão) e documentá-la. Preferência inicial: valores `null` para ausências, salvo boa justificativa.
- O Nominatim usa tags variáveis de OpenStreetMap (`road`, `pedestrian`, `city`, `town`, `village`, `municipality` etc.). Implementar fallback simples, documentado e testável para obter campos exibíveis, sem tentar cobrir todas as possibilidades do planeta.

### Erros da nossa API

| Condição | HTTP | Exemplo de código de erro |
|---|---:|---|
| Input ausente/malformado/fora do intervalo | 400 | `INVALID_COORDINATES` |
| Provedor sem endereço útil para o ponto | 404 | `ADDRESS_NOT_FOUND` |
| Limite local da aplicação atingido | 429 | `GEOCODING_RATE_LIMITED` |
| Provedor externo indisponível, erro de rede ou resposta inválida | 503 | `GEOCODING_UNAVAILABLE` |
| Timeout de chamada externa | 504 | `GEOCODING_TIMEOUT` |

Formato sugerido (pode usar `ProblemDetail` do Spring, se consistente):

```json
{
  "code": "INVALID_COORDINATES",
  "message": "Latitude must be between -90 and 90"
}
```

- Não retornar payload bruto do Nominatim ou stack traces.
- Não incluir coordenadas exatas nem URL completa da requisição nos logs de erro.
- Mapear claramente erros do provedor para nosso contrato, sem confundir `429` do provedor com o limite local.

## 4. Integração com Nominatim

Documentação: https://nominatim.org/release-docs/latest/api/Reverse/  
Política obrigatória: https://operations.osmfoundation.org/policies/nominatim/

Chamada externa (exemplo, não executar automaticamente em testes):

```http
GET https://nominatim.openstreetmap.org/reverse?lat=-23.5614&lon=-46.6559&format=jsonv2&addressdetails=1&accept-language=pt-BR
```

Diretrizes:
1. Configurar URL-base do provedor fora do código de negócio (`application.properties` ou `application.yml`).
2. Enviar `User-Agent` ou `Referer` **válido e específico da aplicação**, com canal de contato apropriado definido pelo mantenedor — nunca usar um identificador genérico de biblioteca. Não inventar e-mail/endereço de contato. Para execução real, documentar como fornecer o valor.
3. Consumir via `RestClient` (`spring-boot-starter-restclient` já está no projeto).
4. Configurar timeout de conexão e de leitura.
5. Não implementar retries automáticos para respostas 429/5xx: retries podem intensificar o problema e violar a política. Para o MVP, retornar erro controlado.
6. Limitar consultas externas a no máximo **1 requisição por segundo para toda a aplicação**, com cache temporário de requisições iguais quando viável. Não confiar exclusivamente num rate limiter por instância em produção com múltiplas réplicas.
7. Não fazer polling, busca sistemática, autocomplete, consultas em lote ou consultas automáticas a cada movimento do mapa.
8. Deixar possível substituir o provedor por configuração/implementação do cliente, sem acoplar o Controller ao URL ou ao formato do Nominatim.
9. Não repassar a licença/atribuição como se fosse dispensável: manter atribuição à fonte de dados de geocodificação conforme a política aplicável e documentar no README; a interface atualmente já atribui os tiles do OpenStreetMap, que são serviço distinto.
10. O resultado é aproximado; não alterar as coordenadas do estacionamento com base no objeto retornado pelo provedor.

**Privacidade:** uma consulta real encaminha coordenadas à aplicação Java e ao serviço terceiro. Não registrar essas coordenadas em logs, métricas ou mensagens de erro. Não colocar tokens ou credenciais no repositório.

**Deploy posterior:** o limite de 1 req/s é global para o site, não por usuário nem por réplica. Antes de um deploy público, verificar limitações reais do controle de taxa e considerar um serviço de geocodificação com limites adequados se necessário.

## 5. Design das classes

Estrutura sugerida (adapte a nomes de pacotes já existentes, sem duplicá-los):

```text
src/main/java/dev/whereiparked/
├── controller/
│   └── LocationController.java
├── service/
│   └── GeocodingService.java
├── client/
│   └── NominatimClient.java
├── dto/
│   ├── LocationResponse.java
│   └── NominatimResponse.java
├── exception/
│   └── GlobalExceptionHandler.java
└── WhereiparkedApplication.java  # conservar nome real existente
```

- **Controller:** valida entrada, chama serviço, devolve HTTP/JSON.
- **Service:** coordena busca, normalização de endereço, condições de ausência e tratamento de domínio.
- **Client:** contém HTTP, headers, URI, timeouts e parsing do Nominatim; é testável isoladamente.
- **DTOs:** usar Java `record` se apropriado, com atributos claros e campos opcionais; não vazar o payload completo do fornecedor.
- **ExceptionHandler:** traduz exceções esperadas em JSON padronizado e códigos HTTP.

Evite interfaces, factories, camadas ou padrões sofisticados se não contribuírem para a manutenção desta única operação. Uma separação simples Controller → Service → Client é suficiente.

## 6. Implementação por incrementos

1. **Contrato e validação.** Criar Controller + DTO próprio, validação de parâmetros e um Service inicialmente testável sem API externa; confirmar 400 para parâmetros inválidos.
2. **Cliente HTTP.** Configurar `RestClient`, URL, headers, timeouts e desserialização de JSON externo. Incluir tratamento de erros/ausência.
3. **Serviço de aplicação.** Integrar as classes, mapear o endereço com fallback e preservar coordenadas originais. Implementar política mínima de limite/caching para o MVP com ressalva explícita de operação em instância única.
4. **Testes.** Testes unitários e de Controller com provedores simulados. Não testar usando chamadas reais ao Nominatim em cada execução.
5. **Verificação local.** Rodar `./mvnw clean verify` e `./mvnw spring-boot:run`; executar uma ou duas consultas manuais reais, espaçadas e apenas depois de configurar uma identificação válida.
6. **Revisão.** Verificar `git diff --check`, arquivos alterados, contrato de erro, inexistência de alterações não solicitadas no frontend, riscos de vazamento de localização e documentação da configuração.

## 7. Testes mínimos

- Sucesso `200` com coordenadas válidas e retorno externo simulado.
- Latitude < -90 / > 90: `400`, sem invocar Client.
- Longitude < -180 / > 180: `400`, sem invocar Client.
- Parâmetros faltando, strings, `NaN`, `Infinity`: `400`.
- Campos opcionais de endereço ausentes ou tags variantes; fallback previsível.
- Nominatim sem resultado relevante: `404`.
- Timeout HTTP externo: `504`.
- Erro 5xx e falha de transporte: `503`.
- Limite local atingido: `429`, sem disparar chamada externa.
- Verificar presença do identificador da aplicação e uso correto dos parâmetros na chamada HTTP.
- Testes repetíveis offline, sem depender de rede, GPS, Leaflet, navegador ou servidor público.

Em Spring Boot 4, conferir imports atuais de `@WebMvcTest`, `@MockitoBean` e recursos de teste existentes no projeto, em vez de copiar importações de versões antigas.

## 8. Critérios de aceite / Definition of Done

- [ ] `GET /api/location/reverse` está acessível em `localhost:8080`.
- [ ] Entrada validada com 400 antes de chamar serviços externos.
- [ ] Integração Nominatim implementada com RestClient e config externa.
- [ ] Retorno JSON simplificado e coordenadas originais preservadas.
- [ ] Erros retornam códigos e mensagens controlados.
- [ ] Timeout, identificação, atribuição, limites e cache respeitados/documentados.
- [ ] Nenhum dado de localização é persistido no backend nem colocado nos logs.
- [ ] Testes automatizados executam sem acessar a API pública.
- [ ] `./mvnw clean verify` termina com `BUILD SUCCESS`.
- [ ] A interface da etapa 3 permanece intacta e o botão Parked continua desabilitado.
- [ ] Não foram adicionados banco, login, API de parking, frontend-to-backend fetch, Docker ou deploy neste PR.
- [ ] Documentação de execução e configurações obrigatórias atualizada.

## 9. Fora do escopo

- Acionar a API ao clicar Parked ou integrar ao JavaScript (etapa 5).
- Salvar estacionamento no `localStorage` (etapa 5).
- Histórico, notificações, rotas, login, banco remoto ou monitoramento de GPS.
- Containerização, CI/CD novo e deploy (etapas posteriores).
- Teste real no Safari do iPhone (reservado à validação com HTTPS no deploy).

## 10. Sequência de prompts ao Codex

**Primeiro, apenas planejar:**

> Leia `AGENTS.md` e `docs/step/004-reverse-geocoding-api.md`. Analise o código existente, especialmente `pom.xml` e os pacotes Java. Apresente um plano pequeno e sequencial com os arquivos a modificar, riscos e estratégia de testes. Não altere nenhum arquivo ainda, não crie commits e não abra PRs.

**Depois de revisar o plano:**

> Implemente somente o primeiro incremento da seção 6 (contrato HTTP, DTOs e validações), com testes. Respeite o documento da etapa 4 e preserve o frontend.

> Agora implemente o cliente Nominatim e o serviço de aplicação, com configuração externa, limites, timeouts, tratamento de erros e testes offline conforme a especificação. Preserve o frontend e não faça chamadas reais durante testes.

> Execute as verificações da seção 8, rode `./mvnw clean verify` e apresente um relatório com arquivos alterados, testes, possíveis riscos e itens pendentes. Não faça commit/PR automaticamente.

## Fontes técnicas consultáveis

- Spring Boot REST clients: https://docs.spring.io/spring-boot/reference/io/rest-client.html
- Spring Boot testing: https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
- Nominatim reverse: https://nominatim.org/release-docs/latest/api/Reverse/
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
