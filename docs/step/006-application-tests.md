# Where I Parked — Etapa 6: Testes, qualidade e CI

**Branch sugerida:** `test/006-application-tests`  
**Escopo:** um Pull Request para consolidar testes e automatizar verificações.  
**Pré-requisito:** etapas 1–5 integradas à branch principal.

## 1. Objetivo

Consolidar a confiabilidade do MVP *Where I Parked* com verificações reproduzíveis, cobrindo o backend Java/Spring Boot, o frontend JavaScript e os fluxos críticos de estacionamento. Implementar integração contínua (CI) no GitHub Actions para rodar automaticamente nos Pull Requests e nos pushes para a branch principal.

**Não implementar funcionalidades novas.** Não é a etapa de Docker, deploy, PWA, rotas, histórico, banco de dados ou autenticação.

## 2. Estado conhecido e validação inicial

Pelos relatórios anteriores do projeto, a etapa 5 tinha **149 testes Java** e **24 testes JavaScript** aprovados em determinado momento. Esses números são históricos: **inspecionar o repositório e contar os testes efetivamente existentes agora** antes de documentar resultados. Os testes JavaScript utilizam o runner nativo `node:test` e não exigem necessariamente dependências npm.

Antes de modificar qualquer arquivo, inspecionar:

- `AGENTS.md`, `README.md`, `pom.xml` e `.mvn/`;
- `src/test/java/` e `src/test/js/`;
- `src/main/resources/static/js/app.js` e frontend atual;
- configurações de Mockito, Maven Surefire e possíveis workflows existentes;
- nome real da branch principal do repositório;
- documentação em `docs/step/`.

Executar uma linha de base **antes das mudanças**:

```bash
java -version
node --version
./mvnw clean verify
node --test src/test/js/*.test.cjs
git diff --check
```

Registrar testes, falhas, limitações do ambiente e duração. Uma falha por restrição de sandbox ou anexação do agente Mockito deve ser distinguida de defeitos do projeto; não informar sucesso para comandos não executados.

## 3. Entregas

### 3.1 Revisão dos testes Java

Verificar e, **somente se necessário**, complementar cobertura dos comportamentos já implementados:

- `GET /api/location/reverse`: 200, 400, 404, 429, 503 e 504 conforme contrato;
- latitude e longitude ausentes, inválidas e extremas;
- integração `RestClient` com provedor simulado; tipos JSON incorretos e respostas incompletas;
- timeouts na conexão e na leitura do corpo da resposta;
- cache de uma entrada, TTL e controle de requisições por instância;
- preservação das coordenadas originais e mensagens de erro controladas;
- testes determinísticos, sem chamadas reais ao Nominatim.

Não introduzir métricas de cobertura sem ferramenta que realmente as meça. Não aumentar testes apenas por aumentar a contagem.

### 3.2 Revisão dos testes JavaScript

Verificar e, se necessário, complementar:

- salvamento de um único estacionamento e substituição do anterior;
- restauração depois de recarregar, inclusive com GPS negado;
- aquisição via `watchPosition`, escolha de amostra por `accuracy`, encerramento com `clearWatch`, tempo máximo e saída antecipada **conforme implementação atual**;
- funcionamento e diferenciação dos marcadores Leaflet e círculo de precisão;
- falha de `localStorage` e corrupção de dados, sem perda indevida do registro válido;
- geocodificação opcional: resposta válida, endereço nulo, erros HTTP, timeout, offline e nenhum retry oculto;
- resposta HTTP antiga não sobrescreve um estacionamento novo;
- nenhuma gravação sem ação explícita do usuário;
- mensagens acessíveis, XSS evitado por APIs de texto e não por HTML inseguro.

Reutilizar `node:test`; evitar frameworks e dependências adicionais se não trouxerem benefício substancial. Os testes devem ser reproduzíveis e não depender do GPS físico, navegador, servidor remoto ou internet.

### 3.3 CI — GitHub Actions

Criar `.github/workflows/ci.yml` com jobs independentes, preferencialmente **Java** e **JavaScript**, executados nos eventos `pull_request` e `push` para a branch principal (usar o nome real da branch; não presumir `main` sem verificar). Opcionalmente `workflow_dispatch` para disparo manual.

Configuração sugerida:

| Item | Configuração |
|---|---|
| Runner | `ubuntu-latest` |
| Repositório | `actions/checkout@v7` |
| Java | `actions/setup-java@v6`, Temurin 21, cache Maven |
| Maven | `./mvnw -B --no-transfer-progress clean verify` |
| Node | `actions/setup-node@v7`, Node 24 |
| JavaScript | `node --test src/test/js/*.test.cjs` |
| Token | `permissions: contents: read` |

**Exemplo de referência, sujeito à revisão no repositório:**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main] # Trocar se a branch principal tiver outro nome
  workflow_dispatch:

permissions:
  contents: read

jobs:
  java-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      - name: Maven verify
        run: ./mvnw -B --no-transfer-progress clean verify

  javascript-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
      - name: JavaScript tests
        run: node --test src/test/js/*.test.cjs
```

Não executar `npm install` quando não houver `package.json` ou dependências npm necessárias. Não exigir credenciais do Nominatim; os testes devem usar mocks/servidores locais. Não usar `pull_request_target` para executar código do PR. Não publicar artifacts ou dados sensíveis sem justificativa.

**Mockito:** o projeto teve falhas de autoanexação do agente em sandbox nas etapas anteriores. Primeiro executar CI e reproduzir eventuais erros. Se precisar de agente explícito, preferir a configuração documentada pelo Mockito para Maven Surefire com `-javaagent` resolvido por propriedades do Maven (sem caminhos absolutos do Mac ou flags para esconder problemas). Não substituir a estratégia de mocks nem modificar `pom.xml` indiscriminadamente.

### 3.4 Verificação manual e registro de limitações

Adicionar ao README um roteiro enxuto para validações manuais, separando testes locais de testes em dispositivo real:

1. Acessar `/`, confirmar mapa e permissão de localização.
2. Pressionar Parked, confirmar marcador e persistência após refresh/reabertura.
3. Registrar novo ponto e confirmar substituição.
4. Negar GPS após um estacionamento salvo e confirmar restauração.
5. Simular API indisponível e confirmar persistência das coordenadas.
6. Verificar a origem da mensagem «Endereço indisponível» caso ainda ocorra (status HTTP, configuração `GEOCODING_USER_AGENT`, sem expor identificação em logs).
7. Conferir responsividade, acessibilidade básica e comportamento em Safari/iPhone por HTTPS.

Testes em iPhone real e integração Nominatim pública **não devem ser parte do CI**. Não fazer chamadas públicas para fins de carga nem repetir requisições em lote.

### 3.5 Revisão de segurança e documentação

- Confirmar que nenhuma credencial, identificação pessoal de contato ou coordenada precisa do usuário foi adicionada ao Git ou logs.
- Confirmar proteção contra textos externos inseridos como HTML e contra atualizações atrasadas.
- Atualizar `README.md` e `AGENTS.md` apenas para corrigir inconsistências reais de instruções, execução de testes e estado do projeto.
- Manter contrato Java, layout e persistência do MVP.

## 4. Execução sugerida em incrementos

1. **Diagnóstico:** inventário da suíte, execução da linha de base, análise de lacunas.
2. **Testes:** acrescentar somente testes necessários para comportamentos já existentes e corrigir defeitos comprovados.
3. **CI:** configurar e validar `.github/workflows/ci.yml`.
4. **Documentação:** instruções para testes locais, CI e checklist manual.
5. **Revisão:** `./mvnw clean verify`, `node --test src/test/js/*.test.cjs`, `git diff --check`, revisão do diff; abrir PR e observar execução real do Actions.

## 5. Critérios de aceite (Definition of Done)

- [ ] Testes Java existentes e novos passam em Java 21.
- [ ] Testes JavaScript existentes e novos passam em versão Node suportada (CI: 24).
- [ ] Nenhum teste automatizado acessa o Nominatim público nem depende de GPS real.
- [ ] Workflow está versionado e é acionado por Pull Request.
- [ ] Jobs **Java** e **JavaScript** ficam verdes em uma execução real no GitHub Actions (não basta validar o YAML localmente).
- [ ] Permissões de token mínimas e nenhum segredo desnecessário no workflow.
- [ ] Falhas de Mockito/ambiente são tratadas de forma reproduzível e não mascaradas.
- [ ] README documenta como testar e o que depende de validação manual.
- [ ] Fluxo de estacionamento permanece intacto e o frontend continua funcional.
- [ ] `git diff --check` passa e o Code Review não apresenta bloqueadores.

## 6. Fora do escopo

Não criar Dockerfile, deploy, domínio, PWA, autenticação, histórico, banco de dados, mapa novo, rotas, tracking contínuo nem novas funcionalidades. Não criar commits, pushes ou PRs automaticamente sem instrução explícita.

## 7. Referências oficiais

- GitHub Actions, Java + Maven: https://docs.github.com/en/actions/tutorials/build-and-test-code/java-with-maven
- GitHub workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- actions/checkout: https://github.com/actions/checkout
- actions/setup-java: https://github.com/actions/setup-java
- actions/setup-node: https://github.com/actions/setup-node
- Mockito agent (Java 21+): https://javadoc.io/doc/org.mockito/mockito-core/latest/org.mockito/org/mockito/Mockito.html
- Node.js releases: https://nodejs.org/en/about/previous-releases
