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
As etapas 1 a 6.5 estão concluídas. O escopo atual é **7 — Docker e deploy na Vercel**, descrito em `docs/step/007-vercel-deployment.md`. Preparar Docker multi-stage Java 21, runtime não-root, `vercel.json` Container, porta `${PORT:8080}`, CI Docker e documentação. Frontend e API continuam juntos no Spring Boot, com destino Vercel Hobby. Preserve contratos REST, formato/chave do armazenamento, aquisição/precisão do GPS, layout e remoção com confirmação sem GPS. Não habilitar geocodificação pública automaticamente. Não criar recursos nem fazer deploy sem pedido explícito.

A remoção deve excluir a chave antes de limpar estado/marcador; falhas preservam o estacionamento. Preserve `storedOperation()` e `operation` contra respostas atrasadas e o enriquecimento durante uma nova captura. O erro de remoção não pode ser encoberto por HTTP pendente. Se Leaflet não carregar, manter as ações indisponíveis e o erro existente.

## Verificação
- Java 21: `./mvnw clean verify`.
- JavaScript (CI: Node.js 24): `node --test src/test/js/*.test.cjs`.
- Diff: `git diff --check`.
- Docker disponível: build da imagem e smoke HTTP em loopback para `/`, `/js/app.js` e entrada inválida na API (400); manter `GEOCODING_USER_AGENT` vazio. Conferir runtime não-root.
- Não consultar Nominatim público nem depender de GPS físico nos testes; usar mocks e HTTP em loopback.
- As configurações Java de teste em `src/test/resources/geocoding-test.properties` isolam `GEOCODING_*` do ambiente. Preservar os overrides locais de transporte.
- CI: `.github/workflows/ci.yml`, com jobs independentes em PRs e pushes para `main`. Execução real no Actions e validação manual em Safari/iPhone devem ser relatadas separadamente das verificações locais.
