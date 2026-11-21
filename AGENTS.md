# Where I Parked — instruções para agentes de código

## Produto e objetivo
Where I Parked é um site mobile-first para registrar onde um carro foi estacionado e recuperar a posição ao reabrir o site no mesmo navegador/dispositivo.
O MVP mantém **um único estacionamento salvo**, sem conta, autenticação, banco de dados ou sincronização entre dispositivos.

## Stack decidida
- Backend: Java 21, Spring Boot 4.1.2, Maven.
- Frontend: HTML5, CSS3 e JavaScript sem framework; arquivos estáticos servidos pelo Spring Boot em `src/main/resources/static/`.
- Mapa Leaflet/OpenStreetMap, geolocalização, botão Parked e persistência em localStorage já implementados.
- Testes Java: JUnit, Mockito e MockMvc; Mockito como agente explícito no Maven Surefire.
- Testes JavaScript: runner nativo `node:test`, sem dependências npm. CI usa Node.js 24.

## Fluxo de trabalho
- Leia a especificação da etapa solicitada em `docs/step/` antes de alterar código.
- Inspecione os arquivos existentes; preserve o que já funciona.
- Execute somente o escopo explicitamente solicitado. Não implemente etapas futuras antecipadamente.
- Prefira mudanças pequenas, simples, sem dependências ou abstrações desnecessárias.
- Utilize HTML semântico e CSS mobile-first, pensando em Safari no iPhone e acessibilidade.
- Execute os testes/compilação disponíveis quando possível e relate o resultado honestamente.
- Ao concluir, resuma arquivos alterados, decisões, como testar e limitações.
- Não crie commits, branches, pushes, PRs, deploys ou alterações em infraestrutura sem pedido explícito do usuário.
- Se a especificação divergir do repositório real, aponte a divergência antes de mudanças destrutivas.

## Escopo atual
As etapas 1 a 5 estão concluídas. O escopo atual é **6 — Testes, qualidade e CI**, descrito em `docs/step/006-application-tests.md`. Preserve funcionalidades, contratos REST, armazenamento e layout. Não implementar Docker ou deploy.

## Verificação
- Java 21: `./mvnw clean verify`.
- JavaScript (CI: Node.js 24): `node --test src/test/js/*.test.cjs`.
- Diff: `git diff --check`.
- Não consultar Nominatim público nem depender de GPS físico nos testes; usar mocks e HTTP em loopback.
- As configurações Java de teste em `src/test/resources/geocoding-test.properties` isolam `GEOCODING_*` do ambiente. Preservar os overrides locais de transporte.
- CI: `.github/workflows/ci.yml`, com jobs independentes em PRs e pushes para `main`. Execução real no Actions e validação manual em Safari/iPhone devem ser relatadas separadamente das verificações locais.
