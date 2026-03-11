(function () {
  "use strict";

  var MODAL_ID = "vvcloud-dashboard-welcome";
  var SESSION_KEY = "vvcloud.dashboard.welcome.shown";
  var KNOWLEDGE_PATH = "/#/knowledge";
  var PLAN_PATH = "/#/plan";

  function currentHash() {
    return String(window.location.hash || "").toLowerCase();
  }

  function isDashboardRoute() {
    var hash = currentHash();

    return hash === "" || hash === "#" || hash === "#/" || hash.indexOf("#/dashboard") === 0;
  }

  function isAuthRoute() {
    var hash = currentHash();

    return hash.indexOf("#/login") === 0 || hash.indexOf("#/register") === 0 || hash.indexOf("#/forget") === 0;
  }

  function hasShown() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markShown() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch (e) {}
  }

  function removeModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) {
      existing.remove();
    }

    document.removeEventListener("keydown", onEscape);
  }

  function renderModal() {
    if (document.getElementById(MODAL_ID)) {
      return;
    }

    var mask = document.createElement("div");
    mask.id = MODAL_ID;
    mask.className = "vvcloud-welcome-mask";
    mask.innerHTML =
      '<section class="vvcloud-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="vvcloud-welcome-title">' +
        '<div class="vvcloud-welcome-body">' +
          '<div class="vvcloud-welcome-eyebrow">NEW USER GUIDE</div>' +
          '<h2 class="vvcloud-welcome-title" id="vvcloud-welcome-title">注册后即可获得 10G 测试流量</h2>' +
          '<p class="vvcloud-welcome-desc">首次进入面板，建议先看一下使用说明。如果你还不熟悉订阅导入、客户端选择或节点使用方式，可以直接查看新手教程。</p>' +
          '<div class="vvcloud-welcome-note">测试期间动态家宽 IP 线路无法体验，可购买订阅使用。</div>' +
          '<div class="vvcloud-welcome-actions">' +
            '<a class="vvcloud-welcome-btn vvcloud-welcome-btn-primary" href="' + KNOWLEDGE_PATH + '">查看新手教程</a>' +
            '<a class="vvcloud-welcome-btn vvcloud-welcome-btn-secondary" href="' + PLAN_PATH + '">购买订阅</a>' +
            '<button class="vvcloud-welcome-btn vvcloud-welcome-btn-secondary" type="button" data-act="dismiss">我知道了</button>' +
          "</div>" +
        "</div>" +
      "</section>";

    document.body.appendChild(mask);

    mask.addEventListener("click", function (event) {
      if (event.target === mask) {
        removeModal();
      }
    });

    var dismissButton = mask.querySelector('[data-act="dismiss"]');
    if (dismissButton) {
      dismissButton.addEventListener("click", removeModal);
    }

    var knowledgeLink = mask.querySelector('a[href="' + KNOWLEDGE_PATH + '"]');
    if (knowledgeLink) {
      knowledgeLink.addEventListener("click", removeModal);
    }

    var planLink = mask.querySelector('a[href="' + PLAN_PATH + '"]');
    if (planLink) {
      planLink.addEventListener("click", removeModal);
    }

    document.addEventListener("keydown", onEscape);
  }

  function onEscape(event) {
    if (event.key === "Escape") {
      removeModal();
    }
  }

  function maybeShowModal() {
    if (!isDashboardRoute() || isAuthRoute() || hasShown()) {
      return;
    }

    markShown();
    window.setTimeout(renderModal, 500);
  }

  document.addEventListener("DOMContentLoaded", maybeShowModal);
  window.addEventListener("hashchange", maybeShowModal);
  window.setTimeout(maybeShowModal, 900);
})();
