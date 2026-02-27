<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy - {{ admin_setting('app_name', 'VVCloud') }}</title>
    <meta name="description" content="{{ admin_setting('app_name', 'VVCloud') }} 隐私政策页面。">
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f7f9fc; color: #1f2937; }
        .wrap { max-width: 860px; margin: 0 auto; padding: 36px 20px 56px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04); }
        h1 { margin: 0 0 18px; font-size: 30px; }
        h2 { margin: 22px 0 10px; font-size: 20px; }
        p, li { margin: 0 0 12px; line-height: 1.75; color: #374151; }
        ul { padding-left: 20px; margin: 0; }
        a { color: #2563eb; text-decoration: none; }
        .meta { margin-top: 24px; font-size: 13px; color: #6b7280; }
    </style>
</head>
<body>
<main class="wrap">
    <article class="card">
        <h1>Privacy</h1>
        <p>我们重视并保护您的个人信息。本政策用于说明 {{ admin_setting('app_name', 'VVCloud') }} 在提供 VPN 服务过程中如何收集、使用与保护数据。</p>

        <h2>我们收集的数据</h2>
        <ul>
            <li>账号信息：邮箱、加密后的账号凭据。</li>
            <li>服务数据：订阅状态、订单记录、流量统计、设备接入状态。</li>
            <li>技术日志：用于服务稳定性与安全排障的必要日志。</li>
        </ul>

        <h2>我们如何使用数据</h2>
        <ul>
            <li>用于账号注册、登录、订阅开通与客户支持。</li>
            <li>用于服务质量监控、故障排查和反滥用防护。</li>
            <li>用于发送必要的服务通知（如验证码、工单通知）。</li>
        </ul>

        <h2>数据保护与共享</h2>
        <p>我们采用合理的技术与管理措施保护数据安全。除法律要求或为履行服务必须的场景外，我们不会向无关第三方出售您的个人信息。</p>

        <h2>您的权利</h2>
        <p>您可通过联系我们查询、更新或申请删除账户相关信息（受法律与风控要求约束）。</p>

        <p class="meta">最后更新：{{ date('Y-m-d') }}</p>
        <p class="meta"><a href="/">返回首页</a></p>
    </article>
</main>
</body>
</html>
