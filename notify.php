<?php
/**
 * 统一回调转发入口：notify.php
 *
 * 用途：
 *   C -> 这个 PHP 文件 -> Pay Middleware(/api/providers/notify) -> B 订单 & A 商户
 *
 * 使用方法：
 *   1. 上传本文件到站点根目录，例如：
 *        /www/wwwroot/xb-hkaliyun.vv22rei.me/notify.php
 *   2. 在 C 端配置回调 URL：
 *        https://你的域名/notify.php
 *   3. Pay Middleware 内部路由固定为：
 *        /api/providers/notify
 */

// ==================== 配置区 ====================

// Pay Middleware 对外访问的基础地址（一定要能从这个 PHP 所在服务器访问到）
// 可以改成内网或公网地址，例如：
//   - 'https://pay.vv22rei.me'
//   - 'http://127.0.0.1:3100'
$PAY_MIDDLEWARE_BASE = getenv('PAY_MIDDLEWARE_BASE') ?: 'https://pay.vv22rei.me';

// 统一的回调路径（与 Node.js 中的路由保持一致）
$TARGET_NOTIFY_PATH = '/api/providers/notify';

// 超时时间（秒）
$HTTP_TIMEOUT = 10;

// ==================================================

/**
 * 简单写个日志（可选）：出现异常时方便排查
 * 建议确认 php-fpm 用户对该目录有写权限；如果不想记日志，可以把整个函数内容清空。
 */
function notify_log($message, array $context = [])
{
    $logFile = __DIR__ . '/notify.log';
    $ts = date('Y-m-d H:i:s');
    $line = '[' . $ts . '] ' . $message;
    if (!empty($context)) {
        $line .= ' ' . json_encode($context, JSON_UNESCAPED_UNICODE);
    }
    $line .= PHP_EOL;
    @file_put_contents($logFile, $line, FILE_APPEND);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// 只支持 GET / POST（EPay 风格回调就是这两种）
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'method not allowed';
    exit;
}

// 原始参数（EPay 风格：表单 / 查询字符串）
$params = ($method === 'GET') ? $_GET : $_POST;

// 构造要转发到 Pay Middleware 的 URL
$base = rtrim($PAY_MIDDLEWARE_BASE, '/');
$targetUrl = $base . $TARGET_NOTIFY_PATH;

$queryString = http_build_query($params, '', '&');

// GET：把参数拼到 URL 上
if ($method === 'GET' && $queryString !== '') {
    $targetUrl .= (strpos($targetUrl, '?') === false ? '?' : '&') . $queryString;
}

notify_log('proxy start', [
    'method' => $method,
    'target' => $targetUrl,
    'params' => $params,
]);

// 使用 cURL 转发请求到 Pay Middleware
$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);          // 一并拿到响应头和 body，方便透传部分内容
curl_setopt($ch, CURLOPT_TIMEOUT, $HTTP_TIMEOUT);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

// 保留回调方式：POST 就以表单方式转发
$headers = [
    'X-Real-IP: ' . ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'),
    'X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'),
    'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? ''),
    'X-Forwarded-Proto: ' . (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http'
    ),
];

if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $queryString);
    $headers[] = 'Content-Type: application/x-www-form-urlencoded';
} else {
    curl_setopt($ch, CURLOPT_HTTPGET, true);
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    notify_log('proxy error', [
        'error' => $err,
        'errno' => $errno,
    ]);

    // 如果转发失败，统一给 C 端返回 "fail"
    http_response_code(200);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'fail';
    exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

// 拆分响应头和 body
$rawHeader = substr($response, 0, $headerSize);
$body      = substr($response, $headerSize);

// 简单解析一下 Content-Type，其他头可以忽略
$contentType = 'text/plain; charset=utf-8';
foreach (explode("\r\n", $rawHeader) as $line) {
    if (stripos($line, 'Content-Type:') === 0) {
        $contentType = trim(substr($line, strlen('Content-Type:')));
        break;
    }
}

notify_log('proxy done', [
    'status' => $httpCode,
    'body'   => mb_substr($body, 0, 200, 'UTF-8'),
]);

// 把 Pay Middleware 的 HTTP 状态码和内容透传给 C 端
http_response_code($httpCode ?: 200);
header('Content-Type: ' . $contentType);

// EPay/Nomipay 规范通常只关心 body 是 "success" / "fail"
echo $body;