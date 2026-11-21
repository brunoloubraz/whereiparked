# Where I Parked — Etapa 7: Docker e deploy na Vercel

**Branch sugerida:** `chore/007-vercel-deployment`  
**Pré-requisito:** etapas 1–6.5 concluídas e integradas à `main`  
**Plataforma única:** Vercel Hobby, Container runtime (beta), um serviço HTTP Spring Boot para frontend e API.  
**Objetivo:** deploy HTTPS sem Render, infraestrutura paga, banco, novo endpoint ou separação do frontend.

## 1. Decisões do projeto

- Manter o frontend HTML/CSS/JS em `src/main/resources/static`, servido pelo Spring Boot 4.1.2 (Java 21).
- Preservar a API `GET /api/location/reverse` e a chave local `whereiparked:parking:v1` sem alterações de contrato.
- Adotar um **Dockerfile convencional na raiz**, reconhecido pela Vercel por `vercel.json` com `{ "framework": "container" }`.
- Container construído com Maven Wrapper (sem Maven local obrigatório), estágio JDK 21, runtime JRE 21 e usuário não-root.
- Porta dinâmica no Spring Boot: acrescentar `server.port=${PORT:8080}` a `src/main/resources/application.properties`. Usar explicitamente **`PORT=8080`** nas configurações do projeto Vercel para que o roteamento chegue à porta correta. A Vercel usa porta 80 por padrão se `PORT` não for configurado.
- Restringir-se ao plano Hobby e não habilitar nada que peça upgrade ou pagamento.
- Não ativar `GEOCODING_USER_AGENT` do Nominatim público para o deploy aberto até avaliar a adequação do uso, o rate limiting global e a privacidade das coordenadas. Com variável vazia, o backend responde 503 para consultas válidas, mas o estacionamento continua funcional: endereço é opcional.

## 2. Arquivos a produzir/alterar

1. `Dockerfile`: build multi-stage com Java 21, `./mvnw -B --no-transfer-progress -DskipTests package`, cópia do JAR executável e runtime não-root. Não executar testes dentro do build de imagem porque o CI já tem jobs Java/JS independentes.
2. `.dockerignore`: excluir `.git`, `.vercel`, `target`, dados locais, `.env*`, logs, documentos e diretórios de IDE, mantendo `.mvn`, `mvnw`, `pom.xml` e `src`.
3. `vercel.json`: usar apenas `{"framework":"container"}`, sem reescrever `/api` nem dividir serviços.
4. `src/main/resources/application.properties`: incluir `server.port=${PORT:8080}` sem mudar as propriedades de geocodificação e a configuração restritiva de logs.
5. `.github/workflows/ci.yml`: preservar jobs Java 21 e Node 24, adicionar job independente de build Docker e smoke test local (HTTP `/`, `/js/app.js` e erro 400 de entrada inválida). Não fazer deploy no CI, não exigir token nem consultar Nominatim público.
6. `README.md`: explicar build Docker, como rodar, configuração de porta, Vercel Hobby, sequência de importação GitHub, teste HTTPS, limites e que os dados permanecem no navegador.
7. `AGENTS.md`: atualizar o escopo de trabalho para etapa 7, sem apagar regras permanentes.
8. Este documento em `docs/step/007-vercel-deployment.md`.

## 3. Build e smoke test local (quando Docker estiver disponível)

Na raiz do projeto:

```sh
./mvnw clean verify
node --test src/test/js/*.test.cjs
docker build -t whereiparked:local .
docker run --rm -p 8080:8080 -e PORT=8080 --name whereiparked-local whereiparked:local
```

Em outro terminal:

```sh
curl -I http://localhost:8080/ # caso HEAD não seja aceito, usar curl -i GET
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/js/app.js >/dev/null
curl -i 'http://localhost:8080/api/location/reverse?lat=invalid&lon=0'  # esperado 400
```

Não criar consultas reais de geocodificação nos testes. Se o usuário não tem Docker no Mac, o workflow Ubuntu é alternativa para provar o build, mas não substitui teste runtime no deploy real.

## 4. Procedimento manual Vercel (após PR aprovado e merge)

1. Criar conta/entrar em https://vercel.com/ usando GitHub; confirmar **Hobby (Free)**.
2. Escolher `Add New > Project` e importar `brunoloubraz/whereiparked` autorizando o acesso ao repositório quando solicitado.
3. `Root Directory`: raiz (`./`), pois `pom.xml`, `Dockerfile` e `vercel.json` estão na raiz.
4. `Framework Preset`: `Container` (ou usar detecção pelo `vercel.json`). Não selecionar Spring Boot/Other configurado para output estático e não escolher subpasta `static`.
5. `Environment Variables`: adicionar **`PORT=8080`** nos ambientes efetivamente utilizados (ao menos Production; Preview se forem usados previews). **Não definir `GEOCODING_USER_AGENT` nesse primeiro deploy público.** Não inserir credenciais ou dados GPS no repositório.
6. `Production Branch`: `main`.
7. Clicar em `Deploy`. Aguardar resultado do build e revisar logs sem divulgar segredos ou coordenadas.
8. Testar a URL pública HTTPS: GET `/`, scripts/estilos, permissões de localização, Parked, recuperar após recarregar, Remover marcação, novo Parked.
9. Verificar que um GET para `/api/location/reverse?lat=invalid&lon=0` retorna 400; uma consulta válida pode retornar 503 enquanto geocodificação estiver desativada.
10. Validar fluxo completo no Safari do iPhone em uma URL estável de produção (lembrar: outra origem significa outro localStorage).
11. No dashboard Vercel, observar Usage e verificar que o projeto permanece no plano Hobby e não ultrapassa cotas.

**Nota:** as opções e textos do painel podem mudar; consultar a documentação oficial da Vercel. O runtime Container continua em beta.

## 5. Segurança, privacidade e terceiros

- Nominatim público exige limite absoluto de uma consulta por segundo por aplicação, identificação, atribuição e veda usos relacionados primordialmente à geocodificação, incluindo exemplos de rastreamento de veículos. Sua adequação ao produto deve ser deliberadamente avaliada antes de habilitar `GEOCODING_USER_AGENT` em produção.
- O rate limiter e o cache atuais funcionam **por instância**. A Vercel escala automaticamente e cria instâncias isoladas, portanto o limiter atual não garante limite global. Não habilitar requisições públicas ao Nominatim sem estratégia adequada.
- O proxy/plataforma pode registrar URL com query string; evitar consultas externas e qualquer publicação de coordenadas em logs. Documentar que a opção de endereço poderia enviar coordenadas a terceiros.
- Os tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png` devem preservar atribuição, Referer e comportamento normal de cache; não implementar prefetch nem políticas anti-cache.
- O armazenamento do estacionamento é no localStorage por origem; não há banco, conta, sincronização ou migração entre `localhost`, previews e domínio de produção.
- O serviço escala a zero quando ocioso; o cold start do Java pode atrasar o primeiro acesso. Medir e documentar. A UI não deve prometer disponibilidade imediata.
- Se houver erro de build, porta ou limite da modalidade beta, registrar o problema e investigá-lo antes de sugerir troca de provedor ou serviço pago.

## 6. Critérios de aceite

- [ ] Dockerfile com estágios JDK/JRE Java 21 e execução não-root.
- [ ] `.dockerignore` exclui arquivos locais e não remove artefatos necessários.
- [ ] `vercel.json` seleciona explicitamente Container.
- [ ] Porta 8080 funciona no Docker e na Vercel com `PORT=8080`; localhost continua disponível na 8080.
- [ ] Java, JavaScript e Docker build/smoke no GitHub Actions verdes.
- [ ] Nenhuma dependência npm, banco, rota nova, redeploy externo pelo CI ou serviço pago.
- [ ] Um único projeto Vercel serve HTML/CSS/JS e API Java sob mesmo domínio HTTPS.
- [ ] Estacionar → salvar → restaurar → remover → estacionar novamente validado no iPhone.
- [ ] Geocodificação pública permanece desativada até análise de conformidade.
- [ ] README/AGENTS atualizados e PR aprovado/mergeado.

## 7. Fontes oficiais verificadas (20 nov. 2026)

- Containers Vercel: https://vercel.com/kb/guide/docker
- Dockerfile na raiz e framework container: https://vercel.com/changelog/deploy-a-container-from-a-plain-dockerfile
- Plano Hobby: https://vercel.com/docs/plans/hobby
- Git import: https://vercel.com/docs/git
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- OSM Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
