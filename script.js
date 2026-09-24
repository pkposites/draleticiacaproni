document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   CONFIG
============================================================= */
var WHATSAPP_NUMBER = "5511984954018";

/* ============================================================
   CAPTURA DE ORIGEM DO LEAD (UTM + parâmetros dinâmicos do Meta Ads)
   Captura na URL no carregamento da página e persiste em
   sessionStorage, para não perder a origem se o usuário navegar
   pela página antes de preencher/enviar o formulário.
============================================================= */
var ORIGEM_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'campaign_name', 'campaign_id', 'adset_name', 'adset_id', 'ad_name', 'ad_id',
  'site_source_name', 'fbclid', 'gclid'
];

/* Resolve a fonte real (Instagram/Facebook) a partir do macro do Meta Ads
   {{site_source_name}}, que retorna "fb" ou "ig" — mais confiável que
   depender só de utm_source, que costuma vir fixo como "facebook". */
function resolveFonte(origem) {
  var siteSource = (origem.site_source_name || '').toLowerCase();
  if (siteSource === 'ig') return 'Instagram';
  if (siteSource === 'fb') return 'Facebook';
  if (origem.fbclid) return 'Facebook/Instagram (Meta Ads)';
  if (origem.gclid) return 'Google Ads';

  var source = (origem.utm_source || '').toLowerCase();
  if (source.indexOf('instagram') !== -1 || source === 'ig') return 'Instagram';
  if (source.indexOf('facebook') !== -1 || source === 'fb') return 'Facebook';
  if (source === 'google') return 'Google Ads';
  return origem.utm_source || '';
}
var ORIGEM_STORAGE_KEY = 'lead_origem_params';

function captureOrigemParams() {
  var urlParams = new URLSearchParams(window.location.search);
  var found = {};

  ORIGEM_PARAMS.forEach(function (key) {
    var value = urlParams.get(key);
    if (value) found[key] = value;
  });

  if (Object.keys(found).length > 0) {
    try {
      var existing = JSON.parse(sessionStorage.getItem(ORIGEM_STORAGE_KEY) || '{}');
      sessionStorage.setItem(ORIGEM_STORAGE_KEY, JSON.stringify(Object.assign(existing, found)));
    } catch (e) { /* sessionStorage indisponível: segue só com o objeto em memória */ }
  }

  return found;
}

function getOrigemParams() {
  var fromUrl = captureOrigemParams();
  var stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(ORIGEM_STORAGE_KEY) || '{}');
  } catch (e) { /* sessionStorage indisponível */ }

  return Object.assign({}, stored, fromUrl);
}

function buildOrigemMessageBlock(origem) {
  var campanha = origem.campaign_name || origem.utm_campaign || '';
  var conjunto = origem.adset_name || '';
  var anuncio = origem.ad_name || origem.utm_content || '';
  var termo = origem.utm_term || '';
  var fonte = resolveFonte(origem);

  // "Fonte do lead:" sempre é a primeira linha do bloco (mesmo padrão da
  // LP Excalibur), mesmo sem UTM — nesse caso cai no fallback "Direto/Orgânico".
  var linhas = ['Fonte do lead: ' + (fonte || 'Direto/Orgânico')];
  if (campanha) linhas.push('Campanha: ' + campanha);
  if (conjunto) linhas.push('Conjunto: ' + conjunto);
  if (anuncio) linhas.push('Anúncio: ' + anuncio);
  if (termo) linhas.push('Termo/Público: ' + termo);

  return '\n\n' + linhas.join('\n');
}

/* Captura assim que o script carrega, para não perder o clique inicial */
captureOrigemParams();

/* ============================================================
   CAPI (Conversions API) — envio server-side via Cloudflare Worker
   Espelha lead_qualificado/lead_contato no servidor, com o mesmo
   event_id do fbq() do navegador (dedupe automático no Ads Manager).
   Preencher CAPI_ENDPOINT com a URL do worker depois do deploy
   (ex: https://caproni-capi.<subdomínio>.workers.dev).
============================================================= */
var CAPI_ENDPOINT = 'https://draleticiacapronicapi.robson-oc96.workers.dev';
var LEAD_REF_KEY = 'lead_ref';

function getOrCreateLeadRef() {
  try {
    var ref = localStorage.getItem(LEAD_REF_KEY);
    if (!ref) {
      ref = 'ref-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LEAD_REF_KEY, ref);
    }
    return ref;
  } catch (e) {
    return '';
  }
}

function getCookie(name) {
  var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function generateEventId() {
  return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function sendToCapi(metaEventName, eventId) {
  if (!CAPI_ENDPOINT) return; // worker ainda não configurado nesta LP

  var payload = {
    event_name: metaEventName,
    event_id: eventId,
    event_source_url: window.location.href,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc'),
    attribution: getOrigemParams(),
    ref: getOrCreateLeadRef()
  };

  fetch(CAPI_ENDPOINT.replace(/\/$/, '') + '/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(function () { /* falha no envio server-side não deve travar o fluxo do usuário */ });
}

/* ============================================================
   TRACKING HELPERS
   - lead_qualificado: usuário leu a LP e confirmou interesse na caixinha
     (libera o botão de WhatsApp) -> fbq trackCustom 'lead_qualificado'
   - lead_contato: clique no botão de WhatsApp já liberado
     -> fbq track 'Lead' (evento padrão do Meta Pixel)
   Ambos também são espelhados na Conversions API (server-side) com o
   mesmo event_id, para dedupe automático no Ads Manager.
   - quiz_resposta / quiz_completo: engajamento com o quiz -> fbq
     trackCustom (só navegador, sem CAPI — não são eventos de conversão)
   - case_view / cta_click: ficam só no dataLayer, para uso futuro com
     GTM/GA caso seja conectado; não têm efeito no Pixel hoje
============================================================= */
function trackEvent(eventName, params) {
  params = params || {};
  window.dataLayer = window.dataLayer || [];
  dataLayer.push(Object.assign({ event: eventName }, params));

  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
  }
  if (typeof fbq === 'function') {
    if (eventName === 'lead_qualificado') {
      var qualId = generateEventId();
      fbq('trackCustom', 'lead_qualificado', params, { eventID: qualId });
      sendToCapi('lead_qualificado', qualId);
    } else if (eventName === 'lead_contato') {
      var leadId = generateEventId();
      fbq('track', 'Lead', params, { eventID: leadId });
      sendToCapi('Lead', leadId);
    } else if (eventName === 'quiz_resposta' || eventName === 'quiz_completo') {
      // Eventos de engajamento do quiz: enviados como custom event pro Pixel
      // (só no navegador, sem espelho CAPI — não são eventos de conversão).
      fbq('trackCustom', eventName, params);
    }
    // case_view e cta_click ficam só no dataLayer: são sinais de engajamento
    // pra uso futuro com GTM/GA, não eventos de conversão do Pixel.
  }
}

function buildWhatsappUrl() {
  var nome = (leadNomeInput && leadNomeInput.value.trim()) || '';
  var telefone = (leadTelefoneInput && leadTelefoneInput.value.trim()) || '';

  var msg = nome ? "Olá! Meu nome é " + nome + "." : "Olá!";
  msg += " Vim através da página da Dra. Letícia Caproni e gostaria "
    + "de agendar uma avaliação inicial com a equipe da Clínica Exen.";
  if (telefone) msg += "\n\nMeu WhatsApp: " + telefone;

  if (quizAnswers.queixa) {
    msg += "\n\nMeu perfil:";
    msg += "\n- Queixa principal: " + quizAnswers.queixa;
    if (quizAnswers.ja_fez_transplante) msg += "\n- Já fez transplante antes: " + quizAnswers.ja_fez_transplante;
    if (quizAnswers.tempo_queixa) msg += "\n- Tempo do quadro: " + quizAnswers.tempo_queixa;
    if (quizAnswers.urgencia) msg += "\n- Quando pretende iniciar: " + quizAnswers.urgencia;
  }

  msg += buildOrigemMessageBlock(getOrigemParams());

  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
}

/* ============================================================
   SLIDER DE CASES ANTES/DEPOIS
============================================================= */
var casesTrack = document.getElementById('cases-track');
if (casesTrack) {
  var caseSlides = casesTrack.querySelectorAll('.case-slide');
  var caseDots = document.querySelectorAll('.cases-dot');
  var currentCase = 0;

  function goToCase(n) {
    currentCase = (n + caseSlides.length) % caseSlides.length;
    casesTrack.style.transform = 'translateX(-' + (currentCase * 100) + '%)';
    caseDots.forEach(function (dot, i) {
      dot.classList.toggle('active', i === currentCase);
    });
    trackEvent('case_view', { indice: currentCase + 1 });
  }

  document.getElementById('cases-prev').addEventListener('click', function () {
    goToCase(currentCase - 1);
  });
  document.getElementById('cases-next').addEventListener('click', function () {
    goToCase(currentCase + 1);
  });
  caseDots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goToCase(i); });
  });
}

/* ============================================================
   QUIZ INTERATIVO
   Coleta o perfil do caso (queixa, histórico, tempo, urgência) para
   a equipe já receber o contato com contexto. As respostas entram
   na mensagem de WhatsApp montada em buildWhatsappUrl().
============================================================= */
var quizAnswers = {};
var quizSteps = document.querySelectorAll('.quiz-step');
var quizDots = document.querySelectorAll('.quiz-dot');
var quizResult = document.getElementById('quiz-result');
var quizResultSummary = document.getElementById('quiz-result-summary');
var quizRestart = document.getElementById('quiz-restart');
var currentQuizStep = 1;
var totalQuizSteps = quizSteps.length;

function goToQuizStep(n) {
  quizSteps.forEach(function (step) {
    step.hidden = Number(step.dataset.step) !== n;
  });
  quizDots.forEach(function (dot) {
    dot.classList.toggle('active', Number(dot.dataset.dot) <= n);
  });
  currentQuizStep = n;
}

function finishQuiz() {
  quizSteps.forEach(function (step) { step.hidden = true; });
  quizResult.hidden = false;

  quizResultSummary.textContent =
    "Queixa: " + (quizAnswers.queixa || "-") +
    " · Já fez transplante: " + (quizAnswers.ja_fez_transplante || "-") +
    " · Tempo do quadro: " + (quizAnswers.tempo_queixa || "-") +
    " · Urgência: " + (quizAnswers.urgencia || "-");

  trackEvent('quiz_completo', quizAnswers);

  document.getElementById('qualificacao').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('.quiz-option').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var field = btn.dataset.field;
    var value = btn.dataset.value;
    quizAnswers[field] = value;

    var siblings = btn.parentElement.querySelectorAll('.quiz-option');
    siblings.forEach(function (s) { s.classList.remove('selected'); });
    btn.classList.add('selected');

    trackEvent('quiz_resposta', { pergunta: field, resposta: value });

    setTimeout(function () {
      if (currentQuizStep < totalQuizSteps) {
        goToQuizStep(currentQuizStep + 1);
      } else {
        finishQuiz();
      }
    }, 250);
  });
});

if (quizRestart) {
  quizRestart.addEventListener('click', function () {
    quizAnswers = {};
    document.querySelectorAll('.quiz-option.selected').forEach(function (btn) {
      btn.classList.remove('selected');
    });
    quizResult.hidden = true;
    goToQuizStep(1);
    document.getElementById('quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ============================================================
   CAIXA DE CONFIRMAÇÃO -> LIBERA O BOTÃO DE WHATSAPP
   A qualificação do lead acontece aqui: o usuário leu/entendeu a LP
   e marcou a caixinha confirmando interesse antes de poder seguir.
============================================================= */
var confirmCheckbox = document.getElementById('confirm-interesse');
var whatsappQualificado = document.getElementById('whatsapp-qualificado');
var confirmHint = document.getElementById('confirm-hint');
var optionalFields = document.getElementById('optional-fields');
var leadNomeInput = document.getElementById('lead-nome');
var leadTelefoneInput = document.getElementById('lead-telefone');
var hasFiredLeadQualificado = false;

confirmCheckbox.addEventListener('change', function () {
  if (confirmCheckbox.checked) {
    whatsappQualificado.classList.add('unlocked');
    whatsappQualificado.setAttribute('aria-disabled', 'false');
    confirmHint.classList.add('hidden');
    optionalFields.hidden = false;

    if (!hasFiredLeadQualificado) {
      var origem = getOrigemParams();
      trackEvent('lead_qualificado', Object.assign(
        { origem: 'caixa_confirmacao_lp' },
        origem,
        {
          campaign_name: origem.campaign_name || origem.utm_campaign || '',
          adset_name: origem.adset_name || '',
          ad_name: origem.ad_name || origem.utm_content || '',
          fonte: resolveFonte(origem)
        }
      ));
      hasFiredLeadQualificado = true;
    }
  } else {
    whatsappQualificado.classList.remove('unlocked');
    whatsappQualificado.setAttribute('aria-disabled', 'true');
    confirmHint.classList.remove('hidden');
    optionalFields.hidden = true;
  }
});

var confirmCheckLabel = document.getElementById('confirm-check');
var confirmBox = document.getElementById('confirm-box');

function callAttentionToCheckbox(origem) {
  confirmBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Reinicia a animação mesmo se o usuário clicar de novo rapidamente
  confirmCheckLabel.classList.remove('attention');
  // eslint-disable-next-line no-unused-expressions
  void confirmCheckLabel.offsetWidth; // força reflow pra reiniciar a animação CSS
  confirmCheckLabel.classList.add('attention');

  clearTimeout(callAttentionToCheckbox._timer);
  callAttentionToCheckbox._timer = setTimeout(function () {
    confirmCheckLabel.classList.remove('attention');
  }, 1600);

  trackEvent('cta_click', { origem: origem || 'whatsapp_bloqueado_sem_confirmar' });
}

whatsappQualificado.addEventListener('click', function (e) {
  e.preventDefault();
  if (!confirmCheckbox.checked) {
    callAttentionToCheckbox('whatsapp_bloqueado_sem_confirmar');
    return;
  }

  // Abre a aba em branco AGORA (síncrono com o clique, exigido pelo Safari/iOS
  // para não ser bloqueado como pop-up) e só troca a URL dela depois do
  // tracking, dando tempo do fetch do CAPI sair antes do WhatsApp assumir.
  var whatsappWindow = window.open('', '_blank');
  trackEvent('lead_contato', Object.assign({ origem: 'botao_qualificado' }, getOrigemParams()));

  var leadNome = (leadNomeInput && leadNomeInput.value.trim()) || '';
  if (leadNome && window.LeadHub && typeof window.LeadHub.identify === 'function') {
    window.LeadHub.identify({ name: leadNome });
  }

  setTimeout(function () {
    var url = buildWhatsappUrl();
    // Lead Hub intercepta o clique e injeta o código de rastreio na URL;
    // se o script não carregar por qualquer motivo, segue com a URL normal.
    var destino = window.LeadHub ? window.LeadHub.whatsappUrl(url) : url;
    if (whatsappWindow) {
      whatsappWindow.location.href = destino;
    } else {
      window.location.href = destino; // pop-up bloqueado: segue na mesma aba
    }
  }, 300);
});

/* ============================================================
   DEMAIS CTAs (header, CTA final e barra fixa mobile)
   Estes NÃO abrem o WhatsApp diretamente — levam até a caixinha de
   confirmação com o mesmo destaque (chacoalhão + cor) do botão
   bloqueado, já deixando claro o que falta pra liberar o contato.
   O único caminho até o WhatsApp é o botão liberado pela caixinha.
============================================================= */
function goToConfirmBox(e, origem) {
  if (e) e.preventDefault();
  callAttentionToCheckbox(origem);
}

var ctaHeaderScroll = document.querySelector('.header-cta');
if (ctaHeaderScroll) {
  ctaHeaderScroll.addEventListener('click', function (e) {
    goToConfirmBox(e, 'cta_header');
  });
}

var ctaHeroScroll = document.getElementById('cta-hero-scroll');
if (ctaHeroScroll) {
  ctaHeroScroll.addEventListener('click', function (e) {
    goToConfirmBox(e, 'cta_hero');
  });
}

var ctaFinalScroll = document.getElementById('cta-final-scroll');
if (ctaFinalScroll) {
  ctaFinalScroll.addEventListener('click', function (e) {
    goToConfirmBox(e, 'cta_final');
  });
}

var ctaStickyScroll = document.getElementById('cta-sticky-scroll');
if (ctaStickyScroll) {
  ctaStickyScroll.addEventListener('click', function (e) {
    goToConfirmBox(e, 'barra_fixa_mobile');
  });
}

/* ============================================================
   BARRA FIXA MOBILE: esconder perto do rodapé
   Some quando a seção de qualificação entra na tela — a partir dali
   o CTA final já cumpre o mesmo papel, e ter os dois juntos empilhados
   no fim da página é redundante.
============================================================= */
var mobileStickyCta = document.querySelector('.mobile-sticky-cta');
if (mobileStickyCta && 'IntersectionObserver' in window) {
  var qualifySection = document.getElementById('qualificacao');
  var stickyObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      // Esconde assim que a seção de qualificação entra na tela e continua
      // escondida dali pra baixo (CTA final, rodapé) — só reaparece se o
      // usuário rolar de volta pra cima, antes de chegar nela.
      var jaPassouDaSecao = entry.boundingClientRect.top <= 0;
      mobileStickyCta.classList.toggle('is-hidden', entry.isIntersecting || jaPassouDaSecao);
    });
  }, { threshold: 0 });
  stickyObserver.observe(qualifySection);
}
