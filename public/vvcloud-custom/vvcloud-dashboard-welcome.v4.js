(function () {
  "use strict";

  var MODAL_ID = "vvcloud-dashboard-welcome";
  var KNOWLEDGE_PATH = "/#/knowledge";
  var PLAN_PATH = "/#/plan";
  var TELEGRAM_URL = "https://t.me/vvcloud_official";
  var POLL_INTERVAL_MS = 250;
  var ACCESS_TOKEN_STORAGE_KEY = "VUE_NAIVE_ACCESS_TOKEN";
  var USER_INFO_API_PATH = "/api/v1/user/info";
  var lastDashboardState = false;
  var userInfoRequest = null;

  function currentHash() {
    return String(window.location.hash || "").toLowerCase();
  }

  function isDashboardRoute() {
    var hash = currentHash();
    var path = String(window.location.pathname || "").toLowerCase();

    return (
      hash === "" ||
      hash === "#" ||
      hash === "#/" ||
      hash.indexOf("#/dashboard") === 0 ||
      path === "/dashboard"
    );
  }

  function isAuthRoute() {
    var hash = currentHash();
    var path = String(window.location.pathname || "").toLowerCase();

    return (
      hash.indexOf("#/login") === 0 ||
      hash.indexOf("#/register") === 0 ||
      hash.indexOf("#/forget") === 0 ||
      path === "/login" ||
      path === "/register" ||
      path === "/forget"
    );
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
          '<h2 class="vvcloud-welcome-title" id="vvcloud-welcome-title">新用户首次9折优惠券：new90 体验IEPL专线、家宽IP：适用于200G以上包月/流量套餐</h2>' +
          '<p class="vvcloud-welcome-desc">首次进入面板，建议先看一下使用说明。如果你还不熟悉订阅导入、客户端选择或节点使用方式，可以直接查看新手教程或者联系电报群客服。</p>' +
          '<div class="vvcloud-welcome-note">测试期间动态家宽 IP 线路无法体验，可购买订阅使用。</div>' +
          '<div class="vvcloud-welcome-actions">' +
            '<a class="vvcloud-welcome-btn vvcloud-welcome-btn-primary" href="' + KNOWLEDGE_PATH + '">查看新手教程</a>' +
            '<a class="vvcloud-welcome-btn vvcloud-welcome-btn-accent" href="' + PLAN_PATH + '">购买订阅</a>' +
            '<a class="vvcloud-welcome-btn vvcloud-welcome-btn-secondary" href="' + TELEGRAM_URL + '" target="_blank" rel="noopener noreferrer">加电报群</a>' +
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

  function getAccessToken() {
    try {
      var payload = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      if (!payload) {
        return "";
      }

      var parsed = JSON.parse(payload);
      return parsed && parsed.value ? String(parsed.value) : "";
    } catch (error) {
      return "";
    }
  }

  function normalizeAuthorization(token) {
    var value = String(token || "").trim();
    if (!value) {
      return "";
    }

    if (/^Bearer\s+/i.test(value)) {
      return value;
    }

    return "Bearer " + value;
  }

  function buildUserInfoUrl() {
    var base = String(window.routerBase || "/");

    if (!base) {
      base = "/";
    }

    if (base.charAt(0) !== "/") {
      base = "/" + base;
    }

    if (base.charAt(base.length - 1) === "/") {
      base = base.slice(0, -1);
    }

    return window.location.origin + base + USER_INFO_API_PATH + "?t=" + Date.now();
  }

  function fetchUserInfo() {
    if (userInfoRequest) {
      return userInfoRequest;
    }

    var authorization = normalizeAuthorization(getAccessToken());
    if (!authorization) {
      return Promise.resolve(null);
    }

    userInfoRequest = window.fetch(buildUserInfoUrl(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Authorization: authorization
      }
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }

        return response.json().catch(function () {
          return null;
        });
      })
      .then(function (payload) {
        if (!payload || payload.status !== "success" || !payload.data) {
          return null;
        }

        return payload.data;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        userInfoRequest = null;
      });

    return userInfoRequest;
  }

  function shouldShowOnCurrentRoute() {
    return isDashboardRoute() && !isAuthRoute();
  }

  function syncModalWithRoute() {
    var onDashboard = shouldShowOnCurrentRoute();

    if (!onDashboard) {
      removeModal();
      lastDashboardState = false;
      return;
    }

    if (!lastDashboardState) {
      fetchUserInfo().then(function (userInfo) {
        if (!shouldShowOnCurrentRoute()) {
          return;
        }

        if (!userInfo || Number(userInfo.plan_id) !== 1) {
          removeModal();
          return;
        }

        window.setTimeout(renderModal, 180);
      });
    }

    lastDashboardState = true;
  }

  document.addEventListener("DOMContentLoaded", syncModalWithRoute);
  window.addEventListener("hashchange", syncModalWithRoute);
  window.addEventListener("popstate", syncModalWithRoute);
  window.setInterval(syncModalWithRoute, POLL_INTERVAL_MS);
  window.setTimeout(syncModalWithRoute, 900);
})();
