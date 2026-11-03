# API da aplicação

As rotas abaixo são contratos da nova aplicação, não espelhos da API do Prowlarr.

## `GET /api/health`

Resposta:

```json
{
  "status": "connected",
  "prowlarr": {
    "reachable": true,
    "version": "2.5.2.5491"
  },
  "checkedAt": "2026-11-02T00:00:00.000Z"
}
```

Não devolver host interno, API key ou stack trace.

## `GET /api/indexers`

Normalizar `/api/v1/indexer` e `/api/v1/indexerstatus`:

```json
{
  "indexers": [
    {
      "id": 1,
      "name": "1337x",
      "enabled": true,
      "protocol": "torrent",
      "available": true,
      "disabledUntil": null,
      "categories": [{ "id": 2000, "name": "Movies" }]
    }
  ]
}
```

Ausência em `/api/v1/indexerstatus` significa sem falha registrada; não significa estado desconhecido.

A lista contém somente indexadores habilitados. `available` é `false` apenas enquanto `disabledTill` estiver no futuro.

## `GET /api/search`

Parâmetros aceitos:

- `q`: opcional. Vazio, lista os lançamentos recentes; preenchido, exige no mínimo 2 caracteres. A interface só faz a chamada sem termo depois de um clique em uma guia;
- `indexerIds`: IDs repetidos ou CSV somente na API interna;
- `categories`: IDs normalizados;
- `sources`: IDs de indexador; filtra o resultado local, sem nova consulta ao Prowlarr;
- `qualities`: `2160p`, `1080p`, `720p`, `sd`;
- `codecs`: `h265`, `h264`, `av1`;
- `titleIncludes`: palavras que devem estar todas no título, sem diferenciar caixa ou acento;
- `titleExcludes`: palavras que eliminam o resultado;
- `maxAgeDays`: 1, 7, 30 ou 365;
- `minSeeders`;
- `minSize` e `maxSize` em bytes;
- `publishedAfter`;
- `sort`: `publishedAt` (padrão), `seeders`, `leechers`, `size`, `title`, `indexer`;
- `order`: `asc` ou `desc`;
- `page`;
- `pageSize`: 25 (padrão), 50 ou 100;
- `deduplicate`: booleano;
- `cachedOnly`: booleano. Quando `true`, nunca consulta o Prowlarr: sem cache válido, responde 409 `search_expired`.

Sem `indexerIds`, o backend envia `indexerIds=-2`, o agregador de torrents habilitados.

Somente `q` e `indexerIds` definem a consulta ao Prowlarr. Os demais parâmetros operam sobre o conjunto já em cache.

A ordenação compara `publishedAt` por dia. Depois do campo escolhido, os empates seguem esta ordem: dia mais recente, mais seeders e `id`.

O backend consulta cada indexador em uma chamada própria, com limite de 30 segundos. A falha de uma fonte aparece em `partial.unavailableIndexers`, e o erro só é devolvido se todas falharem. Se a lista de indexadores não estiver disponível, ele faz uma única chamada agregada.

Parâmetros repetidos continuam sendo o formato aceito para vários indexadores na mesma chamada:

```text
indexerIds=1&indexerIds=5
```

Resposta pública:

```json
{
  "query": "ubuntu",
  "results": [
    {
      "id": "resultado-opaco",
      "title": "Ubuntu Linux",
      "indexerId": 1,
      "indexerName": "1337x",
      "size": 123456789,
      "seeders": 42,
      "leechers": 3,
      "publishedAt": "2026-01-01T00:00:00Z",
      "categories": [{ "id": 4000, "name": "PC" }],
      "quality": "1080p",
      "codec": "h265",
      "grabs": 2340,
      "files": 7,
      "imdbId": 133093,
      "infoHash": "2c6b6858d61da9543d4231a71db4b1c9264b0685",
      "magnetUrl": null,
      "infoUrl": "https://example.invalid/item/1",
      "torrentActionToken": "token-curto-ou-null",
      "sources": [{ "indexerId": 1, "indexerName": "1337x", "seeders": 42 }]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "upstreamCount": 182,
    "filteredCount": 120,
    "totalPages": 3,
    "hasMore": true
  },
  "partial": {
    "isPartial": true,
    "unavailableIndexers": [
      { "id": 8, "name": "Internet Archive", "disabledUntil": "2026-11-02T07:48:32Z" }
    ]
  },
  "facets": {
    "categories": [{ "id": 4000, "name": "PC", "count": 43 }],
    "sources": [{ "id": 1, "name": "1337x", "count": 80 }],
    "qualities": [{ "id": "1080p", "name": "1080p", "count": 453 }],
    "codecs": [{ "id": "h265", "name": "H.265", "count": 150 }]
  },
  "searchedAt": "2026-11-02T00:00:00.000Z",
  "servedFromCache": false
}
```

Erros usam sempre o mesmo formato, com mensagem própria:

```json
{ "error": { "code": "search_unavailable", "message": "Não foi possível consultar o Prowlarr agora." } }
```

Campos proibidos na resposta pública:

- `downloadUrl` bruto;
- `apiKey`;
- URL interna do Prowlarr;
- resposta `raw` completa;
- mensagens internas ou stack traces.

## `GET /api/results/:token/details`

Devolve `{ "result": SearchResultDto, "details": TorrentDetails | null }`. `details` traz `infoHash`, `name`, `trackers`, `files` (no máximo 1.000), `fileCount`, `pieceSize`, `pieceCount`, `createdBy`, `comment` e `createdAt`, lidos do magnet ou do `.torrent` entregue pelo Prowlarr. É `null` quando a fonte não responde. O resultado fica guardado no token, e a página continua abrindo depois de o cache da busca expirar.

## `GET /api/results/:token/magnet`

Resolve o token e responde `{ "magnetUrl": "magnet:?..." }`. Responde 422 `magnet_unavailable` quando o resultado só oferece arquivo `.torrent`.

## `GET /api/results/:token/torrent`

Transmite o `.torrent`, limitado a 10 MiB e 30 segundos, ou responde 302 para o `magnet:` quando o Prowlarr devolver um magnet.

Nas duas rotas de ação, token inexistente ou de outro IP responde 404, e token expirado responde 410. Nenhuma delas aceita URL vinda do cliente. Quando `/torrent` é aberta por navegação direta, os erros voltam como uma página HTML curta com link para a busca.

## Autenticação

Não há. A aplicação é de uso exclusivo da rede local, e nenhuma rota define cookies.

## Deduplicação

1. Deduplicar apenas quando houver `infoHash` válido e igual.
2. Não deduplicar somente por título.
3. Preservar fontes alternativas.
4. Não somar seeders de indexadores diferentes.
5. Escolher como principal a fonte disponível com mais seeders e metadados completos.

