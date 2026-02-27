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
  <div id="app"></div>
  {!! $theme_config['custom_html'] !!}
</body>

</html>
