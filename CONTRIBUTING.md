# Como contribuir

Obrigado por querer ajudar o TorFaro. Correções, traduções, testes e melhorias na documentação são todos bem-vindos.

## Antes de começar

- **Bugs e ideias:** abra uma [issue](https://github.com/Hirokyn/TorFaro/issues/new/choose). Procure antes se o assunto já foi tratado.
- **Mudanças grandes:** combine na issue antes de programar, para evitar trabalho que não será aceito.
- **Falhas de segurança:** siga a [política de segurança](SECURITY.md) e não as publique em uma issue.

## Preparando o ambiente

Você precisa de Node.js 24 e de um Prowlarr de teste.

```bash
git clone https://github.com/Hirokyn/TorFaro.git
```

```bash
cd TorFaro
```

```bash
npm ci
```

```bash
cp .env.example .env
```

Preencha o `.env` e inicie:

```bash
npm run dev
```

## Antes de abrir um pull request

Rode as verificações, que também são executadas no CI:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

Inclua testes para mudanças de comportamento e atualize o [manual](docs/MANUAL.md) se algo mudar para quem usa.

## Regras do projeto

Estes limites definem o que o TorFaro é. Um pull request que os quebre não será aceito:

1. **O Prowlarr é somente leitura.** A aplicação não altera indexadores nem configurações.
2. **A API key fica no servidor.** Ela, as URLs brutas de download e as respostas brutas do Prowlarr nunca chegam ao navegador.
3. **Sem acesso direto aos sites.** Nada de scraping nem requisições a sites de torrent. Tudo passa pelo Prowlarr.
4. **Sem proxy genérico.** Nenhuma rota pode aceitar uma URL enviada pelo cliente.
5. **Busca só por ação do usuário.** Ordenar, filtrar ou trocar de página não consulta os indexadores.
6. **Entradas validadas.** As rotas da API validam parâmetros com Zod e devolvem contratos próprios.
7. **Componentes pequenos.** Prefira peças simples e reutilizáveis.

## Mensagens de commit

Use o formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/), como `feat: adiciona filtro por idioma` ou `fix: corrige paginação com um resultado`.

## Dados sensíveis

Nunca inclua em issues, logs ou capturas de tela a sua API key, o endereço da sua rede ou informações pessoais.

## Licença

Ao contribuir, você concorda que sua contribuição será distribuída sob a [licença MIT](LICENSE).
