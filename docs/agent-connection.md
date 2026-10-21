# Conectar agentes ao GymNotes

Nao ha um backend hospedado para esta integracao. O app mantem uma conexao
WebSocket de saida com uma ponte Node.js no computador do usuario. A ponte
oferece REST local; o adaptador MCP stdio usa o SDK oficial do protocolo.
A ponte nao grava o diario nem recebe tokens de login. Os agentes podem manter
credenciais e historico em seus perfis locais isolados, sujeitos ao provedor.

## Parear

1. Instale o build nativo 1.0.2 ou mais recente, ou abra o app web local.
2. Em Ajustes > Conectar GymNotes > Ver instrucoes, crie uma chave e copie-a.
3. No computador, dentro deste repositorio, execute `npm ci` e
   `npm run connect -- --lan`. Cole a chave quando solicitado.
4. Preencha no app um dos enderecos `ws://IP_DO_COMPUTADOR:3847/app` exibidos.
5. Conecte. Somente leitura e o padrao; para criar notas, ative a permissao e
   conecte novamente. A mudanca vale depois de reconectar, nao antes.

Sem `--lan`, a ponte escuta somente em `127.0.0.1`, adequado ao app web no
mesmo computador. Na rede, autorize apenas rede privada no firewall. Nao use
encaminhamento de porta nem exponha a ponte na internet. `ws` e HTTP local
nao criptografam os dados: use apenas uma rede confiavel. O validador do app
aceita somente IPs privados/loopback, sem credenciais na URL nem redirecionamentos.

O app precisa estar aberto, apos onboarding. Ao entrar em segundo plano,
sair da conta ou apagar os dados, a sessao fecha. Desconectar apaga a chave
salva no app; pare a ponte e use uma nova chave para revogar tambem o acesso
REST de outros clientes. No iOS/Android, a credencial fica no SecureStore;
no web, somente na memoria da sessao. Chaves de IA sao independentes.

## MCP local

Mantenha a ponte acima aberta. Em um cliente MCP stdio, configure:

```json
{
  "mcpServers": {
    "gymnotes": {
      "command": "node",
      "args": ["C:/CAMINHO/Gym/scripts/gymnotes-connect.mjs", "--mcp"],
      "env": {
        "GYMNOTES_CONNECT_TOKEN": "CHAVE_DAS_FERRAMENTAS_DE_64_CARACTERES",
        "GYMNOTES_CONNECT_URL": "http://127.0.0.1:3847"
      }
    }
  }
}
```

Copie a chave das ferramentas em Detalhes da integracao. Ela e diferente da
chave de pareamento e nao permite controlar contas ou gerar respostas pagas.
Substitua caminho e chave. Nao versione configuracoes que contenham chaves.
Claude Desktop, Claude Code, Codex e Gemini CLI podem usar o adaptador local;
o formato de configuracao varia por cliente. Clientes que so aceitam MCP remoto
na nuvem nao alcancam esta ponte local. ChatGPT/Claude web podem receber o
diario e metas pelo botao de copiar, sem fotos ou credenciais; isso e uma
transferencia manual, nao uma conexao MCP remota.

## REST

Autenticacao: `Authorization: Bearer CHAVE_DAS_FERRAMENTAS`.

- `GET /api/v1/tools`: conexao ativa e schemas efetivamente permitidos.
- `POST /api/v1/call`: `{ "name": "readDay", "arguments": { "domain": "food" } }`.
- Ferramentas: `readGoals`, `readDay`, `readExerciseHistory`, `readSavedMeals`,
  `readPantry` e, quando autorizado, `addEntries`.
- `addEntries` passa pela validacao, enriquecimento e desfazer do proprio app.
  O retorno confirma o registro, nao o termino da IA. Consulte o diario depois.
- Planos nao marcados aparecem identificados no diario mas nao nos totais.
- `requestId` opcional permite repetir uma chamada com o mesmo ID sem duplicar
  a escrita entre as ultimas 100 chamadas da sessao do app. Nao repita automaticamente apos
  timeout/desconexao: a primeira escrita pode ter acontecido.
- Payloads, tempo de resposta, sessoes e chamadas pendentes sao limitados.
  O app e a ponte validam as chamadas independentemente.

## Contas, modelos e esforco

Na mesma tela de conexao, selecione Codex/ChatGPT, Claude/Claude Code ou Gemini
e carregue a conta. O computador instala os adaptadores ACP fixados em
`scripts/agent-runtime.mjs` via npm. O navegador do computador conduz o login;
o app nunca recebe credenciais OAuth. Modelos e opcoes de esforco sao os
anunciados pelo agente, nao listas fixas do GymNotes. Salve a escolha para
texto e/ou imagens. Um agente sem suporte a imagem nao pode analisar fotos.

Codex usa a conta ChatGPT; Gemini CLI usa o login Google. Claude oferece apenas
Anthropic Console (cobranca por uso): nao reutilize assinatura claude.ai em
integracao de terceiros sem autorizacao da Anthropic. Limites e cobrancas do
provedor continuam valendo. Chaves de API continuam uma alternativa na mesma tela.

O telefone depende do computador ligado e conectado. Nao ha login de agente
executado autonomamente no iOS/Android. Perfis ficam em `~/.gymnotes/agents/`,
separados dos perfis existentes do usuario. Nao copie nem versione essa pasta.
As chamadas usam sessoes novas, sem MCP adicional, com permissoes de ferramentas
recusadas; apenas JSON validado pelo app produz resultados. Uma chamada
interrompida nao e repetida automaticamente, pois pode ter sido cobrada.

## Comunidade (mock)

Atualizacoes, roteiro e feedback usam dados locais de demonstracao. Votar,
comentar e adicionar um feedback altera apenas esta sessao. A tela identifica
a demonstracao; nada e publicado, nao ha consulta ao GitHub nem autenticacao.
O rascunho do formulario fica somente no aparelho.

## Validacao

`npm test -- --runInBand`, `npm run test:ota`, `npm run typecheck`, `npm run lint`.
Os testes Node cobrem REST/WebSocket e uma sessao MCP stdio real, com um app
simulado. O hardware iOS/Android ainda precisa validar permissao de rede local,
firewall e comportamento ao suspender o app.

## Referencias

- https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- https://code.claude.com/docs/en/mcp
- https://geminicli.com/docs/tools/mcp-server/
- https://modelcontextprotocol.io/docs/develop/build-server
