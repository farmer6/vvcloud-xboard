<?php

namespace App\Jobs;

use App\Services\MailService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $params;

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
     *
     * @return void
     */
    public function __construct($params, $queue = 'send_email')
    {
        $this->onQueue($queue);
        $this->params = $params;
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        $mailLog = MailService::sendEmail($this->params);

        // MailService 内部捕获异常并返回 error 字符串。
        // 这里如果 error 非空，我们走“带退避的重试”，避免立刻重入。
        if (!empty($mailLog['error'])) {
            // 释放回队列，使用 backoff 作为延迟
            $this->release($this->backoff);
        }
    }
}