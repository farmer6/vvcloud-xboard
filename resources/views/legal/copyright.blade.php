<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copyright - {{ admin_setting('app_name', 'VVCloud') }}</title>
    <meta name="description" content="{{ admin_setting('app_name', 'VVCloud') }} 版权声明页面。">
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f7f9fc; color: #1f2937; }
        .wrap { max-width: 860px; margin: 0 auto; padding: 36px 20px 56px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04); }
        h1 { margin: 0 0 18px; font-size: 30px; }
        h2 { margin: 22px 0 10px; font-size: 20px; }
        p { margin: 0 0 12px; line-height: 1.75; color: #374151; }
        a { color: #2563eb; text-decoration: none; }
        .meta { margin-top: 24px; font-size: 13px; color: #6b7280; }
    </style>
</head>
<body>
<main class="wrap">
    <article class="card">
        <h1>Copyright</h1>
        <p>本网站及相关内容（包括但不限于页面设计、文案、图标、脚本和运营资料）受适用法律保护。</p>

        <h2>版权归属</h2>
        <p>除特别声明外，本站原创内容版权归 {{ admin_setting('app_name', 'VVCloud') }} 或其权利方所有。</p>

        <h2>使用限制</h2>
        <p>未经授权，任何单位或个人不得以复制、传播、镜像、反向工程等方式使用本站受保护内容。</p>

        <h2>侵权反馈</h2>
        <p>如您认为本站内容侵犯您的合法权益，请通过 <a href="mailto:feedback@mail.vv22rei.me">feedback@mail.vv22rei.me</a> 联系我们并提供权属证明，我们将在核实后处理。</p>

        <p class="meta">最后更新：{{ date('Y-m-d') }}</p>
        <p class="meta"><a href="/">返回首页</a></p>
    </article>
</main>
</body>
</html>
