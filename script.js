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
  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
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
   DEMAIS BOTÕES DE WHATSAPP (fora do fluxo de qualificação)
============================================================= */
document.getElementById('whatsapp-direct').addEventListener('click', function (e) {
  e.preventDefault();
  trackEvent('lead_contato', { origem: 'cta_final' });
  window.open(buildWhatsappUrl(), '_blank');
});

var stickyBtn = document.getElementById('whatsapp-sticky');
if (stickyBtn) {
  stickyBtn.addEventListener('click', function (e) {
    e.preventDefault();
    trackEvent('lead_contato', { origem: 'barra_fixa_mobile' });
    window.open(buildWhatsappUrl(), '_blank');
  });
}
