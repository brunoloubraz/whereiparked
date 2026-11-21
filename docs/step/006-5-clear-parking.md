# Where I Parked — Etapa 6.5: Remover marcação de estacionamento

**Branch sugerida:** `feat/clear-parking`  
**Pré-requisito:** etapas 1–6 concluídas e integradas à `main`  
**Status:** especificação para planejamento/implementação; não é um registro de mudanças já feitas.

## 1. Objetivo

Concluir o ciclo essencial do MVP: **estacionar → salvar → visualizar → retirar o carro → remover a marcação**.

Permitir a exclusão explícita do **único** estacionamento salvo, tanto no `localStorage` quanto no mapa Leaflet, sem modificar o backend Java, a geocodificação reversa nem a localização atual.

## 2. Estado atual confirmado no repositório

- Página: `src/main/resources/static/index.html`.
- Interface: `src/main/resources/static/css/style.css`.
- Aplicação: `src/main/resources/static/js/app.js`.
- Suíte JavaScript: `src/test/js/parking.test.cjs`, usando `node:test` e simuladores de DOM/Leaflet/storage/fetch.
- CI: `.github/workflows/ci.yml` executa Java 21/Maven e JavaScript/Node 24.
- Chave do estacionamento: `whereiparked:parking:v1`.
- Estado em memória: `parking`, `parkingMarker`, `capturing`, `operation`.
- Ao estacionar, `localStorage.setItem(...)` precede o marcador e a geocodificação. A resposta da API é associada a `parking.id` e `operation`.
- A restauração do estacionamento ocorre antes da verificação de GPS. O código atual tem retornos antecipados para Leaflet indisponível e para contexto inseguro/GPS indisponível.

**Observação de integração:** o botão para excluir precisa ser inicializado e tratado **antes do retorno por GPS/contexto inseguro**, de modo que um estacionamento restaurado continue removível. Se o mapa/Leaflet não carregar, não criar falsas garantias de que o fluxo normal está disponível; avaliar uma estratégia pequena e segura sem acrescentar funcionalidade nova.

## 3. Interface e UX

- Manter o botão principal **Parked**, mapa, ponto azul e marcador verde existentes.
- Acrescentar um botão **secundário** com o texto `Remover marcação`, próximo à ação Parked, mas com destaque menor.
- O botão secundário fica **oculto** se não existir um estacionamento válido no estado atual e aparece quando um estacionamento for salvo ou restaurado.
- Usar `<button type="button">`, não link ou elemento genérico clicável; fornecer foco visível, área de toque confortável e texto acessível.
- Antes de remover, solicitar **uma confirmação simples**. Preferência por `window.confirm()` para não introduzir componente/modal customizado; é aceitável propor alternativa apenas se houver motivo concreto.
- Texto de confirmação: `Remover a marcação do estacionamento?` (sem sugerir exclusão da localização atual).
- Ao confirmar e excluir com sucesso, anunciar brevemente `Marcação removida` em status acessível (`role="status"`/`aria-live`).
- Se o usuário cancelar, não alterar estado, marcador nem armazenamento, e evitar anúncio incorreto de sucesso.
- Não criar telas, histórico, múltiplos registros ou confirmação redundante.

## 4. Regra de negócio e persistência

### 4.1 Remoção bem-sucedida

1. Verificar que existe estacionamento atual; impedir reentrada/ação durante uma captura `Parked` em andamento.
2. Solicitar confirmação explícita ao usuário.
3. Chamar **somente** `localStorage.removeItem('whereiparked:parking:v1')` dentro de `try/catch`.
4. **Somente após a exclusão local ter êxito:** invalidar a operação antiga (`operation`), zerar `parking` em memória, remover `parkingMarker` do mapa usando a API Leaflet (`map.removeLayer(parkingMarker)` ou equivalente) e definir `parkingMarker = null`.
5. Ocultar/desabilitar a ação secundária; manter o botão Parked funcionando de acordo com a disponibilidade do GPS.
6. Manter `currentMarker`, `accuracyCircle`, tiles, controles de mapa e localização atual. Não forçar um novo pedido de permissão nem recentralizar o mapa sem necessidade.
7. O próximo clique em Parked deve criar um **novo registro** e mostrar novamente `Remover marcação`.

### 4.2 Falhas e cancelamento

- **Cancelar a confirmação:** nenhuma mutação, inclusive de `operation` ou do registro no navegador.
- **`localStorage` indisponível/lança `SecurityError` na remoção:** manter o estacionamento e o marcador anteriores; mostrar erro compreensível, sem anúncio de sucesso.
- **Sem estacionamento salvo:** ocultar o botão; uma chamada defensiva ao handler deve ser inofensiva.
- **GPS negado/desativado e estacionamento restaurado:** permitir a remoção. O botão Parked pode continuar desabilitado.
- **Aquisição GPS em andamento:** não permitir remover simultaneamente (desabilitar ou bloquear o clique até finalizar).
- **Novo estacionamento:** não restaurar registro antigo após remoção; manter apenas um registro.

### 4.3 Segurança contra respostas assíncronas

O `enrichAddress()` atual usa `operation`, `parking.id` e `storedOperation()` para impedir sobrescrita por respostas de consultas antigas.

- Invalidar a operação ao remover com sucesso e garantir que uma resposta `fetch` anterior (sucesso, erro ou `finally`) **não** recrie o registro, o marcador ou o texto de sucesso anterior.
- Se for simples e seguro, cancelar requisição de endereço ativa via `AbortController`; contudo, a garantia de integridade deve funcionar **mesmo que o cancelamento não impeça a resolução tardia**.
- Garantir remoção também se a confirmação acontecer antes do término da busca do endereço.
- Não apagar outras chaves do `localStorage`: jamais usar `localStorage.clear()`.
- Não realizar chamada à API Java ou Nominatim para remover a marcação.

## 5. Arquivos previstos

- `src/main/resources/static/index.html`: novo botão secundário com identificador estável, inicialmente oculto.
- `src/main/resources/static/css/style.css`: estilo secundário e estados oculto/desabilitado/foco; preservar responsividade e safe areas do Safari.
- `src/main/resources/static/js/app.js`: apresentação condicional do botão, confirmação, remoção da chave, camada Leaflet e proteção contra resposta tardia.
- `src/test/js/parking.test.cjs`: atualizar mock de `localStorage` para `removeItem`, testar transições e concorrência.
- `README.md` e `AGENTS.md`: somente documentação pertinente; registrar etapa atual/funcionalidade e comandos de teste.
- Esta especificação: `docs/step/006-5-clear-parking.md`.

**Evitar mudanças** no `pom.xml`, código Java, contrato `/api/location/reverse`, configuração de CI e dependências, salvo defeito demonstrado e justificado.

## 6. Testes automatizados obrigatórios (Node `node:test`)

1. Sem estacionamento: botão de remover oculto e Parked mantém comportamento original.
2. Estacionamento restaurado: remover aparece mesmo se o GPS estiver indisponível/negado.
3. Clique + cancelamento: storage, marker, mensagens e operação inalterados.
4. Clique + confirmação: chamada a `removeItem` **somente** para a chave correta; `parkingMarker` removido, referência limpa e botão secundário oculto.
5. Após remover e recarregar: nenhum estacionamento reaparece e nenhuma geocodificação é solicitada na restauração.
6. Falha de `removeItem`: registro/marker preservados e erro anunciado, sem falso sucesso.
7. Remoção com geocodificação pendente: resposta tardia `200` não regrava registro, não recria marcador nem mostra status antigo.
8. Remoção com geocodificação pendente: erro tardio também não sobrescreve a confirmação de remoção.
9. GPS ausente: exclusão continua funcionando, sem depender da captura.
10. Uma nova marcação após remoção: único registro salvo, marcador novo, botão secundário reaparece.
11. Clique de remover durante aquisição de posição: bloqueado sem inconsistência.
12. Preservação do ponto azul, círculo de precisão, controles e atribuição OpenStreetMap.
13. Todos os testes existentes continuam passando; nenhuma alteração ao backend exigida.

## 7. Validação manual

Em `http://localhost:8080`, e opcionalmente no Safari do iPhone pelo mesmo método HTTPS já usado:

- Sem estacionamento: aparece somente a ação Parked.
- Marcar: aparece o marcador do carro e o botão `Remover marcação`.
- Cancelar confirmação: estacionamento permanece.
- Confirmar: marcador verde desaparece; ponto azul e mapa permanecem; status `Marcação removida`.
- Recarregar: não há marcador do carro nem ação de remover.
- Marcar novamente: novo registro e botão reaparecem.
- Negar localização após um estacionamento já salvo e recarregar: ainda consegue excluir.
- Verificar telas pequenas, áreas seguras do iPhone e navegação por teclado/VoiceOver quando possível.

## 8. Verificações de build/CI

```sh
node --test src/test/js/*.test.cjs
./mvnw clean verify
git diff --check
```

O PR deve manter o CI da etapa 6 verde (dois jobs Java e JavaScript). A validação real no GitHub Actions acontece após push/abertura de PR, não pode ser alegada só com execução local.

## 9. Restrições

- Sem banco de dados, login, histórico, múltiplos carros, rotas, PWA, notificações, botão "desfazer" ou alteração manual do marcador.
- Sem deploy nesta etapa; a etapa 7 continua reservada a Docker e hospedagem.
- Sem migração de armazenamento nem mudança da chave `whereiparked:parking:v1`.
- Não expor coordenadas ou dados pessoais em logs.
- Não criar commits, pushes ou PRs sem autorização explícita.
- Implementação mínima e consistente com o código existente; evitar refatoração ampla.

## 10. Critérios de aceite (Definition of Done)

- [ ] Ação `Remover marcação` aparece somente com estacionamento salvo/restaurado.
- [ ] Confirmação pode ser aceita ou cancelada sem efeitos colaterais.
- [ ] Exclusão remove apenas `whereiparked:parking:v1` e o marcador do carro.
- [ ] Marcador/localização atuais e mapa continuam funcionando.
- [ ] Reabrir a página não restaura estacionamento removido.
- [ ] Remover funciona com GPS negado ou indisponível.
- [ ] Falha de armazenamento mantém os dados e mostra erro.
- [ ] Respostas atrasadas de geocodificação não restauram o registro.
- [ ] Novo Parked funciona depois de remover.
- [ ] Testes JavaScript + Java e dois jobs do GitHub Actions passam.
- [ ] PR revisado e mergeado, sem funcionalidades fora do escopo.
