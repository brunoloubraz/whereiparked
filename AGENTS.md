# Where I Parked — instruções para agentes de código

## Produto e objetivo
Where I Parked é um site mobile-first para registrar onde um carro foi estacionado e recuperar a posição ao reabrir o site no mesmo navegador/dispositivo.
O MVP mantém **um único estacionamento salvo**, sem conta, autenticação, banco de dados ou sincronização entre dispositivos.
O **MVP v1 está finalizado e publicado na Vercel**: https://whereiparked-eta.vercel.app/.

## Stack decidida
- Backend: Java 21, Spring Boot 4.1.2, Maven.
- Frontend: HTML5, CSS3 e JavaScript sem framework; arquivos estáticos servidos pelo Spring Boot em `src/main/resources/static/`.
- Mapa Leaflet/OpenStreetMap, geolocalização, botão Parked e persistência em localStorage já implementados.
- Testes Java: JUnit, Mockito e MockMvc; Mockito como agente explícito no Maven Surefire.
- Testes JavaScript: runner nativo `node:test`, sem dependências npm. CI usa Node.js 24.
- Frontend e backend hospedados juntos em um container Docker, com build multi-stage Java 21 e runtime não-root na Vercel Container.
- Geocodificação reversa implementada na API, mas desabilitada no deploy público; o fluxo principal de estacionamento funciona sem consulta de endereço.
- Testes Java, JavaScript e build/smoke HTTP Docker integrados ao GitHub Actions em jobs independentes.

## Fluxo de trabalho
- As etapas 1 a 7 estão concluídas, incluindo a etapa 6.5. As especificações em `docs/step/` são documentação histórica; preserve-as e consulte a etapa relevante para entender decisões anteriores.
- Use o README, o código e os testes como referência do comportamento atual. Não interprete tarefas previstas nos documentos históricos como trabalho pendente.
- Inspecione os arquivos existentes; preserve o que já funciona.
- Execute somente o escopo explicitamente solicitado. Não implemente etapas futuras antecipadamente.
- Prefira mudanças pequenas, simples, sem dependências ou abstrações desnecessárias.
- Utilize HTML semântico e CSS mobile-first, pensando em Safari no iPhone e acessibilidade.
- Execute os testes/compilação disponíveis quando possível e relate o resultado honestamente.
- Ao concluir, resuma arquivos alterados, decisões, como testar e limitações.
- Não crie commits, branches, pushes, PRs, tags, GitHub Releases, deploys ou alterações em infraestrutura/metadados remotos sem pedido explícito do usuário.
- Se a especificação divergir do repositório real, aponte a divergência antes de mudanças destrutivas.

## Estado atual e manutenção
O MVP v1 está concluído e publicado; a etapa 7 não é trabalho pendente. Frontend e API são servidos juntos pelo Spring Boot em Docker na Vercel Hobby. O projeto já contém Docker multi-stage Java 21, runtime não-root, `vercel.json` Container, porta `${PORT:8080}`, CI Docker e documentação.

Futuras contribuições devem se limitar ao pedido explícito. Preserve os contratos REST, o formato e a chave `whereiparked:parking:v1` do armazenamento, a aquisição/precisão do GPS, o layout e a remoção com confirmação sem GPS. Não habilite geocodificação pública automaticamente: sem `GEOCODING_USER_AGENT`, consultas válidas retornam `503 GEOCODING_UNAVAILABLE`. O cache e o controle de chamadas são por instância. Não crie recursos nem faça deploy sem pedido explícito.

A remoção deve excluir a chave antes de limpar estado/marcador; falhas preservam o estacionamento. Preserve `storedOperation()` e `operation` contra respostas atrasadas e o enriquecimento durante uma nova captura. O erro de remoção não pode ser encoberto por HTTP pendente. Se Leaflet não carregar, manter as ações indisponíveis e o erro existente.

## Verificação
- Java 21: `./mvnw clean verify`.
- JavaScript (CI: Node.js 24): `node --test src/test/js/*.test.cjs`.
- Diff: `git diff --check`.
- Docker disponível: build da imagem e smoke HTTP em loopback para `/`, `/js/app.js` e entrada inválida na API (400); manter `GEOCODING_USER_AGENT` vazio. Conferir runtime não-root.
- Não consultar Nominatim público nem depender de GPS físico nos testes; usar mocks e HTTP em loopback.
- As configurações Java de teste em `src/test/resources/geocoding-test.properties` isolam `GEOCODING_*` do ambiente. Preservar os overrides locais de transporte.
- CI: `.github/workflows/ci.yml`, com jobs independentes em PRs e pushes para `main`. Execução real no Actions e validação manual em Safari/iPhone devem ser relatadas separadamente das verificações locais.
