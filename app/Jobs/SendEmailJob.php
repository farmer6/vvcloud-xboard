<?php

namespace App\Jobs;

use App\Services\MailService;
use RuntimeException;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected array $params;

    /**
     * 最大尝试次数
     */
    public $tries = 5;

    /**
     * 单次 Job 允许执行的最大秒数（Horizon/Worker timeout 也必须 >= 该值）
     */
    public $timeout = 120;

    /**
     * 失败重试退避（秒）
     * Laravel 支持 int 或数组（指数退避）
     */
    public $backoff = 30;

    /**
     * Create a new job instance.
     */
    public function __construct(array $params, string $queue = 'send_email')
    {
        $this->onQueue($queue);
        $this->params = $params;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $mailLog = MailService::sendEmail($this->params);
        $error = (string) ($mailLog['error'] ?? '');

        if ($error === '') {
            return;
        }

        // Permanent recipient format errors should not be retried.
        if (!$this->isRetryableError($error)) {
            return;
        }

        throw new RuntimeException('Email delivery failed: ' . $error);
    }

    private function isRetryableError(string $error): bool
    {
        $nonRetryablePatterns = [
            'Invalid addresses',
            'non-ASCII characters not supported in local-part of email',
            'Invalid email address format',
        ];

        foreach ($nonRetryablePatterns as $pattern) {
            if (str_contains($error, $pattern)) {
                return false;
            }
        }

        return true;
    }
}
