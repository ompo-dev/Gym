export type LegalDocumentKind = 'terms' | 'privacy';

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDocument {
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}

const pt = {
  terms: {
    title: 'Termos de Serviço',
    effectiveDate: 'Vigente desde 21 de outubro de 2026',
    intro:
      'Estes Termos explicam as regras para usar o GymNotes, um app para registrar alimentação, treinos, metas, fotos, produtos, refeições salvas, exercícios salvos, rotinas e lembretes.',
    sections: [
      {
        title: 'Uso do app',
        body:
          'Você pode usar o GymNotes para anotar refeições, compras de alimentos, códigos de barras, fotos de comida e cardápios, treinos, progresso, peso e metas pessoais. Você é responsável pelas informações que insere e pelas decisões que toma com base nelas.',
      },
      {
        title: 'Saúde e nutrição',
        body:
          'O GymNotes oferece estimativas e organização pessoal. Ele não substitui médico, nutricionista, treinador, psicólogo ou outro profissional de saúde. Calorias, macros, hidratação, porções, exercícios e recomendações geradas por IA podem estar incompletos ou errados.',
      },
      {
        title: 'IA e provedores externos',
        body:
          'Recursos de IA podem enviar texto, fotos, descrições de mídia e contexto do seu perfil para o provedor configurado, como DeepSeek, Gemini, OpenAI ou Anthropic. Quando você usa sua própria chave, a cobrança, disponibilidade e uso de dados seguem também os termos do provedor escolhido.',
      },
      {
        title: 'Agentes e comunidade',
        body: 'Conectar um agente local permite consultar seu diário, geladeira, refeições salvas e metas. Criar notas exige a permissão de escrita. Mantenha a ponte em uma rede confiável e não exponha sua porta na internet. Logins, modelos, limites e cobranças seguem as regras dos provedores. Claude usa Anthropic Console, não a assinatura claude.ai. Roteiro, feedback e atualizações usam dados de demonstração, sem publicação externa.',
      },
      {
        title: 'Seu conteúdo',
        body:
          'Suas notas, fotos, refeições, treinos e ajustes continuam sendo seus. Você concede ao GymNotes apenas a permissão necessária para processar, exibir, salvar localmente e, quando solicitado, enviar esse conteúdo para gerar estimativas e respostas.',
      },
      {
        title: 'Uso aceitável',
        body:
          'Não use o app para violar leis, abusar de serviços de IA, tentar acessar sistemas sem autorização, enviar conteúdo ilegal ou usar automações que prejudiquem a estabilidade do serviço.',
      },
      {
        title: 'Serviços, assinaturas e disponibilidade',
        body:
          'Alguns recursos podem depender de assinatura, servidor, internet, câmera, galeria, notificações, chaves de API ou serviços de terceiros. Recursos podem mudar, ficar indisponíveis ou variar por plataforma.',
      },
      {
        title: 'Limitação de responsabilidade',
        body:
          'O GymNotes é fornecido no estado em que se encontra. Na extensão permitida por lei, não somos responsáveis por perdas indiretas, decisões de saúde, resultados físicos, falhas de provedores de IA, dados incorretos ou indisponibilidade temporária.',
      },
      {
        title: 'Alterações',
        body:
          'Podemos atualizar estes Termos para refletir mudanças no app, nas integrações, nas leis ou nos modelos de cobrança. A versão exibida no app é a referência mais recente.',
      },
      {
        title: 'Contato',
        body:
          'Para dúvidas sobre estes Termos, use o canal de suporte indicado na loja do aplicativo ou no próprio app quando disponível.',
      },
    ],
  },
  privacy: {
    title: 'Política de Privacidade',
    effectiveDate: 'Vigente desde 21 de outubro de 2026',
    intro:
      'Esta Política explica como o GymNotes trata dados usados para registrar alimentação, treinos, fotos, metas, preferências e recursos de IA.',
    sections: [
      {
        title: 'Dados que você cria',
        body:
          'O app pode armazenar notas de comida e treino, fotos anexadas, descrições de imagens, códigos de barras, refeições salvas, exercícios salvos, rotinas, geladeira, peso, metas, perfil de onboarding, idioma, tema, lembretes e preferências.',
      },
      {
        title: 'Fotos e imagens',
        body:
          'Quando você tira ou escolhe fotos de comida, cardápios ou produtos, o app pode converter a imagem para base64 para que a IA leia o conteúdo visível. Fotos de código de barras podem ser usadas para buscar dados do produto.',
      },
      {
        title: 'IA e chaves de API',
        body:
          'Se você usa a chave gerenciada do GymNotes, as chamadas passam pelo servidor do app para proteger a chave. Se você usa sua própria chave, o app pode chamar diretamente DeepSeek, Gemini, OpenAI ou Anthropic. Suas chaves ficam salvas nas configurações locais do app.',
      },
      {
        title: 'Dados enviados para processamento',
        body:
          'Para gerar estimativas, o app pode enviar ao provedor de IA o texto da nota, fotos selecionadas, descrições de mídia, contexto nutricional, restrições, objetivo, peso, altura, idade aproximada, idioma e dados da refeição atual quando você edita com IA.',
      },
      {
        title: 'Armazenamento',
        body:
          'A maior parte dos dados fica no seu aparelho, usando o armazenamento local do app. Dados enviados para IA ou serviços externos são tratados conforme as políticas desses provedores. Excluir os dados pelo app remove as informações locais deste aparelho.',
      },
      {
        title: 'Conexão local e feedback',
        body: 'A conexão com agentes é opcional e usa seu computador, sem backend hospedado do GymNotes. Ferramentas autorizadas recebem os dados solicitados. A análise por conta de agente envia o texto, contexto e imagens necessários ao provedor escolhido. Tokens de login permanecem no perfil isolado do agente no computador; o app salva apenas a seleção de modelo e esforço. Agentes podem manter credenciais e histórico conforme suas configurações. A chave de pareamento fica no armazenamento seguro do iOS/Android ou só na memória no web. A chave das ferramentas é separada e não controla contas. Conexões ws/HTTP locais não são criptografadas. Desconectar remove o acesso no app; pare a conexão no computador para revogar também clientes REST. Copiar diário e metas envia esses dados à área de transferência por sua ação. A comunidade usa mocks locais, sem consultas ou publicações externas; o rascunho fica no aparelho. Apagar dados locais não remove informações já recebidas por agentes ou provedores.',
      },
      {
        title: 'Compartilhamento',
        body:
          'Não vendemos seus dados pessoais. Compartilhamos dados apenas quando necessário para operar recursos que você usa, como IA, leitura de códigos de barras, notificações, diagnóstico técnico ou infraestrutura do app.',
      },
      {
        title: 'Segurança',
        body:
          'Usamos medidas razoáveis para reduzir acesso indevido, mas nenhum app, aparelho, rede ou provedor externo é completamente imune a falhas. Evite salvar informações extremamente sensíveis em notas livres.',
      },
      {
        title: 'Retenção e controle',
        body:
          'Você pode apagar dados locais pelo botão de exclusão nas configurações ou remover itens individualmente quando o recurso permitir. Backups do sistema operacional e dados mantidos por provedores externos seguem as regras desses serviços.',
      },
      {
        title: 'Crianças',
        body:
          'O GymNotes não é direcionado a crianças. Se você acredita que uma criança enviou dados pessoais sem autorização, entre em contato pelo canal de suporte.',
      },
      {
        title: 'Contato',
        body:
          'Para dúvidas sobre privacidade, use o canal de suporte indicado na loja do aplicativo ou no próprio app quando disponível.',
      },
    ],
  },
} satisfies Record<LegalDocumentKind, LegalDocument>;

const en = {
  terms: {
    title: 'Terms of Service',
    effectiveDate: 'Effective October 21, 2026',
    intro:
      'These Terms explain the rules for using GymNotes, an app for logging food, workouts, goals, photos, products, saved meals, saved exercises, routines, and reminders.',
    sections: [
      {
        title: 'Using the app',
        body:
          'You may use GymNotes to log meals, grocery purchases, barcodes, food and menu photos, workouts, progress, weight, and personal goals. You are responsible for the information you enter and the decisions you make from it.',
      },
      {
        title: 'Health and nutrition',
        body:
          'GymNotes provides estimates and personal organization. It does not replace a doctor, dietitian, trainer, therapist, or other health professional. Calories, macros, hydration, portions, exercises, and AI-generated suggestions can be incomplete or wrong.',
      },
      {
        title: 'AI and external providers',
        body:
          'AI features may send text, photos, media descriptions, and profile context to the configured provider, such as DeepSeek, Gemini, OpenAI, or Anthropic. If you use your own key, billing, availability, and data use are also governed by that provider.',
      },
      {
        title: 'Agents and community',
        body: 'Pairing a local agent allows it to read your diary, pantry, saved meals and goals. Creating notes requires write permission. Keep the connection on a trusted network and do not expose its port to the internet. Sign-in, models, limits and billing follow provider rules. Claude uses Anthropic Console, not claude.ai subscriptions. Roadmap, feedback and updates use demo data without external publication.',
      },
      {
        title: 'Your content',
        body:
          'Your notes, photos, meals, workouts, and settings remain yours. You grant GymNotes only the permission needed to process, display, store locally, and, when requested, send that content to generate estimates and responses.',
      },
      {
        title: 'Acceptable use',
        body:
          'Do not use the app to break the law, abuse AI services, access systems without authorization, submit illegal content, or run automations that harm service stability.',
      },
      {
        title: 'Services, subscriptions, and availability',
        body:
          'Some features may depend on a subscription, server, internet connection, camera, media library, notifications, API keys, or third-party services. Features may change, become unavailable, or vary by platform.',
      },
      {
        title: 'Limitation of liability',
        body:
          'GymNotes is provided as is. To the extent permitted by law, we are not responsible for indirect losses, health decisions, fitness outcomes, AI provider failures, incorrect data, or temporary unavailability.',
      },
      {
        title: 'Changes',
        body:
          'We may update these Terms to reflect changes in the app, integrations, laws, or billing models. The version shown in the app is the latest reference.',
      },
      {
        title: 'Contact',
        body:
          'For questions about these Terms, use the support channel listed in the app store or inside the app when available.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    effectiveDate: 'Effective October 21, 2026',
    intro:
      'This Policy explains how GymNotes handles data used to log food, workouts, photos, goals, preferences, and AI features.',
    sections: [
      {
        title: 'Data you create',
        body:
          'The app may store food and workout notes, attached photos, image descriptions, barcodes, saved meals, saved exercises, routines, pantry items, weight, goals, onboarding profile, language, theme, reminders, and preferences.',
      },
      {
        title: 'Photos and images',
        body:
          'When you take or choose photos of food, menus, or products, the app may convert the image to base64 so AI can read the visible content. Barcode photos may be used to look up product data.',
      },
      {
        title: 'AI and API keys',
        body:
          'If you use the managed GymNotes key, requests go through the app server to protect that key. If you use your own key, the app may call DeepSeek, Gemini, OpenAI, or Anthropic directly. Your keys are stored in local app settings.',
      },
      {
        title: 'Data sent for processing',
        body:
          'To generate estimates, the app may send the AI provider note text, selected photos, media descriptions, nutrition context, restrictions, goal, weight, height, approximate age, language, and current meal data when you edit with AI.',
      },
      {
        title: 'Storage',
        body:
          'Most data stays on your device in local app storage. Data sent to AI or external services is handled under those providers policies. Deleting data in the app removes local information from this device.',
      },
      {
        title: 'Local connection and feedback',
        body: 'Agent connections are optional and use your computer, not a hosted GymNotes backend. Authorized tools receive the requested data. Agent account analysis sends required text, context and images to your selected provider. Login tokens remain in an isolated agent profile on the computer; the app saves only model and effort selections. Agents may retain credentials and history according to their settings. The pairing key stays in iOS/Android secure storage or web session memory. The separate tools key cannot control accounts. Local ws/HTTP connections are unencrypted. Disconnecting removes app access; stop the computer connection to revoke REST clients too. Copying your diary and goals places them on the clipboard at your request. Community views use local mocks without external requests or publication; drafts stay on the device. Deleting local data does not remove information already received by agents or providers.',
      },
      {
        title: 'Sharing',
        body:
          'We do not sell your personal data. We share data only as needed to operate features you use, such as AI, barcode lookup, notifications, technical diagnostics, or app infrastructure.',
      },
      {
        title: 'Security',
        body:
          'We use reasonable measures to reduce improper access, but no app, device, network, or external provider is completely immune to failure. Avoid saving extremely sensitive information in free-form notes.',
      },
      {
        title: 'Retention and control',
        body:
          'You can erase local data with the delete button in settings or remove individual items where the feature allows it. Operating system backups and data kept by external providers follow those services rules.',
      },
      {
        title: 'Children',
        body:
          'GymNotes is not directed to children. If you believe a child submitted personal data without authorization, contact us through the support channel.',
      },
      {
        title: 'Contact',
        body:
          'For privacy questions, use the support channel listed in the app store or inside the app when available.',
      },
    ],
  },
} satisfies Record<LegalDocumentKind, LegalDocument>;

export function getLegalDocument(kind: LegalDocumentKind, locale: string): LegalDocument {
  return locale.toLowerCase().startsWith('en') ? en[kind] : pt[kind];
}
