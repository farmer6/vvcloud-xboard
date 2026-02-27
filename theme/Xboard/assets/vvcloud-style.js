// vvcloud-style.js
(function () {
  var css = `
/* ====== VVCloud n-message 苹果风样式 ====== */

/* 容器位置：下移到屏幕 1/3 */
.n-message-container {
    top: 33vh !important;
    z-index: 99999 !important;
    pointer-events: none !important;
}

/* 动效：进入时淡入 + 上浮 + 轻微缩放 */
.n-message {
    animation: vvcloud-fade-in 0.35s cubic-bezier(.22, .61, .36, 1) forwards,
               vvcloud-slide-up 0.35s cubic-bezier(.22, .61, .36, 1) forwards,
               vvcloud-scale-in 0.35s cubic-bezier(.22, .61, .36, 1) forwards;
}

@keyframes vvcloud-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}

@keyframes vvcloud-slide-up {
    from { transform: translateY(14px); }
    to   { transform: translateY(0); }
}

@keyframes vvcloud-scale-in {
    from { transform: scale(0.94); }
    to   { transform: scale(1); }
}

/* 样式主体（比之前大 20%） */
.n-message {
    position: relative !important;
    background: #ffffff !important;
    color: #1f2937 !important;
    font-size: 19px !important;
    font-weight: 600 !important;
    line-height: 1.65 !important;
    padding: 20px 34px !important;
    border-radius: 22px !important;
    box-shadow: 0 14px 42px rgba(0,0,0,0.20) !important;
    overflow: hidden !important;
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
}

/* 左侧绿色条 */
.n-message::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 6px;
    height: 100%;
    background: #22c55e;
}

/* 底部倒计时条 */
.n-message::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: 0;
    height: 5px;
    width: 100%;
    background: #22c55e;
    transform-origin: left center;
    animation: vvcloud-progress 2.2s linear forwards;
}

@keyframes vvcloud-progress {
    from { transform: scaleX(1); opacity: 1; }
    to   { transform: scaleX(0); opacity: .3; }
}

/* 图标（苹果绿色，放大） */
.n-message__icon {
    font-size: 26px !important;
    color: #22c55e !important;
}

.n-message--success-type {
    background-color: #ffffff !important;
    color: #1f2937 !important;
}

/* ====== VVCloud 品牌 UI：vv-alert 组件 ====== */

.vv-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    border: 1px solid rgba(148, 163, 184, 0.35);
    margin: 14px 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
      "Segoe UI", sans-serif;
}

.vv-alert-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
}

.vv-alert-content {
    flex: 1;
    min-width: 0;
}

.vv-alert-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
    line-height: 1.4;
}

.vv-alert-desc {
    font-size: 14px;
    line-height: 1.7;
    color: #4b5563;
}

/* Error */
.vv-alert-error {
    border-color: rgba(248, 113, 113, 0.45);
    background: linear-gradient(
      to bottom right,
      rgba(254, 242, 242, 0.9),
      #ffffff
    );
}
.vv-alert-error .vv-alert-icon {
    background: #ef4444;
}
.vv-alert-error .vv-alert-title {
    color: #b91c1c;
}

/* Warning */
.vv-alert-warning {
    border-color: rgba(251, 191, 36, 0.55);
    background: linear-gradient(
      to bottom right,
      rgba(255, 251, 235, 0.9),
      #ffffff
    );
}
.vv-alert-warning .vv-alert-icon {
    background: #f59e0b;
}
.vv-alert-warning .vv-alert-title {
    color: #b45309;
}

/* Info */
.vv-alert-info {
    border-color: rgba(59, 130, 246, 0.45);
    background: linear-gradient(
      to bottom right,
      rgba(239, 246, 255, 0.9),
      #ffffff
    );
}
.vv-alert-info .vv-alert-icon {
    background: #3b82f6;
}
.vv-alert-info .vv-alert-title {
    color: #1d4ed8;
}

/* Success */
.vv-alert-success {
    border-color: rgba(34, 197, 94, 0.45);
    background: linear-gradient(
      to bottom right,
      rgba(240, 253, 244, 0.9),
      #ffffff
    );
}
.vv-alert-success .vv-alert-icon {
    background: #22c55e;
}
.vv-alert-success .vv-alert-title {
    color: #15803d;
}
`;

  var style = document.createElement('style');
  style.type = 'text/css';
  style.setAttribute('data-vvcloud-style', 'true');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();
