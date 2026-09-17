# LP — Dra. Letícia Caproni / Clínica Exen

Landing page de qualificação para tráfego pago (Meta Ads). Site estático (HTML/CSS/JS puro, sem build), pensado mobile-first.

## Estrutura de arquivos

```
index.html              estrutura da página
styles.css               estilos (tema, componentes, responsivo)
script.js                lógica de interação e disparo de eventos
assets/
  dra-leticia.webp        foto da Dra. no hero
  cases/                  imagens de antes/depois (case-1.png ... case-4.png)
  video/
    depoimento.mp4        vídeo de depoimento de paciente
```

Sem dependência de build, framework ou Node — é só abrir/hospedar os 3 arquivos + pasta `assets/`.

## Fluxo da página (ordem das seções)

1. **Header fixo** — logo + CTA que rola até a qualificação
2. **Hero** — proposta de valor, foto da Dra., CTA principal
3. **Sobre a Dra. Letícia** — credenciais e diferenciais
4. **Método** — 4 etapas do processo (avaliação → planejamento → procedimento → recuperação)
5. **Cases antes/depois** — carrossel com 4 casos reais (setas + navegação por bolinhas)
6. **Depoimento em vídeo** — vídeo real de paciente, com áudio e controles nativos (sem autoplay)
7. **Prova social (Google)** — selo de nota 4,9 (55 avaliações, linkado ao perfil real) + 3 depoimentos do Google
8. **Quiz interativo** — 4 perguntas sobre o caso do lead (ver detalhes abaixo)
9. **Qualificação** — caixa de confirmação que libera o botão de WhatsApp
10. **CTA final** + **barra fixa de WhatsApp (mobile)** — ambos só rolam até a seção de qualificação, não abrem o WhatsApp direto
11. **Footer**

## Regra de negócio central: WhatsApp só libera pela caixinha

Por decisão do cliente, **existe um único caminho até o WhatsApp**: o botão dentro da seção de qualificação (`#qualificacao`), que fica travado (`btn-locked`, opacidade reduzida, `pointer-events:none`) até o usuário marcar a checkbox de confirmação.

- CTA do header, CTA final e barra fixa mobile **não abrem o WhatsApp** — eles apenas fazem scroll até `#qualificacao` (`href="#qualificacao"`).
- Isso é intencional: força a passagem pelo quiz/leitura antes do contato, gerando um lead mais qualificado.

Se um dia quiser liberar contato direto em algum ponto, é só trocar o `href` de volta para abrir `buildWhatsappUrl()` via JS (ver como era feito antes no botão `whatsapp-qualificado`).

## Quiz interativo (perfil do lead)

4 perguntas, uma por vez, com barra de progresso (bolinhas):

| Campo (`data-field`) | Pergunta |
|---|---|
| `queixa` | Qual sua principal queixa hoje? |
| `ja_fez_transplante` | Já fez transplante capilar antes? |
| `tempo_queixa` | Há quanto tempo percebe esse quadro? |
| `urgencia` | Quando pretende iniciar o tratamento? |

Respostas ficam em `quizAnswers` (objeto global em `script.js`) e são:
- Enviadas como parâmetros no evento `quiz_resposta` (uma por pergunta) e `quiz_completo` (resumo final)
- Injetadas automaticamente na mensagem do WhatsApp (via `buildWhatsappUrl()`), para a equipe já receber o contato com contexto do caso.

Ao terminar as 4 perguntas, a página rola sozinha até a seção de qualificação.

## Eventos de tracking disparados

Todos os eventos passam por `trackEvent(nome, params)` em `script.js`, que:
- Empurra para `dataLayer` (compatível com GTM/GA4)
- Chama `gtag('event', ...)` quando disponível
- Chama `fbq('track'/'trackCustom', ...)` para o Meta Pixel quando disponível

| Evento | Quando dispara | Observação |
|---|---|---|
| `quiz_resposta` | a cada pergunta respondida no quiz | `{ pergunta, resposta }` |
| `quiz_completo` | ao finalizar as 4 perguntas do quiz | envia todas as respostas |
| `case_view` | ao trocar de slide no carrossel de antes/depois | `{ indice }` |
| `cta_click` | clique no CTA final ou na barra fixa mobile (que só rolam a página) | `{ origem }` |
| **`lead_qualificado`** | ao marcar a caixinha de confirmação (1x por sessão) | mapeado para `fbq('trackCustom', 'lead_qualificado')` |
| **`lead_contato`** | ao clicar no botão de WhatsApp já liberado | mapeado para `fbq('track', 'Lead')` — evento **padrão** do Meta Pixel |

`lead_qualificado` e `lead_contato` são os dois eventos-chave pedidos pelo cliente para otimização de campanha.

## O que falta configurar antes de ir ao ar

Tudo sinalizado com `TODO`/placeholder no código:

1. **`index.html`** (`<head>`) — já configurado:
   - Meta Pixel: `1034926504222895`
   - Microsoft Clarity: `yjrhuyxfsb`
   - GA4 não está em uso (decisão do cliente)
2. **`script.js`**:
   - `WHATSAPP_NUMBER` já está com o número real (`5511984954018`) — trocar apenas se mudar de número
   - `CAPI_ENDPOINT` — vazio até o worker (ver seção "CAPI / Cloudflare Worker" abaixo) ser publicado; enquanto vazio, o site funciona normal e só não envia eventos server-side
3. **Domínio final cadastrado no Business Manager** (necessário para Pixel/CAPI em domínios verificados)

## CAPI / Cloudflare Worker

Worker em `worker/` (`index.js` + `wrangler.toml`), no mesmo padrão usado nos outros projetos da conta (ex: `capi-excalibur`). Ele espelha os eventos do navegador (Pixel) no servidor via Meta Conversions API, usando o mesmo `event_id` para dedupe automático no Ads Manager.

**Fluxo:**
- `POST /event` — recebe `lead_qualificado` e `Lead` (contato) direto do `script.js` da LP, com `fbp`/`fbc` (cookies do Pixel), atribuição (UTMs/Meta Ads) e um `ref` salvo no `localStorage` do visitante.
- `POST /offline-event` — pra reportar manualmente, depois da conversa no WhatsApp, quando o lead vira **avaliação realizada** (`AvaliacaoRealizada` → `Schedule`) ou **cirurgia agendada** (`CirurgiaAgendada` → `Purchase`). Casa com o clique original via o `ref` guardado no KV `LEADS`.

**Como publicar (não há tool de deploy de Worker disponível nesta sessão — passos manuais):**
1. No dashboard da Cloudflare → Workers & Pages → Create → **Import a repository**, aponte pro repositório `pkposites/draleticiacaproni`, com **Root directory** = `worker/`.
2. Configurar variáveis/segredos do Worker:
   - `META_ACCESS_TOKEN` (secret) — token de sistema do Business Manager com permissão `ads_management`
   - `OFFLINE_EVENTS_TOKEN` (secret) — token à sua escolha, usado pra autenticar quem reporta eventos offline
   - `PIXEL_ID` e `ALLOWED_ORIGIN` (vars) já vêm preenchidos no `wrangler.toml`, ajustar `ALLOWED_ORIGIN` se o domínio final for diferente de `dra-leticia-caproni.netlify.app`
   - Binding KV `LEADS` já apontado pro namespace `caproni-leads` (id `3fdac85e78554d72b1d234ffbf66ac64`), criado nesta conta Cloudflare
3. Depois de publicado, copiar a URL do Worker (`https://caproni-capi.<subdomínio>.workers.dev`) e colar em `CAPI_ENDPOINT` no `script.js`.

## Deploy

Site 100% estático — pode ser hospedado em qualquer lugar (Netlify, GitHub Pages, Vercel, etc.), sem passo de build. Bastam os arquivos deste repositório.

Repositório: `pkposites/draleticiacaproni`, branch de desenvolvimento: `claude/bold-gauss-pd6kt7`.

## Notas de design

- Mobile-first: mobile é o canal principal (tráfego de anúncios), então espaçamentos, tamanhos de toque e o formulário foram ajustados prioritariamente para telas pequenas (`@media(max-width:600px)` concentra os ajustes).
- Paleta: verde escuro + dourado + creme, tipografia serifada (Cormorant Garamond) para títulos e sans-serif (Jost) para o restante — tom elegante/boutique.
- Cantos arredondados e sombras suaves em cards, imagens e caixas (evita visual "quadrado"/datado).
- Borda dourada animada na caixa do quiz para reforçar a interação.
