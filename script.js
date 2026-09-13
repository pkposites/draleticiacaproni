document.getElementById('year').textContent = new Date().getFullYear();

/* ============================================================
   CONFIG
============================================================= */
var WHATSAPP_NUMBER = "5511900000000"; // TODO: substituir pelo número real da equipe
var answers = {};

/* ============================================================
   TRACKING HELPERS
   - lead_qualificado: disparado quando o usuário conclui o quiz
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

function buildWhatsappUrl(withAnswers) {
  var base = "https://wa.me/" + WHATSAPP_NUMBER;
  var msg = "Olá! Vim através da página da Dra. Letícia Caproni";
  if (withAnswers && answers.interesse) {
    msg += " e tenho interesse em: " + answers.interesse;
    if (answers.tempo) msg += " (percebo isso há " + answers.tempo + ")";
    if (answers.nome) msg = "Meu nome é " + answers.nome + ". " + msg;
  }
  msg += ". Gostaria de agendar uma avaliação inicial.";
  return base + "?text=" + encodeURIComponent(msg);
}

/* ============================================================
   QUALIFICATION QUIZ
============================================================= */
var steps = document.querySelectorAll('.form-step');
var dots = document.querySelectorAll('.dot-step');
var currentStep = 1;

function goToStep(n) {
  steps.forEach(function (step) {
    step.hidden = Number(step.dataset.step) !== n;
  });
  dots.forEach(function (dot) {
    dot.classList.toggle('active', Number(dot.dataset.dot) <= n);
  });
  currentStep = n;
}

document.querySelectorAll('.option-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var field = btn.dataset.field;
    var value = btn.dataset.value;
    answers[field] = value;

    var siblings = btn.parentElement.querySelectorAll('.option-btn');
    siblings.forEach(function (s) { s.classList.remove('selected'); });
    btn.classList.add('selected');

    trackEvent('quiz_resposta', { pergunta: field, resposta: value });

    setTimeout(function () {
      goToStep(currentStep + 1);
    }, 250);
  });
});

var qualifyForm = document.getElementById('qualify-form');
qualifyForm.addEventListener('submit', function (e) {
  e.preventDefault();
  answers.nome = document.getElementById('nome').value.trim();
  answers.whatsapp_paciente = document.getElementById('whatsapp').value.trim();

  if (!answers.nome || !answers.whatsapp_paciente) return;

  // Evento de lead qualificado: usuário completou o mini-quiz de qualificação
  trackEvent('lead_qualificado', {
    interesse: answers.interesse || '',
    tempo: answers.tempo || '',
    interesse_contato: answers.interesse_contato || '',
    nome: answers.nome
  });

  // Evento de lead de contato: está indo para o WhatsApp
  trackEvent('lead_contato', { origem: 'formulario_qualificacao' });

  window.location.href = buildWhatsappUrl(true);
});

/* ============================================================
   DIRECT WHATSAPP BUTTONS (fora do quiz)
============================================================= */
document.getElementById('whatsapp-direct').addEventListener('click', function (e) {
  e.preventDefault();
  trackEvent('lead_contato', { origem: 'cta_final' });
  window.open(buildWhatsappUrl(false), '_blank');
});

var stickyBtn = document.getElementById('whatsapp-sticky');
if (stickyBtn) {
  stickyBtn.addEventListener('click', function (e) {
    e.preventDefault();
    trackEvent('lead_contato', { origem: 'barra_fixa_mobile' });
    window.open(buildWhatsappUrl(false), '_blank');
  });
}
