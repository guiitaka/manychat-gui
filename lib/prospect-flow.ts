// Fluxo de prospecção ativa (DM de abertura enviada pelo Gui -> bot qualifica em
// 3 passos -> handoff para o WhatsApp). Sem imports de runtime de propósito:
// roda isolado nos testes (scripts/test-prospect-flow.ts).
//
// Regra de ouro: o bot SÓ conversa com quem está na tabela `prospects`
// (lista de abordados). Quem não está nela nunca recebe resposta daqui.

export type ProspectStatus = "abordado" | "em_conversa" | "nutricao" | "handoff" | "opt_out";

// Etapas do apple_leads (CRM do OpenBot), para onde cada transição é espelhada.
export type CrmEtapa = "novo" | "em_conversa" | "proposta" | "negociando" | "ganho" | "perdido";

export type Answers = {
  modelo_atual?: string;
  interesse?: "quente" | "morno";
  modelo_desejado?: string;
  perguntou_modelo?: boolean;
  preferencia?: "lacrado" | "seminovo";
  ultima_msg?: string;
  nos?: number; // "não" soltos seguidos (ambíguo: pode ser resposta, não pedido para parar)
};

export type Prospect = {
  id: string;
  username: string;
  ig_id: string | null;
  step: number; // 0 abordado · 1 sondagem · 2 modelo desejado · 3 lacrado/seminovo
  status: ProspectStatus;
  tags: string[];
  answers: Answers;
  paused_until: string | null;
  handoff_count: number;
  last_mid: string;
};

export type QuickReply = { title: string; payload: string };

export type BotMessage =
  | { kind: "text"; text: string; quick_replies?: QuickReply[] }
  | { kind: "wa"; text: string; url: string; button: string };

export type Transition = {
  etapa: CrmEtapa;
  tags: string[];
  note: string;
  followup_days?: number;
};

export type Patch = {
  step?: number;
  status?: ProspectStatus;
  paused_until?: string | null;
  handoff_count?: number;
  add_tags: string[];
  answers: Partial<Answers>;
};

export type Outcome =
  | "engaged"
  | "advanced"
  | "nutricao"
  | "handoff"
  | "renotify"
  | "opt_out"
  | "silent_terminal"
  | "silent_paused"
  | "silent_ambiguous"
  | "silent_nontext"
  | "silent_nutricao";

export type Decision = {
  outcome: Outcome;
  patch: Patch;
  messages: BotMessage[];
  transition: Transition | null;
  notify: boolean;
};

export type TurnInput = {
  text: string; // texto cru da mensagem ("" se só anexo)
  quickPayload?: string; // payload do botão tocado, se houver
  now: Date;
  waNumber: string | null; // só dígitos; null = não configurado
};

export const PAUSE_HOURS = 24;
export const BOT_REPLY_DELAY_MIN = 1; // pequena pausa: parece gente, não SAC

// ------------------------------------------------------------
// Textos (tom de WhatsApp, sem preço, sem hard-sell)
// ------------------------------------------------------------
export const TEXT = {
  passo1:
    "Boa demais! Pergunto porque direto o pessoal me chama na dúvida se vale a pena dar upgrade agora ou se compensa segurar mais um pouco.\nO seu ainda tá te atendendo 100% de bateria e espaço, ou você já tá começando a namorar algum modelo novo?",
  passo2a:
    "Te entendo! Quando a bateria já tá abaixo dos 80% de saúde ou a memória enche, vira estresse diário.\nVocê já tem algum modelo em mente ou quer que eu te indique o melhor custo-benefício pro seu dia a dia?",
  passo2aPerguntaModelo: "Show! Qual modelo (e capacidade, se já souber) você tá de olho?",
  passo2b:
    "Excelente! Aparelho bem cuidado dura anos mesmo. Qualquer dúvida, ou se bater a vontade de trocar, é só me chamar por aqui 😉",
  passo3:
    "Fechou! E me conta: você costuma preferir aparelho novo lacrado de fábrica com garantia de 1 ano da Apple, ou costuma pegar seminovo?",
  handoff:
    "Show de bola! Vou puxar as cotações atualizadas de hoje dos lacrados com 1 ano de garantia Apple. Como consigo te responder mais rápido com áudio e fotos das opções, me dá um alô no WhatsApp por aqui 👇",
  handoffSeminovo:
    "Entendo! Só deixo claro que eu trabalho só com aparelho novo e lacrado (nota fiscal + 1 ano de garantia Apple). ",
  handoffSemNumero: "Show! Já já eu mesmo te respondo por aqui com as opções 🙂",
  optOut: "Tranquilo, sem problema! Se mudar de ideia é só chamar. Valeu pela atenção 🍎",
} as const;

export const QR = {
  passo1: [
    { title: "Namorando um novo", payload: "PF:S1:novo" },
    { title: "Bateria/espaço 🔋", payload: "PF:S1:dor" },
    { title: "Tá me atendendo ✅", payload: "PF:S1:ok" },
  ],
  passo2: [
    { title: "Já sei o que quero", payload: "PF:S2:sei" },
    { title: "Quero recomendação", payload: "PF:S2:rec" },
  ],
  passo3: [
    { title: "Prefiro lacrado", payload: "PF:S3:lacrado" },
    { title: "Seminovo mesmo", payload: "PF:S3:seminovo" },
  ],
} as const;

// ------------------------------------------------------------
// Classificação por palavras (sem IA externa; conservadora de propósito)
// ------------------------------------------------------------
export function normalize(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pedido claro para parar. "para" sozinho NÃO conta no meio da frase
// ("preciso pra/para o trabalho"): só a mensagem inteira ou "para de me …".
const OPT_OUT_WHOLE = /^(para|pare|parar|stop|chega|sair|cancelar|nao obrigad[oa]|nao valeu|sem interesse)$/;
const OPT_OUT_PHRASE =
  /\b(sem interesse|nao tenho (mais )?interesse|nao quero (mais|receber|comprar|nada|trocar|isso)|nao me (chame|chama|mande|manda|envie|envia|procure)|me (tira|tire|remove|remova|exclui|exclua|deixa em paz|deixe em paz)|(para|pare) de (me )?(mandar|enviar|chamar|falar|insistir)|pode parar|descadastr\w*)\b/;

// "não" solto: pode ser resposta ("bateria aguenta?" -> "não"). Não encerra na
// 1ª vez; 2 seguidos encerram.
const BARE_NO = /^(nao|n|nope)$/;

// "agora não / depois": não é opt-out, é "mais tarde" -> nutrição, sem resposta.
const SOFT_DECLINE = /^(agora nao|por enquanto nao|depois|mais tarde|outra hora|quem sabe depois)$/;

// Pediu preço / quer comprar / pergunta de confiança (pagamento, entrega, NF, garantia).
const HANDOFF_INTENT =
  /\b(preco|precos|valor|valores|quanto (custa|fica|sai|e|ta|tao|vai|pago)|custa|custando|cotacao|orcamento|parcel\w*|pix|a vista|boleto|cartao|quero (comprar|trocar|fechar)|vou comprar|vamos fechar|fechar|comprar|compro|estoque|disponivel|pronta entrega|nota fiscal|nf|garantia|entrega|entregam|frete|enviam|aceita|desconto|promocao|black friday)\b/;

const NEG = /\b(nao|ruim|osso|pessim\w*|lent[ao]|trava\w*|cheio|cheia|acabando|morre|descarrega\w*)\b/;
const DOR = /\b(bateria|memoria|armazenamento|espaco|cheio|cheia|lent[ao]|travando|trava|esquentando|esquenta|quebrad\w*|rachad\w*|tela|osso|ruim|pessim\w*|acabando|morre|descarrega\w*)\b/;
const NOVO = /\b(namorando|namoro|novo|nova|trocar|troca|upgrade|pensando|querendo|olhando|18|17|16|15|pro|max|duo)\b/;
const OK = /\b(bem|ok|otimo|otima|tranquilo|tranquila|de boa|atende|atendendo|perfeito|perfeita|suave|funcionando|joia)\b/;
const SEMINOVO = /\b(seminov\w*|usad\w*|barat\w*|recondicionad\w*)\b/;

export function isOptOut(text: string): boolean {
  const n = normalize(text);
  return OPT_OUT_WHOLE.test(n) || OPT_OUT_PHRASE.test(n);
}
export const isBareNo = (text: string) => BARE_NO.test(normalize(text));
export const isHandoffIntent = (text: string) => HANDOFF_INTENT.test(normalize(text));

type Step1Path = "quente" | "morno" | "satisfeito";
export function classifyStep1(text: string, payload?: string): Step1Path {
  if (payload === "PF:S1:dor") return "quente";
  if (payload === "PF:S1:novo") return "morno";
  if (payload === "PF:S1:ok") return "satisfeito";
  const n = normalize(text);
  if (OK.test(n) && !NEG.test(n) && !NOVO.test(n)) return "satisfeito";
  if (DOR.test(n) || NEG.test(n)) return "quente";
  if (NOVO.test(n)) return "morno";
  if (OK.test(n)) return "satisfeito";
  return "morno"; // respondeu algo que não dá para classificar: segue a conversa
}

export function classifyStep3(text: string, payload?: string): "lacrado" | "seminovo" {
  if (payload === "PF:S3:seminovo") return "seminovo";
  if (payload === "PF:S3:lacrado") return "lacrado";
  return SEMINOVO.test(normalize(text)) ? "seminovo" : "lacrado";
}

const clean = (s: string, max: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, max);

// ------------------------------------------------------------
// Link wa.me com texto pré-preenchido (aparelho atual + modelo desejado)
// ------------------------------------------------------------
export function buildWaUrl(waNumber: string, a: Answers): string {
  const atual = clean(a.modelo_atual || "", 60);
  const desejado = clean(a.modelo_desejado || "", 60);
  let msg = "Fala Gui, vim do Insta!";
  if (atual) msg += ` Aparelho atual: ${atual}.`;
  msg += desejado ? ` Quero ver opções de: ${desejado}.` : " Queria ver as opções.";
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
}

function handoffMessages(waNumber: string | null, answers: Answers, seminovo: boolean): BotMessage[] {
  if (!waNumber) return [{ kind: "text", text: TEXT.handoffSemNumero }];
  return [
    {
      kind: "wa",
      text: (seminovo ? TEXT.handoffSeminovo : "") + TEXT.handoff,
      url: buildWaUrl(waNumber, answers),
      button: "Chamar no WhatsApp",
    },
  ];
}

// ------------------------------------------------------------
// Decisão de um turno (pura: estado atual + mensagem -> próximo estado + respostas)
// ------------------------------------------------------------
const blank = (): Patch => ({ add_tags: [], answers: {} });
const iso = (d: Date) => d.toISOString();
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

export function decide(p: Prospect, input: TurnInput): Decision {
  const silent = (outcome: Outcome, patch: Patch = blank()): Decision => ({
    outcome,
    patch,
    messages: [],
    transition: null,
    notify: false,
  });

  if (p.status === "opt_out") return silent("silent_terminal");

  const raw = (input.text || "").trim();
  const payload = input.quickPayload;
  if (!raw && !payload) return silent("silent_nontext"); // figurinha, foto, áudio…

  const now = input.now;
  const lastMsg = clean(raw, 200);
  const base = (): Patch => ({
    add_tags: [],
    answers: { ultima_msg: lastMsg, ...(p.answers.nos ? { nos: 0 } : {}) },
  });

  // 1) Pediu para parar -> encerra e nunca mais manda nada
  if (raw && isOptOut(raw)) {
    return {
      outcome: "opt_out",
      patch: { status: "opt_out", add_tags: ["opt_out"], answers: { ultima_msg: lastMsg } },
      messages: [{ kind: "text", text: TEXT.optOut }],
      transition: { etapa: "perdido", tags: ["opt_out"], note: `Pediu para parar: "${lastMsg}"` },
      notify: false,
    };
  }

  // 2) "não" solto: ambíguo. 1º = silêncio; 2º seguido = encerra.
  if (raw && isBareNo(raw)) {
    const streak = (p.answers.nos ?? 0) + 1;
    if (streak >= 2) {
      return {
        outcome: "opt_out",
        patch: { status: "opt_out", add_tags: ["opt_out"], answers: { ultima_msg: lastMsg, nos: streak } },
        messages: [{ kind: "text", text: TEXT.optOut }],
        transition: { etapa: "perdido", tags: ["opt_out"], note: 'Respondeu "não" duas vezes seguidas' },
        notify: false,
      };
    }
    return silent("silent_ambiguous", { add_tags: [], answers: { ultima_msg: lastMsg, nos: streak } });
  }

  // 3) Handoff em andamento: bot calado durante a pausa; depois dela, só reavisa o Gui.
  if (p.status === "handoff") {
    const until = p.paused_until ? new Date(p.paused_until).getTime() : 0;
    if (until > now.getTime()) return silent("silent_paused", { add_tags: [], answers: { ultima_msg: lastMsg } });
    return {
      outcome: "renotify",
      patch: {
        paused_until: iso(addHours(now, PAUSE_HOURS)),
        handoff_count: p.handoff_count + 1,
        add_tags: [],
        answers: { ultima_msg: lastMsg },
      },
      messages: [],
      transition: { etapa: "proposta", tags: [], note: `Lead voltou a escrever após a pausa: "${lastMsg}"` },
      notify: true,
    };
  }

  // 4) "agora não / depois": nutrição, sem resposta
  if (raw && SOFT_DECLINE.test(normalize(raw))) {
    return {
      outcome: "nutricao",
      patch: { status: "nutricao", add_tags: ["lead_morno"], answers: { ultima_msg: lastMsg } },
      messages: [],
      transition: { etapa: "em_conversa", tags: ["lead_morno"], note: `Pediu para deixar para depois: "${lastMsg}"`, followup_days: 30 },
      notify: false,
    };
  }

  // 5) Pediu preço / quer comprar / pergunta de confiança -> handoff (qualquer passo)
  if (raw && !payload && isHandoffIntent(raw)) {
    const answers: Answers = { ...p.answers };
    if (p.step === 0 && !answers.modelo_atual) answers.modelo_atual = clean(raw, 80);
    if (p.step === 2 && !answers.modelo_desejado) answers.modelo_desejado = clean(raw, 80);
    return {
      outcome: "handoff",
      patch: {
        status: "handoff",
        paused_until: iso(addHours(now, PAUSE_HOURS)),
        handoff_count: p.handoff_count + 1,
        add_tags: ["transicao_whatsapp"],
        answers: {
          ultima_msg: lastMsg,
          modelo_atual: answers.modelo_atual,
          modelo_desejado: answers.modelo_desejado,
          ...(p.answers.nos ? { nos: 0 } : {}),
        },
      },
      messages: handoffMessages(input.waNumber, answers, false),
      transition: { etapa: "proposta", tags: ["transicao_whatsapp"], note: `Pediu preço/compra: "${lastMsg}"` },
      notify: true,
    };
  }

  // 6) Nutrição: só reage a handoff/opt-out (já tratados acima); o resto é silêncio
  if (p.status === "nutricao") return silent("silent_nutricao", { add_tags: [], answers: { ultima_msg: lastMsg } });

  // 7) Passos 1/2/3
  switch (p.step) {
    case 0: {
      // respondeu à DM de abertura -> Passo 1
      const patch = base();
      patch.step = 1;
      patch.status = "em_conversa";
      patch.add_tags = ["lead_engajou"];
      patch.answers.modelo_atual = clean(raw || "", 80) || undefined;
      return {
        outcome: "engaged",
        patch,
        messages: [{ kind: "text", text: TEXT.passo1, quick_replies: [...QR.passo1] }],
        transition: { etapa: "em_conversa", tags: ["lead_engajou"], note: `Respondeu à abertura: "${lastMsg}"` },
        notify: false,
      };
    }

    case 1: {
      const path = classifyStep1(raw, payload);
      const patch = base();
      if (path === "satisfeito") {
        patch.status = "nutricao";
        patch.add_tags = ["lead_satisfeito"];
        return {
          outcome: "nutricao",
          patch,
          messages: [{ kind: "text", text: TEXT.passo2b }],
          transition: { etapa: "em_conversa", tags: ["lead_satisfeito"], note: "Aparelho atual atende bem (nutrição)", followup_days: 60 },
          notify: false,
        };
      }
      const tag = path === "quente" ? "lead_quente" : "lead_morno";
      patch.step = 2;
      patch.add_tags = [tag];
      patch.answers.interesse = path;
      return {
        outcome: "advanced",
        patch,
        messages: [{ kind: "text", text: TEXT.passo2a, quick_replies: [...QR.passo2] }],
        transition: { etapa: "em_conversa", tags: [tag], note: `Passo 1 respondido (${path}): "${lastMsg}"` },
        notify: false,
      };
    }

    case 2: {
      const patch = base();
      if (payload === "PF:S2:sei" && !p.answers.perguntou_modelo) {
        // disse que já sabe mas não disse qual: pergunta uma vez
        patch.answers.perguntou_modelo = true;
        return {
          outcome: "advanced",
          patch,
          messages: [{ kind: "text", text: TEXT.passo2aPerguntaModelo }],
          transition: null,
          notify: false,
        };
      }
      patch.step = 3;
      patch.answers.modelo_desejado =
        payload === "PF:S2:rec" ? "uma recomendação do Gui" : clean(raw || "", 80) || undefined;
      return {
        outcome: "advanced",
        patch,
        messages: [{ kind: "text", text: TEXT.passo3, quick_replies: [...QR.passo3] }],
        transition: { etapa: "em_conversa", tags: [], note: `Passo 2: modelo desejado "${patch.answers.modelo_desejado ?? ""}"` },
        notify: false,
      };
    }

    default: {
      // Passo 3 respondido (lacrado/seminovo) -> handoff
      const pref = classifyStep3(raw, payload);
      const answers: Answers = { ...p.answers, preferencia: pref };
      return {
        outcome: "handoff",
        patch: {
          status: "handoff",
          step: 4,
          paused_until: iso(addHours(now, PAUSE_HOURS)),
          handoff_count: p.handoff_count + 1,
          add_tags: ["transicao_whatsapp"],
          answers: { ultima_msg: lastMsg, preferencia: pref, ...(p.answers.nos ? { nos: 0 } : {}) },
        },
        messages: handoffMessages(input.waNumber, answers, pref === "seminovo"),
        transition: { etapa: "proposta", tags: ["transicao_whatsapp"], note: `Qualificado (prefere ${pref}); handoff para o WhatsApp` },
        notify: true,
      };
    }
  }
}

// ------------------------------------------------------------
// Um turno completo, com dependências injetadas (banco/fila/notificação)
// ------------------------------------------------------------
export type EnqueueItem = { message: BotMessage; key: string; delayMinutes: number };

export type ProspectDeps = {
  // Acha o prospect desta conversa (por ig_id, ou por @ na 1ª vez, gravando o ig_id).
  // null = NÃO é prospect: o bot não responde nada.
  findProspect: () => Promise<Prospect | null>;
  enqueue: (items: EnqueueItem[]) => Promise<void>;
  // Aplica o patch só se o estado ainda for o lido (step/status/handoff_count) e a mid
  // for nova. false = outro webhook foi mais rápido / mensagem repetida.
  commit: (p: Prospect, patch: Patch, mid: string) => Promise<boolean>;
  // devolve o id da transição (vira o delivery id do aviso de handoff)
  recordTransition: (p: Prospect, t: Transition) => Promise<string | undefined>;
  notifyHandoff: (p: Prospect, d: Decision, lastText: string, transitionId?: string) => Promise<void>;
};

export type TurnResult =
  | { handled: false }
  | { handled: true; outcome: Outcome | "duplicate" | "lost_race" };

export async function runProspectTurn(
  deps: ProspectDeps,
  input: TurnInput & { mid: string }
): Promise<TurnResult> {
  const p = await deps.findProspect();
  if (!p) return { handled: false };
  if (p.last_mid === input.mid) return { handled: true, outcome: "duplicate" };

  const d = decide(p, input);

  // Fila ANTES do commit, com chave por transição (não por mid): reprocessar o mesmo
  // webhook ou dois webhooks simultâneos no mesmo estado nunca geram resposta dupla.
  if (d.messages.length > 0) {
    await deps.enqueue(
      d.messages.map((message, i) => ({
        message,
        key: `pf:${p.id}:${p.status}:${p.step}:${p.handoff_count}:${i}`,
        delayMinutes: BOT_REPLY_DELAY_MIN,
      }))
    );
  }

  const ok = await deps.commit(p, d.patch, input.mid);
  if (!ok) return { handled: true, outcome: "lost_race" };

  const transitionId = d.transition ? await deps.recordTransition(p, d.transition) : undefined;
  if (d.notify) await deps.notifyHandoff(p, d, (input.text || "").trim(), transitionId);
  return { handled: true, outcome: d.outcome };
}
