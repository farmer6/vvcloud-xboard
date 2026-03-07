(function () {
  if (document.getElementById("vvcloud-contact-card")) {
    return;
  }

  var config = window.vvcloudContactConfig || {};
  var fallbackEmail = "feedback@vvcloud.us";
  var fallbackTelegramUrl = "https://t.me/vvcloud_official";
  var fallbackTelegramDisplay = "@vvcloud_official";

  var email = normalizeEmail(config.email) || fallbackEmail;
  var telegramUrl = normalizeUrl(config.telegramUrl) || fallbackTelegramUrl;
  var telegramDisplay = cleanText(config.telegramDisplay) || deriveTelegramDisplay(telegramUrl) || fallbackTelegramDisplay;

  var card = document.createElement("section");
  card.id = "vvcloud-contact-card";
  card.className = "vvcloud-contact-card";
  card.setAttribute("role", "complementary");
  card.setAttribute("aria-label", "联系支持浮动窗口");
  card.innerHTML =
    '<div class="vvcloud-contact-head">' +
      '<p class="vvcloud-contact-title">新手？不会使用？没关系，联系我们0门槛教学!</p>' +
      '<button class="vvcloud-contact-collapse" type="button" aria-label="收起联系窗口">×</button>' +
    "</div>" +
    '<div class="vvcloud-contact-body">' +
      '<p class="vvcloud-contact-desc">遇到任何问题都可以联系我们，我们会尽快协助你。</p>' +
      '<a class="vvcloud-contact-link" href="mailto:' + escapeAttr(email) + '" target="_blank" rel="noopener noreferrer">邮箱：' + escapeHtml(email) + "</a>" +
      '<a class="vvcloud-contact-link" href="' + escapeAttr(telegramUrl) + '" target="_blank" rel="noopener noreferrer">Telegram 群组：' + escapeHtml(telegramDisplay) + "</a>" +
      '<a class="vvcloud-contact-link vvcloud-contact-crisp" href="#" aria-label="点击打开客服在线沟通">点击这里与客服在线沟通</a>' +
    "</div>";

  var toggleButton = document.createElement("button");
  toggleButton.id = "vvcloud-contact-toggle";
  toggleButton.className = "vvcloud-contact-toggle vvcloud-contact-hidden";
  toggleButton.type = "button";
  toggleButton.textContent = "联系我们";
  toggleButton.setAttribute("aria-label", "展开联系窗口");

  document.body.appendChild(card);
  document.body.appendChild(toggleButton);

  var collapseButton = card.querySelector(".vvcloud-contact-collapse");
  var crispLink = card.querySelector(".vvcloud-contact-crisp");

  collapseButton.addEventListener("click", function () {
    setCollapsed(true);
  });

  toggleButton.addEventListener("click", function () {
    setCollapsed(false);
  });

  if (crispLink) {
    crispLink.addEventListener("click", function (event) {
      event.preventDefault();
      openCrispChat();
    });
  }

  setCollapsed(false);

  function setCollapsed(collapsed) {
    if (collapsed) {
      card.classList.add("vvcloud-contact-hidden");
      toggleButton.classList.remove("vvcloud-contact-hidden");
    } else {
      card.classList.remove("vvcloud-contact-hidden");
      toggleButton.classList.add("vvcloud-contact-hidden");
    }
  }

  function openCrispChat() {
    try {
      window.$crisp = window.$crisp || [];
      window.$crisp.push(["do", "chat:show"]);
      window.$crisp.push(["do", "chat:open"]);
    } catch (e) {}
  }

  function normalizeEmail(value) {
    var text = cleanText(value);
    if (!text) return "";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
  }

  function normalizeUrl(value) {
    var text = cleanText(value);
    if (!text) return "";
    return /^(https?:\/\/|tg:\/\/)/i.test(text) ? text : "";
  }

  function deriveTelegramDisplay(url) {
    var value = cleanText(url);
    if (!value) return "";
    var match = value.match(/(?:t\.me\/|telegram\.me\/)([A-Za-z0-9_]+)/i);
    if (!match || !match[1]) return value;
    return "@" + match[1];
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
