(function () {
  'use strict';

  // 同时支持 v1 / v2；兼容绝对 URL
  const TARGET_RE = /\/api\/v(1|2)\/passport\/comm\/sendEmailVerify\b/;

  function isTargetUrl(url) {
    try {
      const s = String(url || '');
      return TARGET_RE.test(s);
    } catch (_) {
      return false;
    }
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  const DOMAIN_FIX = {
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'hotnail.com': 'hotmail.com',
    'outllok.com': 'outlook.com',
    'qq.con': 'qq.com',
  };

  function suggestEmail(email) {
    const at = email.lastIndexOf('@');
    if (at < 0) return null;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    const fixed = DOMAIN_FIX[domain];
    if (!fixed) return null;
    return local + '@' + fixed;
  }

  function extractEmailFromBody(body) {
    try {
      if (!body) return null;

      if (typeof body === 'string') {
        const p = new URLSearchParams(body);
        const e1 = p.get('email');
        if (e1) return e1;

        try {
          const j = JSON.parse(body);
          if (j && j.email) return j.email;
        } catch (_) {}
      }

      if (body instanceof URLSearchParams) return body.get('email');
      if (body instanceof FormData) return body.get('email');
      if (typeof body === 'object' && body && body.email) return body.email;
    } catch (_) {}

    return null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  // ===== vv toast =====
  let _toastTimer = null;
  function vvToastError(title, sub) {
    try {
      if (_toastTimer) clearTimeout(_toastTimer);

      // 移除旧 toast
      const old = document.querySelector('.vv-toast');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      const el = document.createElement('div');
      el.className = 'vv-toast';
      el.innerHTML = `
        <div class="vv-toast-icon">×</div>
        <div>
          <div class="vv-toast-title">${escapeHtml(title || '请输入正确邮件地址')}</div>
          ${sub ? `<div class="vv-toast-sub">${escapeHtml(sub)}</div>` : ``}
        </div>
      `;

      document.body.appendChild(el);

      // 自动消失
    const TOAST_DURATION_MS = 3000; // 停留 3 秒
    const TOAST_FADE_MS = 220;      // 淡出 0.22 秒（与 CSS transition 一致）
      _toastTimer = setTimeout(() => {
        el.classList.add('vv-toast-hide');
        setTimeout(() => {
            try { el.remove(); } catch (_) {}
            }, TOAST_FADE_MS);
        }, TOAST_DURATION_MS);
    } catch (_) {}
  }

  // ===== modal =====
  function ensureModal() {
    if (window.vvEmailConfirmModal) return;

    window.vvEmailConfirmModal = function ({ email, suggestion }) {
      return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'vv-modal-mask';

        const modal = document.createElement('div');
        modal.className = 'vv-modal';

        modal.innerHTML = `
          <div class="vv-modal-hd">
            <div class="vv-modal-title">确认邮箱地址</div>
            <button class="vv-modal-close" aria-label="Close">×</button>
          </div>
          <div class="vv-modal-bd">
            <p class="vv-modal-desc">请确认邮箱地址无误后再发送验证码：</p>
            <div class="vv-modal-email">${escapeHtml(email)}</div>

            ${suggestion ? `
            <div class="vv-modal-suggest">
              <div class="vv-kv">
                <b>建议地址</b>
                <div class="vv-modal-email" style="margin:0; border:none; background:transparent; padding:0">
                  ${escapeHtml(suggestion)}
                </div>
              </div>
              <div class="vv-tip">提示：系统检测到常见域名拼写错误，可选择使用建议地址发送。</div>
            </div>` : ``}

            <div class="vv-tip">发送后请到邮箱查看验证码；若邮箱不正确将导致无法注册成功。</div>
          </div>
          <div class="vv-modal-ft">
            <button class="vv-btn vv-btn-danger" data-act="cancel">地址错误，返回修改</button>
            <button class="vv-btn" data-act="send-original">地址正确，发送吧</button>
            ${suggestion ? `<button class="vv-btn vv-btn-primary" data-act="send-suggest">使用建议邮箱发送</button>` : ``}
          </div>
        `;

        mask.appendChild(modal);
        document.body.appendChild(mask);

        const cleanup = (ret) => {
          try { document.body.removeChild(mask); } catch (_) {}
          resolve(ret);
        };

        modal.querySelector('.vv-modal-close').addEventListener('click', () => cleanup({ action: 'cancel' }));
        modal.querySelectorAll('button[data-act]').forEach(btn => {
          btn.addEventListener('click', () => {
            const act = btn.getAttribute('data-act');
            if (act === 'cancel') return cleanup({ action: 'cancel' });
            if (act === 'send-suggest') return cleanup({ action: 'send', finalEmail: suggestion });
            return cleanup({ action: 'send', finalEmail: email });
          });
        });

        const onKey = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            cleanup({ action: 'cancel' });
          }
        };
        document.addEventListener('keydown', onKey, { once: true });
      });
    };
  }

  // ===== XHR hook =====
  function installXhrHook() {
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;

    if (XMLHttpRequest.prototype.__vv_email_verify_hooked) return;
    XMLHttpRequest.prototype.__vv_email_verify_hooked = true;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__vv_url = url;
      return _open.apply(this, arguments);
    };

    function fakeCompleteAs204(xhr) {
      // 用“成功完成”的方式结束请求，让按钮 loading 复位；
      // 同时避免上层把它当成网络错误 => 不会弹“未知错误”
      try {
        Object.defineProperty(xhr, 'status', { value: 204, configurable: true });
        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(xhr, 'responseText', { value: '', configurable: true });
        Object.defineProperty(xhr, 'response', { value: '', configurable: true });
      } catch (_) {}

      try { xhr.dispatchEvent(new Event('readystatechange')); } catch (_) {}
      try { xhr.dispatchEvent(new Event('load')); } catch (_) {}
      try { xhr.dispatchEvent(new Event('loadend')); } catch (_) {}
    }

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      const url = xhr.__vv_url || '';

      if (!isTargetUrl(url)) {
        return _send.call(xhr, body);
      }

      try {
        ensureModal();

        const emailRaw = extractEmailFromBody(body);
        const emailNorm = emailRaw ? normalizeEmail(emailRaw) : null;
        const suggestion = emailNorm ? suggestEmail(emailNorm) : null;

        if (window.vvEmailConfirmModal && emailNorm) {
          window.vvEmailConfirmModal({
            email: emailNorm,
            suggestion: (suggestion && suggestion !== emailNorm) ? suggestion : null
          }).then(res => {
            if (!res || res.action !== 'send') {
              // 1) 给明确错误类型（用于你排查/日志）
              console.warn('[vv-email-verify] VV_EMAIL_VERIFY_CANCELLED: user chose to edit email before sending.');

              // 2) 给用户明确提示：请输入正确邮件地址
              vvToastError('请输入正确邮件地址', '请修改邮箱后重新发送验证码');

              // 3) 结束请求但不触发 abort 语义（避免“未知错误”）
              fakeCompleteAs204(xhr);

              // 4) 尝试把焦点拉回邮箱输入框（尽可能友好）
              try {
                const input = document.querySelector('input[type="email"], input[autocomplete="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="mail"]');
                if (input) input.focus();
              } catch (_) {}
              return;
            }

            const finalEmail = res.finalEmail || emailNorm;

            // 替换 body 中的 email（覆盖已验证可用的几类格式）
            if (finalEmail && emailRaw && normalizeEmail(finalEmail) !== normalizeEmail(emailRaw)) {
              if (typeof body === 'string') {
                const p = new URLSearchParams(body);
                if (p.has('email')) {
                  p.set('email', finalEmail);
                  body = p.toString();
                } else {
                  try {
                    const j = JSON.parse(body);
                    j.email = finalEmail;
                    body = JSON.stringify(j);
                  } catch (_) {}
                }
              } else if (body instanceof URLSearchParams) {
                body.set('email', finalEmail);
              } else if (body instanceof FormData) {
                body.set('email', finalEmail);
              } else if (typeof body === 'object' && body) {
                body.email = finalEmail;
              }
            }

            _send.call(xhr, body);
          });

          return; // 等用户点按钮后再 send
        }

        // 兜底：没解析到 email
        const ok = window.confirm('即将发送验证码邮件，是否继续？');
        if (!ok) {
          console.warn('[vv-email-verify] VV_EMAIL_VERIFY_CANCELLED: email not parsed, user cancelled.');
          vvToastError('请输入正确邮件地址', '请修改邮箱后重新发送验证码');
          fakeCompleteAs204(xhr);
          return;
        }

      } catch (e) {
        console.warn('[vv-email-verify] hook error:', e);
      }

      return _send.call(xhr, body);
    };
  }

  installXhrHook();

})();