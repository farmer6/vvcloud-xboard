<!doctype html>
<html lang="zh-CN">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no" />
  <title>{{$title}}</title>
  <script type="module" crossorigin src="/theme/{{$theme}}/assets/umi.js"></script>
<!-- vvcloud:inject:begin -->
<link rel="stylesheet" href="/vvcloud-custom/vvcloud-nmessage.css">
<script defer src="/vvcloud-custom/vvcloud-crisp.js"></script>
<link rel="stylesheet" href="/vvcloud-custom/vvcloud-contact-float.css">
<script>
  window.vvcloudContactConfig = {
    email: @json('feedback@vvcloud.us'),
    telegramUrl: @json(admin_setting('telegram_discuss_link', 'https://t.me/vvcloud_official')),
    telegramDisplay: @json(admin_setting('telegram_discuss_id', ''))
  };
</script>
<script defer src="/vvcloud-custom/vvcloud-contact-float.js"></script>
<link rel="stylesheet" href="/vvcloud-custom/vvcloud-dashboard-welcome.css">
<script defer src="/vvcloud-custom/vvcloud-dashboard-welcome.js"></script>

<!-- vvcloud:ses-ux:begin -->
<link rel="stylesheet" href="/vvcloud-custom/vvcloud-email-verify-confirm.v2.css">
<script defer src="/vvcloud-custom/vvcloud-email-verify-confirm.v2.js"></script>
<!-- vvcloud:ses-ux:end -->

<!-- vvcloud:inject:end -->
</head>

<body>
  <script>
    window.routerBase = "/";
    window.settings = {
      title: '{{$title}}',
      assets_path: '/theme/{{$theme}}/assets',
      theme: {
        color: '{{ $theme_config['theme_color'] ?? "default" }}',
      },
      version: '{{$version}}',
      background_url: '{{$theme_config['background_url']}}',
      description: '{{$description}}',
      i18n: [
        'zh-CN',
        'en-US',
        'ja-JP',
        'vi-VN',
        'ko-KR',
        'zh-TW',
        'fa-IR'
      ],
      logo: '{{$logo}}'
    }
  </script>
  <style>
    #vvcloud-legal-footer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(6px);
      border-top: 1px solid #e5e7eb;
      padding: 10px 14px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    #vvcloud-legal-footer a {
      color: #2563eb;
      text-decoration: none;
      margin: 0 8px;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      #vvcloud-legal-footer {
        font-size: 11px;
        padding: 8px 10px;
      }
      #vvcloud-legal-footer a {
        margin: 0 5px;
      }
    }
  </style>
  <div id="app"></div>
  <script>
    (function () {
      const footerId = 'vvcloud-legal-footer';
      const footerHtml = function () {
        const year = new Date().getFullYear();
        return '' +
          '<div id="' + footerId + '">' +
            '<a href="/about" target="_blank" rel="noopener noreferrer">About 关于我们</a>' +
            '<a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy 隐私政策</a>' +
            '<a href="/contact" target="_blank" rel="noopener noreferrer">Contact 联系我们</a>' +
            '<a href="/copyright" target="_blank" rel="noopener noreferrer">Copyright 版权信息</a>' +
            '<span>© ' + year + ' {{$title}}. All rights reserved.</span>' +
          '</div>';
      };

      const shouldShow = function () {
        const hash = (window.location.hash || '').toLowerCase();
        return hash.indexOf('#/register') === 0 || hash.indexOf('#/login') === 0;
      };

      const renderFooter = function () {
        const existing = document.getElementById(footerId);
        if (!shouldShow()) {
          if (existing) existing.remove();
          return;
        }
        if (!existing) {
          document.body.insertAdjacentHTML('beforeend', footerHtml());
        }
      };

      window.addEventListener('hashchange', renderFooter);
      document.addEventListener('DOMContentLoaded', renderFooter);
      setTimeout(renderFooter, 500);
    })();
  </script>
</body>

</html>
