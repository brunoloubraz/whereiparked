# Etapas de desenvolvimento — Where I Parked

Esta pasta reúne as **especificações técnicas utilizadas durante a construção incremental** do Where I Parked.

Os documentos registram requisitos, critérios de aceite, decisões e testes planejados em cada etapa. Eles são um **histórico de desenvolvimento**: para conhecer o comportamento atual, consulte o código na branch `main`, o [README principal](../../README.md) e os testes automatizados.

| Etapa | Documento | Objetivo |
| --- | --- | --- |
| 2 | [Interface mobile-first](002-mobile-layout.md) | Estrutura inicial responsiva da interface |
| 3 | [Mapa e geolocalização](003-map-geolocation.md) | Leaflet, OpenStreetMap e localização do dispositivo |
| 4 | [API de geocodificação reversa](004-reverse-geocoding-api.md) | Backend Spring Boot e consulta opcional de endereço |
| 5 | [Persistência de estacionamento](005-parking-persistence.md) | Parked, captura de localização e `localStorage` |
| 6 | [Testes e CI](006-application-tests.md) | Suítes automatizadas e GitHub Actions |
| 6.5 | [Remover marcação](006-5-clear-parking.md) | Exclusão explícita do estacionamento salvo |
| 7 | [Docker e deploy na Vercel](007-vercel-deployment.md) | Container Java e publicação HTTPS |

A etapa inicial de bootstrap não possui documento numerado nesta pasta. Seu resultado pode ser consultado no código e no histórico de commits.

> **Nota:** algumas especificações foram escritas antes da implementação e podem conter instruções ou estados previstos para aquele momento. Não devem ser interpretadas como documentação operacional atualizada do ambiente de produção.
