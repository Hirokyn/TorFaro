# Histórico de versões

As mudanças relevantes do projeto ficam registradas aqui. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-11-03

Primeira versão pública.

### Adicionado

- Busca simultânea nos indexadores do Prowlarr, com limite de tempo por fonte
- Guias Mais recentes e Top downloads
- Filtros por fonte, categoria, resolução, codec, período, tamanho, seeders e título
- Ordenação e paginação sem nova consulta aos indexadores
- Página de detalhes com trackers, infohash e, quando disponível, lista de arquivos
- Link magnet direto para o cliente de torrent
- Agrupamento de resultados pelo infohash
- API key protegida no servidor, com tokens temporários
- Instalação com Docker Compose
