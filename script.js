document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   CONFIG
============================================================= */
var WHATSAPP_NUMBER = "5511984954018";

/* ============================================================
   TRACKING HELPERS
   - lead_qualificado: usuário leu a LP e confirmou interesse na caixinha
     (libera o botão de WhatsApp)
   - lead_contato: disparado em qualquer clique que leve ao WhatsApp
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
      fbq('track', 'Lead', params);
    } else if (eventName === 'lead_contato') {
      fbq('trackCustom', 'lead_contato', params);
    }
  }
}

function buildWhatsappUrl() {
  var msg = "Olá! Vim através da página da Dra. Letícia Caproni e gostaria "
    + "de agendar uma avaliação inicial com a equipe da Clínica Exen.";

  if (quizAnswers.queixa) {
    msg += "\n\nMeu perfil:";
    msg += "\n- Queixa principal: " + quizAnswers.queixa;
    if (quizAnswers.ja_fez_transplante) msg += "\n- Já fez transplante antes: " + quizAnswers.ja_fez_transplante;
    if (quizAnswers.tempo_queixa) msg += "\n- Tempo do quadro: " + quizAnswers.tempo_queixa;
    if (quizAnswers.urgencia) msg += "\n- Quando pretende iniciar: " + quizAnswers.urgencia;
  }

  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
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
var hasFiredLeadQualificado = false;

confirmCheckbox.addEventListener('change', function () {
  if (confirmCheckbox.checked) {
    whatsappQualificado.classList.add('unlocked');
    whatsappQualificado.setAttribute('aria-disabled', 'false');
    confirmHint.classList.add('hidden');

    if (!hasFiredLeadQualificado) {
      trackEvent('lead_qualificado', { origem: 'caixa_confirmacao_lp' });
      hasFiredLeadQualificado = true;
    }
  } else {
    whatsappQualificado.classList.remove('unlocked');
    whatsappQualificado.setAttribute('aria-disabled', 'true');
    confirmHint.classList.remove('hidden');
  }
});

whatsappQualificado.addEventListener('click', function (e) {
  e.preventDefault();
  if (!confirmCheckbox.checked) return;
  trackEvent('lead_contato', { origem: 'botao_qualificado' });
  window.open(buildWhatsappUrl(), '_blank');
});

/* ============================================================
   DEMAIS CTAs (CTA final e barra fixa mobile)
   Estes NÃO abrem o WhatsApp diretamente — apenas rolam até a
   seção de qualificação. O único caminho até o WhatsApp é o botão
   liberado pela caixinha de confirmação acima.
============================================================= */
var ctaFinalScroll = document.getElementById('cta-final-scroll');
if (ctaFinalScroll) {
  ctaFinalScroll.addEventListener('click', function () {
    trackEvent('cta_click', { origem: 'cta_final' });
  });
}

var ctaStickyScroll = document.getElementById('cta-sticky-scroll');
if (ctaStickyScroll) {
  ctaStickyScroll.addEventListener('click', function () {
    trackEvent('cta_click', { origem: 'barra_fixa_mobile' });
  });
}
