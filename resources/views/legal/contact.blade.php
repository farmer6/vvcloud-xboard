<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact - {{ admin_setting('app_name', 'VVCloud') }}</title>
    <meta name="description" content="{{ admin_setting('app_name', 'VVCloud') }} 联系方式页面。">
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f7f9fc; color: #1f2937; }
        .wrap { max-width: 860px; margin: 0 auto; padding: 36px 20px 56px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04); }
        h1 { margin: 0 0 18px; font-size: 30px; }
        p { margin: 0 0 12px; line-height: 1.75; color: #374151; }
        .contact-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
        a { color: #2563eb; text-decoration: none; }
        .meta { margin-top: 24px; font-size: 13px; color: #6b7280; }
    </style>
</head>
<body>
<main class="wrap">
    <article class="card">
        <h1>Contact</h1>
        <p>如您在注册、订阅、连接质量或计费方面遇到问题，可通过以下方式联系我们：</p>

        <div class="contact-item">
            <strong>Telegram：</strong>
            <a href="https://t.me/vvcloud_official" target="_blank" rel="noopener noreferrer">@vvcloud_official</a>
        </div>

        <div class="contact-item">
            <strong>Email：</strong>
            <a href="mailto:feedback@mail.vv22rei.me">feedback@mail.vv22rei.me</a>
        </div>

        <p>我们建议在反馈中附带问题发生时间、错误提示截图和设备环境，以便更快定位问题。</p>

        <p class="meta">最后更新：{{ date('Y-m-d') }}</p>
        <p class="meta"><a href="/">返回首页</a></p>
    </article>
</main>
</body>
</html>
