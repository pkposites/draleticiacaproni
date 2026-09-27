# Padrão de LPs — referência interna

Estrutura de referência pra landing pages de qualificação de lead, validada
nesta LP (Dra. Letícia Caproni / Clínica Exen). Usar como ponto de partida
em novos projetos do mesmo tipo (estética, saúde, serviços de alto ticket
com fechamento via WhatsApp).

## Estrutura de seções (ordem)

1. **Header fixo** — logo/nome + CTA que leva até a qualificação
2. **Hero** — proposta de valor + **foto da profissional/especialista** (gera autoridade e confiança logo de cara)
3. **Contexto / Sobre** — credenciais, diferenciais, o que torna o método/serviço confiável
4. **Método/Processo** — passo a passo de como funciona (reduz ansiedade, mostra profissionalismo)
5. **Antes e depois** — prova visual do resultado (carrossel, se houver mais de 1 caso)
6. **Depoimento em vídeo** — reforço emocional, real, com áudio (mais forte que texto)
7. **Avaliações reais do Google** — prova social de terceiros, com nota + link pro perfil real (não inventar/genérico)
8. **Quiz interativo** — gera interação, qualifica o lead e coleta contexto pra equipe já receber o contato com informação útil
9. **Confirmação de interesse** — caixinha/checkbox que a pessoa marca antes de liberar o botão de contato; é o ponto que garante que o lead passou pelo conteúdo antes de falar com a equipe
10. **CTA final + WhatsApp** — fechamento

## Princípios que fizeram essa LP funcionar

- **Mobile-first de verdade**: espaçamento, toque e fontes pensados pro celular primeiro (é o canal principal de tráfego pago)
- **Um único caminho até o contato**: todos os CTAs da página levam até a seção de qualificação, nunca abrem o WhatsApp direto — isso qualifica o lead antes do contato
- **Reforço visual quando falta uma ação**: se a pessoa tenta avançar sem marcar a caixinha, a página chacoalha/destaca o que falta (em vez de só ignorar o clique)
- **Tracking correto desde o início**: Meta Pixel + Conversions API (CAPI) com o mesmo `event_id` pra dedupe, captura de UTM/origem do anúncio, mensagem final pro WhatsApp já com a origem do lead (campanha/conjunto/anúncio/fonte)
- **LGPD real, não decorativa**: banner de cookies com aceitar/recusar de verdade — scripts de rastreio (Pixel, Clarity, ferramentas de lead) só carregam depois do consentimento
- **Zero menção a saúde/condição médica quando a Meta classifica o nicho como sensível**: nada de "diagnóstico", "tratamento de X", "procedimento", "cirurgia" — só linguagem de estética, autoestima e agendamento. Vale também pras **imagens** (nada de texto/marcação médica queimada no pixel da foto) e pro **vídeo** (áudio não pode citar termos médicos)
- **Linguagem de gênero neutra por padrão**, a menos que o público real do cliente seja claramente de um gênero — aí ajustar a comunicação pra refletir isso (ex: público majoritariamente masculino → evitar adjetivos flexionados no feminino, ordenar menções "eles e elas")

## Checklist rápido pra nova LP nesse padrão

- [ ] Foto real da profissional no hero
- [ ] Seção de contexto/credenciais
- [ ] Antes e depois (ou equivalente de prova visual)
- [ ] Depoimento em vídeo real
- [ ] Avaliações reais (Google ou equivalente), com link de verdade
- [ ] Quiz de qualificação (3-4 perguntas, sem perguntas de histórico médico/condição)
- [ ] Caixinha de confirmação antes do WhatsApp
- [ ] Pixel + CAPI com dedupe por `event_id`
- [ ] Banner de LGPD com consentimento real (scripts atrás do aceite)
- [ ] Revisão de texto/imagem/vídeo pra termos sensíveis, se o nicho for de categoria restrita na Meta
