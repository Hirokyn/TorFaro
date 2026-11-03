# Política de segurança

## Versões com suporte

Somente a versão mais recente da branch `main` recebe correções de segurança.

## Como relatar uma falha

**Não abra uma issue pública com detalhes de uma vulnerabilidade.**

1. Na aba [Security](https://github.com/Hirokyn/TorFaro/security), use **Report a vulnerability**, se a opção estiver disponível.
2. Se não estiver, abra uma issue pedindo um contato privado, sem descrever a falha.

Inclua o que for possível: versão ou commit, passos para reproduzir e impacto esperado. **Não envie sua API key nem endereços da sua rede.**

O projeto é mantido de forma voluntária, então não há prazo garantido de resposta, mas todo relato será avaliado.

## O que é uma falha de segurança aqui

- API key do Prowlarr, ou URLs que a contenham, chegando ao navegador, a respostas da API ou a logs
- Uma rota que aceite URL do cliente e faça o servidor acessar outro endereço
- Uso de um token de ação por outro aparelho
- Injeção de código em títulos ou outros dados vindos dos indexadores

## O que não é falha

- **Falta de login.** É uma decisão de projeto: a aplicação não tem autenticação e não deve ficar exposta na internet. Veja [Acesso pela rede](docs/MANUAL.md#acesso-pela-rede).
- Conteúdo devolvido pelos indexadores. O TorFaro apenas exibe o que o Prowlarr informa.
- Falhas no Prowlarr, no FlareSolverr ou em clientes de torrent. Relate-as aos respectivos projetos.

## Recomendações para quem instala

- Mantenha a aplicação na rede local, atrás de VPN ou de um proxy com autenticação.
- Nunca publique o seu `.env`.
- Mantenha o Docker, a imagem e o Prowlarr atualizados.
