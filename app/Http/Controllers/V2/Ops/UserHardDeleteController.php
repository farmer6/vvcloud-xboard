<?php

namespace App\Http\Controllers\V2\Ops;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UserHardDeleteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class UserHardDeleteController extends Controller
{
    public function __construct(
        private readonly UserHardDeleteService $userHardDeleteService
    ) {
    }

    public function handle(Request $request): JsonResponse
    {
        if ($authError = $this->authorizeRequest($request)) {
            return $authError;
        }

        $request->validate([
            'id' => 'nullable|integer|exists:v2_user,id|required_without:email',
            'email' => 'nullable|email|exists:v2_user,email|required_without:id',
            'reason' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:64',
        ], [
            'id.required_without' => '用户ID或邮箱至少提供一个',
            'id.integer' => '用户ID格式错误',
            'id.exists' => '用户不存在',
            'email.required_without' => '用户ID或邮箱至少提供一个',
            'email.email' => '邮箱格式错误',
            'email.exists' => '用户不存在',
        ]);

        $user = $request->filled('id')
            ? User::find($request->integer('id'))
            : User::where('email', $request->string('email'))->first();

        if (!$user) {
            return $this->fail([400202, '用户不存在']);
        }

        try {
            $result = $this->userHardDeleteService->handle($user);

            Log::info('OPS hard delete user success', [
                'user_id' => $result['user']['id'],
                'email' => $result['user']['email'],
                'source' => $request->input('source', 'unknown'),
                'reason' => $request->input('reason'),
                'ip' => $request->ip(),
            ]);

            return $this->success($result);
        } catch (\Throwable $e) {
            Log::error('OPS hard delete user failed', [
                'user_id' => $request->input('id'),
                'email' => $request->input('email'),
                'source' => $request->input('source', 'unknown'),
                'ip' => $request->ip(),
                'exception' => $e,
            ]);

            return $this->fail([500, '删除失败']);
        }
    }

    private function authorizeRequest(Request $request): ?JsonResponse
    {
        $sharedKey = (string) env('SES_OPS_HARD_DELETE_SHARED_KEY', '');
        if ($sharedKey === '') {
            Log::warning('OPS hard delete endpoint is not configured');
            return $this->fail([500, '运维删除接口未配置']);
        }

        if (!$this->ipAllowed($request->ip())) {
            return $this->fail([403001, '来源IP未授权']);
        }

        $timestamp = $request->header('X-Ops-Timestamp');
        $signature = $request->header('X-Ops-Signature');

        if (!$timestamp || !$signature || !ctype_digit((string) $timestamp)) {
            return $this->fail([401001, '签名缺失或格式错误']);
        }

        $ttl = (int) env('SES_OPS_HARD_DELETE_TTL', 300);
        if ($ttl < 1) {
            $ttl = 300;
        }

        if (abs(time() - (int) $timestamp) > $ttl) {
            return $this->fail([401001, '签名已过期']);
        }

        $expectedSignature = hash_hmac('sha256', $this->buildCanonicalString($request, (string) $timestamp), $sharedKey);
        $receivedSignature = $this->normalizeSignature((string) $signature);

        if (!hash_equals($expectedSignature, $receivedSignature)) {
            return $this->fail([401001, '签名校验失败']);
        }

        return null;
    }

    private function ipAllowed(?string $ip): bool
    {
        $allowList = array_values(array_filter(array_map(
            static fn(string $value): string => trim($value),
            explode(',', (string) env('SES_OPS_HARD_DELETE_ALLOWED_IPS', ''))
        )));

        if ($allowList === []) {
            return true;
        }

        return in_array((string) $ip, $allowList, true);
    }

    private function buildCanonicalString(Request $request, string $timestamp): string
    {
        $bodyHash = hash('sha256', $request->getContent() ?: '');

        return implode("\n", [
            strtoupper($request->method()),
            '/' . ltrim($request->path(), '/'),
            $timestamp,
            $bodyHash,
        ]);
    }

    private function normalizeSignature(string $signature): string
    {
        $signature = trim($signature);

        if (str_starts_with($signature, 'sha256=')) {
            return substr($signature, 7);
        }

        return $signature;
    }
}
