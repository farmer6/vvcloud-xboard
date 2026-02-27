<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About - {{ admin_setting('app_name', 'VVCloud') }}</title>
    <meta name="description" content="{{ admin_setting('app_name', 'VVCloud') }} 为注册/订阅用户提供稳定、便捷的 VPN 服务。">
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
        <h1>About</h1>
        <p>{{ admin_setting('app_name', 'VVCloud') }} 是一个面向注册/订阅用户的 VPN 服务平台，致力于提供稳定、可持续、易用的网络连接服务。</p>
        <p>我们关注连接质量、节点可用性与用户体验，提供清晰的订阅管理、设备接入和流量使用能力，帮助用户在合规前提下安全访问互联网资源。</p>

        <h2>我们的服务定位</h2>
        <p>1. 为个人用户提供可靠的跨网络连接方案。</p>
        <p>2. 为订阅用户提供持续的节点维护与故障修复。</p>
        <p>3. 提供透明的套餐、计费和服务说明。</p>

        <h2>服务承诺</h2>
        <p>我们持续优化基础设施并改进平台功能，但不承诺 100% 不间断可用。对于维护窗口、网络波动等情况，我们会尽量提前公告或在合理时间内恢复。</p>

        <p class="meta">最后更新：{{ date('Y-m-d') }}</p>
        <p class="meta"><a href="/">返回首页</a></p>
    </article>
</main>
</body>
</html>
