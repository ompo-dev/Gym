# Conectar agentes ao GymNotes

Nao ha um backend hospedado para esta integracao. O app mantem uma conexao
WebSocket de saida com uma ponte Node.js no computador do usuario. A ponte
oferece REST local; o adaptador MCP stdio usa o SDK oficial do protocolo.
A ponte nao grava o diario nem recebe tokens de login. Os agentes podem manter
credenciais e historico em seus perfis locais isolados, sujeitos ao provedor.

## Parear

1. Instale o build nativo 1.0.2 ou mais recente, ou abra o app web local.
2. Em Ajustes > Conectar GymNotes > Ver instrucoes, escolha o agente e toque
   em **Copiar prompt de conexao**. Envie o prompt a um agente no computador.
3. O prompt ja contem o pareamento, a chave separada das ferramentas, o repositorio
   e o formato do cliente. O agente resolve o caminho absoluto e inicia a ponte,
   sem exigir que o usuario edite chaves, comandos ou arquivos de configuracao.
4. No web do mesmo computador, o app ja tenta conectar ao localhost. No telefone,
   copie a linha `gymnotes-connect:v1:...` devolvida pelo agente e toque em
   **Colar conexao do agente**. O codigo publico tem apenas endereco e fingerprint;
   o app confere o pareamento e preserva a chave e as permissoes locais.
5. Somente leitura e o padrao. Ativar **Permitir criar notas** reaplica a conexao
   com a nova permissao. Desativar revoga as escritas na sessao anterior.

O prompt contem uma credencial de pareamento local. Envie somente ao agente
confiavel que vai executar a ponte, nao publique nem versione o texto.
Endereco e chave manuais continuam disponiveis em **Detalhes da integracao**.
Para configurar manualmente, execute `npm ci`, depois `npm run connect -- --lan`
e cole a chave quando solicitado. O processo da ponte tambem aceita
`GYMNOTES_PAIRING_TOKEN`; clientes MCP continuam usando apenas a chave derivada
em `GYMNOTES_CONNECT_TOKEN`. Variaveis de pareamento nao chegam aos processos de IA.

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
na nuvem nao alcancam esta ponte local. O prompt explica quando e necessario
um agente com execucao no computador, sem fingir uma conexao MCP remota.

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
e toque em **Entrar com**. Se o computador ainda nao estiver pareado, esse botao
copia o prompt pronto e aguarda a conexao; o login continua assim que ela chega.
Cancelar ou fechar o modal cancela essa espera. O computador instala os adaptadores ACP fixados em
`scripts/agent-runtime.mjs` via npm. O navegador do computador conduz o login;
o app nunca recebe credenciais OAuth. Modelos e opcoes de esforco sao os
anunciados pelo agente, nao listas fixas do GymNotes. Agentes com o catalogo legado
`availableModels` usam `session/set_model`; agentes modernos usam `configOptions`,
incluindo esforco e demais opcoes disponiveis. Salve a escolha para
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

## Atualizacoes no Developer Mode

A primeira secao de Developer Mode tem **Buscar atualizacoes**, o estado da
verificacao/download, a preferencia automatica, versao, runtime, canal e ID OTA.
O botao manual verifica mesmo com a preferencia automatica desligada. Download
nao reinicia sozinho: **Aplicar atualizacao e reiniciar** aparece apos sucesso.
Web, Expo Go e builds de desenvolvimento mostram a indisponibilidade de OTA;
runtime incompativel pede um novo IPA/APK, sem instalar um bundle incompativel.

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
