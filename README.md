# Where I Parked

Aplicação para ajudar usuários a localizar onde estacionaram o carro.

O projeto está na etapa de configuração inicial: contém a aplicação Spring Boot
e um teste de carregamento do contexto. As funcionalidades de estacionamento e
os endpoints próprios ainda não foram implementados.

## Tecnologias e requisitos

- JDK 21, com `JAVA_HOME` configurado para essa instalação.
- Spring Boot 4.1.2.
- Maven 3.9.6, disponibilizado pelo Maven Wrapper incluído no repositório.

Não é necessário instalar o Maven separadamente. A primeira execução requer
acesso à internet para baixar o Maven e as dependências.

## Compilar e executar os testes

No macOS ou Linux, na raiz do projeto:

```sh
./mvnw clean verify
```

No Windows (PowerShell):

```powershell
.\mvnw.cmd clean verify
```

O comando compila a aplicação do zero, executa os testes e gera o JAR executável
em `target/whereiparked-0.0.1-SNAPSHOT.jar`.

## Executar localmente

Com a porta 8080 disponível, execute no macOS ou Linux:

```sh
./mvnw spring-boot:run
```

No Windows (PowerShell):

```powershell
.\mvnw.cmd spring-boot:run
```

A aplicação inicia em `http://localhost:8080`. Confirme no terminal as mensagens
`Tomcat started on port 8080` e `Started WhereiparkedApplication`.

Como ainda não existem endpoints próprios, acessar `/` pode retornar HTTP 404.
Isso é esperado nesta etapa e não indica falha na inicialização.

Para encerrar a aplicação, pressione `Ctrl+C` no terminal.

## Arquivos locais

O diretório `target/`, as configurações locais de IDE e o guia gerado `HELP.md`
são ignorados pelo Git. Os scripts `mvnw` e `mvnw.cmd`, assim como o diretório
`.mvn/`, devem permanecer versionados para permitir o uso do Maven Wrapper.
