# Where I Parked — instruções para agentes de código

## Produto e objetivo
Where I Parked é um site mobile-first para registrar onde um carro foi estacionado e recuperar a posição ao reabrir o site no mesmo navegador/dispositivo.
O MVP terá **um único estacionamento salvo**, sem conta, autenticação, banco de dados ou sincronização entre dispositivos.

## Stack decidida
- Backend: Java 21, Spring Boot 4.1.2, Maven.
- Frontend: HTML5, CSS3 e JavaScript sem framework; arquivos estáticos servidos pelo Spring Boot em `src/main/resources/static/`.
- Futuras integrações (NÃO implementar na etapa 2): Leaflet, tiles OpenStreetMap, Geolocation API, Nominatim via API REST Java, localStorage.
- Testes Java: dependências já presentes no `pom.xml`.

## Fluxo de trabalho
- Leia a especificação da etapa solicitada em `docs/steps/` antes de alterar código.
- Inspecione os arquivos existentes; preserve o que já funciona.
- Execute somente o escopo explicitamente solicitado. Não implemente etapas futuras antecipadamente.
- Prefira mudanças pequenas, simples, sem dependências ou abstrações desnecessárias.
- Utilize HTML semântico e CSS mobile-first, pensando em Safari no iPhone e acessibilidade.
- Execute os testes/compilação disponíveis quando possível e relate o resultado honestamente.
- Ao concluir, resuma arquivos alterados, decisões, como testar e limitações.
- Não crie commits, branches, pushes, PRs, deploys ou alterações em infraestrutura sem pedido explícito do usuário.
- Se a especificação divergir do repositório real, aponte a divergência antes de mudanças destrutivas.

## Escopo atual
A etapa 1 (bootstrap) está concluída. A etapa em desenvolvimento é **2 — Interface mobile-first**, descrita em `docs/steps/002-mobile-layout.md`.
