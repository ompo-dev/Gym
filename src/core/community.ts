export type FeedbackCategory = 'feature' | 'bug' | 'other';
export type FeedbackStatus = 'pending' | 'planned' | 'progress' | 'done';
export interface CommunityComment {
  id: number; body: string; created_at: string; user: { login: string };
}
export interface CommunityIssue {
  number: number; title: string; body: string; created_at: string; user: { login: string };
  category: FeedbackCategory; status: FeedbackStatus; comments: number; votes: number; voted: boolean;
}

export function issueCategory(issue: CommunityIssue): FeedbackCategory {
  return issue.category;
}

export function issueStatus(issue: CommunityIssue): FeedbackStatus {
  return issue.status;
}

// Demo data stays in this session. No remote service, account or diary access.
const fixtures: Omit<CommunityIssue, 'voted'>[] = [
  { number: 1, title: 'Sugestões para o restante do dia', body: 'Sugerir refeições com o que falta para bater minhas metas, aproveitando os alimentos da geladeira.', category: 'feature', status: 'progress', votes: 32, comments: 2, user: { login: 'Marina' }, created_at: '2026-10-20T14:00:00Z' },
  { number: 2, title: 'Reorganizar refeições por horário', body: 'Quero mover os registros entre café da manhã, almoço, lanche e jantar sem precisar apagar e criar de novo.', category: 'feature', status: 'planned', votes: 19, comments: 1, user: { login: 'Rafael' }, created_at: '2026-10-19T12:00:00Z' },
  { number: 3, title: 'Aviso quando a análise da foto terminar', body: 'Seria ótimo receber um aviso quando todos os alimentos da foto estiverem prontos para revisar.', category: 'feature', status: 'planned', votes: 18, comments: 0, user: { login: 'Camila' }, created_at: '2026-10-18T10:00:00Z' },
  { number: 4, title: 'Texto cortado em refeições com nomes longos', body: 'Em uma refeição planejada, o começo da linha fica muito perto do botão de concluir.', category: 'bug', status: 'done', votes: 15, comments: 1, user: { login: 'Lucas' }, created_at: '2026-10-17T16:00:00Z' },
  { number: 5, title: 'Resumo semanal de treino e alimentação', body: 'Um resumo com a evolução das metas e dos treinos ao longo da semana.', category: 'feature', status: 'pending', votes: 12, comments: 0, user: { login: 'Beatriz' }, created_at: '2026-10-16T09:00:00Z' },
  { number: 6, title: 'Mais opções para personalizar os indicadores', body: 'Gostaria de escolher quais nutrientes aparecem primeiro na barra de metas.', category: 'other', status: 'pending', votes: 8, comments: 0, user: { login: 'Pedro' }, created_at: '2026-10-15T13:00:00Z' },
];
let issues: CommunityIssue[] = fixtures.map((issue) => ({ ...issue, voted: false }));
const comments = new Map<number, CommunityComment[]>([
  [1, [
    { id: 1, user: { login: 'Tiago' }, body: 'Seria útil poder deixar o jantar livre também.', created_at: '2026-10-20T15:00:00Z' },
    { id: 2, user: { login: 'GymNotes' }, body: 'A ideia é respeitar as metas e o número de refeições escolhido.', created_at: '2026-10-20T16:00:00Z' },
  ]],
  [2, [{ id: 3, user: { login: 'Ana' }, body: 'Arrastar as refeições entre os horários seria ótimo.', created_at: '2026-10-19T15:00:00Z' }]],
  [4, [{ id: 4, user: { login: 'GymNotes' }, body: 'O espaçamento foi ajustado na demonstração.', created_at: '2026-10-18T15:00:00Z' }]],
]);
export async function loadCommunityIssues(): Promise<CommunityIssue[]> {
  return issues.map((issue) => ({ ...issue, user: { ...issue.user } }));
}
export async function loadCommunityComments(number: number): Promise<CommunityComment[]> {
  return (comments.get(number) ?? []).map((comment) => ({ ...comment, user: { ...comment.user } }));
}
export function toggleCommunityVote(number: number): CommunityIssue {
  const issue = issues.find((item) => item.number === number);
  if (!issue) throw new Error('community.unavailable');
  issue.votes += issue.voted ? -1 : 1;
  issue.voted = !issue.voted;
  return { ...issue };
}
export function addCommunityFeedback(title: string, body: string, category: FeedbackCategory): CommunityIssue {
  if (!title.trim() || !body.trim() || !['feature', 'bug', 'other'].includes(category)) throw new Error('community.invalid');
  const issue: CommunityIssue = { number: Math.max(...issues.map((item) => item.number)) + 1,
    title: title.trim().slice(0, 120), body: body.trim().slice(0, 1800), category,
    user: { login: 'Você' }, status: 'pending', votes: 1, voted: true, comments: 0, created_at: new Date().toISOString() };
  issues = [issue, ...issues];
  return { ...issue };
}
export function addCommunityComment(number: number, body: string): CommunityComment {
  const issue = issues.find((item) => item.number === number);
  if (!issue || !body.trim()) throw new Error('community.invalid');
  const comment = { id: Date.now(), body: body.trim().slice(0, 1800), user: { login: 'Você' }, created_at: new Date().toISOString() };
  comments.set(number, [...(comments.get(number) ?? []), comment]);
  issue.comments += 1;
  return { ...comment };
}

export const CHANGELOG = [
  { version: '1.0.2', date: '2026-10-21',
    pt: { title: 'Planos que acompanham o seu dia', details: [
      'Refeições planejadas entram nos macros apenas depois de marcadas. Desmarcar desfaz o consumo, inclusive nos widgets e na geladeira.',
      'Ingredientes das receitas agora podem ser marcados e desmarcados, com a escolha salva.',
      'Conexão local unificada para agentes, API e MCP, com permissão de leitura ou criação de notas.',
      'Prévia de novidades, roteiro e feedback com dados de demonstração.',
    ] },
    en: { title: 'Plans that follow your day', details: [
      'Planned meals count toward macros only after being checked. Unchecking reverses consumption, including widgets and pantry.',
      'Recipe ingredients can now be checked and unchecked, with saved choices.',
      'Local agent, API and MCP connection with a separate key and read or note creation permission.',
      'Updates, roadmap and feedback preview with demo data.',
    ] } },
  { version: '1.0.1', date: '2026-10-20',
    pt: { title: 'Atualizações e distribuição', details: [
      'Verificação e download OTA com tela de progresso, nova tentativa e opção de continuar no app.',
      'Publicação automática de builds iOS e Android, com verificações e testes antes da distribuição.',
    ] },
    en: { title: 'Updates and distribution', details: [
      'OTA checking and downloading with progress screen, retry and continue option.',
      'Automated iOS and Android builds with checks and tests before distribution.',
    ] } },
  { version: '1.0.0', date: '2026-09-13',
    pt: { title: 'Alimentação, fotos e receitas', details: [
      'Pedidos combinados para planejar refeições, montar receitas e registrar compras usando as metas e a geladeira.',
      'Revisão de fotos com recortes individuais dos alimentos, seleção e confirmação antes de registrar.',
      'Provedores de IA configuráveis, com Gemini para imagens, e termos e privacidade dentro do app.',
    ] },
    en: { title: 'Food, photos and recipes', details: [
      'Combined requests to plan meals, make recipes and log purchases using goals and pantry.',
      'Photo review with individual food cutouts, selection and confirmation before logging.',
      'Configurable AI providers, including Gemini for images, and in-app legal documents.',
    ] } },
] as const;
