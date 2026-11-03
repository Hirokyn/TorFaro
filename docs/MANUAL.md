# Manual do TorFaro

## Índice

1. [A ideia do projeto](#a-ideia-do-projeto)
2. [Como funciona](#como-funciona)
3. [Requisitos](#requisitos)
4. [Instalação com Docker](#instalação-com-docker)
5. [Instalação sem Docker](#instalação-sem-docker)
6. [Configuração](#configuração)
7. [Acesso pela rede](#acesso-pela-rede)
8. [Usando a aplicação](#usando-a-aplicação)
9. [Fontes e qualidade dos dados](#fontes-e-qualidade-dos-dados)
10. [Adicionando fontes no Prowlarr](#adicionando-fontes-no-prowlarr)
11. [Logos das fontes](#logos-das-fontes)
12. [Segurança](#segurança)
13. [Atualização](#atualização)
14. [Solução de problemas](#solução-de-problemas)
15. [Limites conhecidos](#limites-conhecidos)
16. [Desenvolvimento](#desenvolvimento)

## A ideia do projeto

Quem usa Prowlarr costuma ter vários indexadores bem configurados, mas pesquisar manualmente neles não é confortável: a tela foi feita para administrar, não para comparar resultados. Sobra abrir vários sites de torrent, cheios de anúncios e páginas enganosas, para buscar algo que o Prowlarr já alcança.

O TorFaro resolve isso como um **integrador**. Ele aproveita a configuração que você já tem e entrega uma tela única de busca, com a experiência de um site comum.

Três princípios guiam o projeto:

1. **O Prowlarr continua no comando.** A aplicação só lê dados. Indexadores, proxies e aplicativos são configurados nele, como sempre.
2. **Segredos ficam no servidor.** O Prowlarr devolve links que contêm a sua API key. A aplicação nunca os repassa ao navegador.
3. **Respeito às fontes.** Uma busca só acontece quando você pede. Ordenar, filtrar ou trocar de página usa o resultado já obtido, sem consultar os sites de novo.

**O que o projeto não faz:** não baixa nada sozinho, não fala com cliente de torrent, não gerencia indexadores, não substitui Sonarr nem Radarr, não faz streaming e não mantém biblioteca de mídia.

## Como funciona

```text
Navegador
   │  só recebe dados tratados e tokens temporários
   ▼
TorFaro (Next.js)
   │  guarda a API key, filtra, ordena e pagina
   ▼
Prowlarr
   │  usa os indexadores que você configurou
   ▼
Sites de torrent
```

Ao buscar, a aplicação consulta cada indexador separadamente, com limite de 30 segundos por fonte. As respostas são normalizadas e guardadas em memória por 3 minutos. A partir daí, filtros, ordenação e páginas funcionam sobre esse conjunto completo, por isso respondem na hora.

Cada resultado recebe um token aleatório. Quando você abre o magnet, o servidor troca o token pelo link real no Prowlarr. O navegador nunca vê a URL original.

## Requisitos

- **Prowlarr** em funcionamento, com pelo menos um indexador de torrent. Testado na versão 2.5.
- **Docker e Docker Compose**, ou **Node.js 24** com npm.
- **Acesso de rede** entre o servidor da aplicação e o Prowlarr.
- **Cliente de torrent** no aparelho de quem usa, como qBittorrent ou Transmission.
- **Recursos:** cerca de 100 MB de memória em uso. O Compose limita o container a 768 MB.

Para indexadores protegidos por Cloudflare, configure o FlareSolverr no próprio Prowlarr. Esta aplicação não precisa saber disso.

## Instalação com Docker

1. Baixe o projeto:

   ```bash
   git clone https://github.com/Hirokyn/TorFaro.git
   ```

   ```bash
   cd TorFaro
   ```

2. Crie o arquivo de configuração:

   ```bash
   cp .env.example .env
   ```

3. Abra o `.env` e preencha `PROWLARR_URL` e `PROWLARR_API_KEY`. A chave fica em **Prowlarr > Settings > General > API Key**.

4. Suba o container:

   ```bash
   docker compose up -d --build
   ```

5. Acesse <http://localhost:3000>.

Para conferir se tudo funcionou:

```bash
docker compose ps
```

```bash
curl http://localhost:3000/api/health
```

A resposta deve trazer `"status":"connected"` e a versão do seu Prowlarr.

> **`localhost` no `PROWLARR_URL` não funciona no Docker**, porque aponta para o próprio container. Use o IP da máquina do Prowlarr. Se os dois estiverem na mesma rede Docker, use o nome do serviço, como `http://prowlarr:9696`, e conecte os containers à mesma rede.

## Instalação sem Docker

```bash
npm ci
```

```bash
npm run build
```

O build gera um servidor independente em `.next/standalone`, que precisa dos arquivos estáticos ao lado:

```bash
cp -r .next/static .next/standalone/.next/static
```

```bash
cp -r public .next/standalone/public
```

Inicie informando as variáveis:

```bash
PROWLARR_URL=http://192.0.2.10:9696 PROWLARR_API_KEY=sua-chave PORT=3000 node .next/standalone/server.js
```

> O `next build` copia o `.env` para `.next/standalone`. Não publique essa pasta nem a compartilhe.

## Configuração

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `PROWLARR_URL` | Sim | Endereço do Prowlarr, visto pelo servidor da aplicação |
| `PROWLARR_API_KEY` | Sim | API key do Prowlarr. Nunca é enviada ao navegador |
| `APP_BIND` | Não | Interface onde o Docker publica a porta. Padrão: `127.0.0.1` |
| `APP_PORT` | Não | Porta publicada pelo Docker. Padrão: `3000` |

## Acesso pela rede

Por padrão, a aplicação só responde na própria máquina. Isso é proposital: **ela não tem login**.

Para liberar aos aparelhos da sua rede local, adicione ao `.env`:

```env
APP_BIND=0.0.0.0
```

E recrie o container:

```bash
docker compose up -d
```

**Não exponha diretamente na internet.** Qualquer pessoa que alcançar o endereço poderia usar seus indexadores. Para acesso remoto, use uma VPN, como WireGuard ou Tailscale, ou um proxy reverso com autenticação.

### Atrás de um proxy reverso

Exemplo para Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

Mantenha `proxy_read_timeout` acima de 30 segundos, que é o limite de cada fonte.

A aplicação identifica cada aparelho pelo primeiro IP de `X-Forwarded-For`. Sem proxy, ou com um proxy que repasse esse cabeçalho sem tratá-lo, um usuário poderia informar outro IP e contornar os limites de uso. Isso não expõe a API key.

## Usando a aplicação

### Tela inicial

Abrir a página não consulta nada. A busca começa quando você:

- digita um termo e aperta Enter ou clica em **Buscar**;
- clica em **Mais recentes** ou **Top downloads**.

### Guias

- **Mais recentes:** do mais novo para o mais antigo. Dentro do mesmo dia, vêm primeiro os resultados com mais seeders.
- **Top downloads:** do maior para o menor número de seeders, a única medida comum a todas as fontes. O contador real de downloads só existe em algumas.

Sem termo, as guias mostram os lançamentos que cada indexador oferece, normalmente dos últimos dias. Com um termo, elas ordenam os resultados da busca.

### Escolhendo indexadores

O seletor ao lado do campo de busca limita a consulta a alguns indexadores. Essa escolha vale a partir do próximo clique em **Buscar**. Fontes com falha recente aparecem marcadas, com o horário previsto de retorno.

### Filtros

Os menus acima da lista usam caixas de seleção e mostram quantos resultados existem em cada opção. Eles agem na hora, sem nova consulta.

| Filtro | O que faz |
| --- | --- |
| Fontes | Mostra só os resultados das fontes marcadas |
| Categoria | Filmes, TV, Áudio, Livros, PC, Console, Outros |
| Resolução | 4K, 1080p, 720p ou SD, lida do título |
| Codec | H.265, H.264 ou AV1, lido do título |
| Período | Últimas 24 horas, 7 dias, 30 dias ou 1 ano |
| Tamanho | Faixas prontas ou valores em GB |
| Mais filtros | Só com seeders, agrupar duplicados, palavras no título, mínimo de seeders e data |

Os filtros ativos aparecem como etiquetas logo abaixo, e cada uma pode ser removida. **Limpar** remove todos.

Em **Título contém**, todas as palavras precisam estar no título. Em **Título não contém**, basta uma para eliminar o resultado. Caixa e acentos são ignorados.

### Ordenação e páginas

Clique no nome de uma coluna para ordenar. A ordenação reclassifica **todos** os resultados encontrados e só depois divide em páginas, por isso a lista volta para a página 1. A paginação fica fixa no rodapé da tela.

Empates seguem sempre a mesma regra: dia mais recente e, depois, mais seeders.

### Abrindo um resultado

Cada linha tem três ações:

- **Ímã:** abre no seu cliente de torrent. Fontes que entregam `.torrent` têm o arquivo convertido em magnet pelo servidor, então o comportamento é o mesmo em todas.
- **Copiar:** copia o link magnet.
- **Origem:** abre a página do resultado no site original.

Clicar no título abre a **página de detalhes** em nova aba, com números completos, categoria, formato, infohash, trackers e links para IMDb e para a página original, quando disponíveis. Nas fontes que entregam `.torrent`, ela mostra também os arquivos, as peças, o programa que gerou o torrent e o comentário.

### Compartilhando

A URL guarda o termo, os filtros e a ordenação. Ao abrir um link assim, a busca é refeita. Os tokens dos botões, porém, são válidos apenas no aparelho que fez a busca.

## Fontes e qualidade dos dados

Tudo o que aparece vem do Prowlarr, e cada indexador informa dados diferentes.

- **Datas** podem ser aproximadas. Vários sites só dizem algo como "há 3 meses".
- **Sem data:** quando todos os resultados de uma fonte têm o horário da própria busca, a data é considerada desconhecida, e eles vão para o fim em Mais recentes.
- **Resolução e codec** vêm do título. Sem essa informação no título, o resultado some quando o filtro está ativo.
- **Resultados parciais:** o aviso amarelo indica fontes que falharam ou demoraram demais. O restante da lista é válido.
- **Cuidado com fontes públicas:** arquivos falsos existem. Prefira resultados com muitos seeders e desconfie de títulos estranhos ou tamanhos incoerentes.

## Adicionando fontes no Prowlarr

Novas fontes aparecem aqui automaticamente depois de cadastradas no Prowlarr.

Se o seu Prowlarr está ligado ao Sonarr ou ao Radarr em modo de sincronização completa, **todo indexador novo vai para eles também**, e passa a ser usado em downloads automáticos. Para manter uma fonte só nesta interface, use tags:

1. Crie uma tag no Prowlarr, por exemplo `arr-sync`.
2. Adicione essa tag a **todos os indexadores atuais**.
3. Só então adicione a tag aos aplicativos, em **Settings > Apps**.
4. Cadastre as fontes novas sem essa tag.

> A ordem importa. Se os aplicativos receberem a tag antes dos indexadores, a sincronização pode remover os indexadores atuais do Sonarr e do Radarr.

Dicas:

- Teste cada fonte com uma busca real. O teste de conexão do Prowlarr pode passar e a busca ser bloqueada depois.
- Fontes com Cloudflare dependem do FlareSolverr, que pode ser instável. Se ele for compartilhado com fontes importantes, adicione uma de cada vez e observe.

## Logos das fontes

O projeto **não inclui logos**, porque são marcas de seus donos. Cada fonte aparece com uma sigla colorida, gerada automaticamente.

Para usar logos na sua instalação, coloque os arquivos em `public/indexers/` antes do build. Os nomes esperados estão em `INDEXER_LOGOS`, no arquivo `src/components/search/indexer-icon.tsx`, e novas fontes podem ser adicionadas ali. Sem o arquivo, a sigla continua aparecendo. Use imagens quadradas, de preferência a partir de 48 px.

## Segurança

**O que a aplicação protege**

- A API key fica somente no servidor e nunca aparece em páginas, respostas, logs ou no bundle.
- Links de download são trocados por tokens aleatórios, válidos por 30 minutos e presos ao IP de quem buscou.
- Não existe rota que aceite uma URL enviada pelo navegador. Só endereços do Prowlarr configurado são acessados.
- Redirecionamentos só são aceitos quando levam a um `magnet:`.
- Arquivos `.torrent` têm limite de 10 MB e passam por uma verificação de formato.
- Há limite de uso: 15 buscas novas e 60 ações por minuto, por aparelho.
- O container roda sem root, com sistema de arquivos somente leitura e sem capabilities.

**O que é responsabilidade sua**

- **Não há login.** Mantenha a aplicação na rede local, ou atrás de VPN ou de proxy autenticado.
- O `.env` contém a API key. Nunca o envie para um repositório.
- Ao abrir magnets, seu cliente de torrent se conecta a outros usuários e expõe seu IP a eles.

## Atualização

```bash
git pull
```

```bash
docker compose up -d --build
```

Nada precisa ser migrado, porque não há banco de dados. Reiniciar apenas limpa o cache e os tokens, e a interface pedirá uma nova busca.

## Solução de problemas

**"Prowlarr desconectado"**
O servidor da aplicação não alcança o Prowlarr, ou a chave está errada. Confira o `.env`, lembrando que `localhost` não funciona no Docker. Veja os logs com `docker compose logs app`.

**Nenhum resultado**
Confirme se o termo retorna algo na busca do próprio Prowlarr e se há indexadores habilitados.

**"Os resultados expiraram"**
O cache dura 3 minutos. Depois disso, a aplicação pede uma nova busca em vez de consultar os sites sem você pedir. Clique em **Tentar novamente**.

**A busca demora**
Ela leva o tempo da fonte mais lenta, com limite de 30 segundos. Indexadores atrás do FlareSolverr costumam ser os mais lentos. Identifique a fonte citada no aviso de resultados parciais e desative-a no Prowlarr, se for o caso.

**Uma fonte sempre aparece nos resultados parciais**
O Prowlarr suspende indexadores com falhas repetidas, às vezes por muitas horas. Veja o estado em **Indexers** no Prowlarr.

**O ímã não abre nada**
Instale um cliente de torrent e associe a ele os links magnet no sistema operacional. Na primeira vez, o navegador pode pedir confirmação.

**O ímã baixou um arquivo**
Acontece só quando o `.torrent` da fonte não pode ser lido para gerar o magnet. Abra o arquivo no cliente de torrent.

**"Este link expirou"**
Tokens duram 30 minutos e valem só no aparelho que fez a busca. Busque novamente.

**Copiar não funciona**
Navegadores podem bloquear a área de transferência fora de HTTPS. Use o botão de ímã ou acesse por HTTPS.

**Não consigo acessar de outro aparelho**
Por padrão, a porta só atende a própria máquina. Veja [Acesso pela rede](#acesso-pela-rede).

## Limites conhecidos

- **Interface em português do Brasil.** Traduções são bem-vindas.
- **Sem sinopse, capa ou comentários.** O Prowlarr não fornece esses dados, e o projeto não raspa páginas de sites.
- **Nomes de arquivos só em fontes com `.torrent`.** Em magnets, eles só existem depois que o cliente de torrent baixa os metadados.
- **Sem paginação real nos indexadores.** O Prowlarr devolve um conjunto limitado por fonte, e não há como pedir mais.
- **Estado em memória.** Cache e tokens são perdidos ao reiniciar, e o projeto foi feito para rodar em uma única instância.

## Desenvolvimento

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod e Vitest.

```bash
npm ci
```

Crie o `.env`, depois inicie em modo de desenvolvimento:

```bash
npm run dev
```

Verificações:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

Estrutura principal:

```text
src/
├── app/                  páginas e rotas da API
│   ├── api/              backend: health, indexers, search, results
│   └── resultado/        página de detalhes
├── components/
│   ├── result/           página de detalhes
│   ├── search/           busca, filtros, tabela e paginação
│   └── ui/               componentes base
├── hooks/                estado da URL, busca e preferências
└── lib/
    ├── actions/          tokens, magnet e leitura de .torrent
    ├── prowlarr/         cliente da API e normalização
    └── search/           parâmetros, cache, filtros e ordenação
tests/                    testes de rotas, regras e interface
```

As rotas da API estão documentadas em [API.md](API.md).
