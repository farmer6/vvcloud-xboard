<?php

namespace App\Console;

use App\Services\Plugin\PluginManager;
use App\Utils\CacheKey;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Cache;

class Kernel extends ConsoleKernel
{
    /**
     * The Artisan commands provided by your application.
     *
     * @var array
     */
    protected $commands = [
        //
    ];

    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // 每次 schedule:run 写入一次 last_check（通常每分钟一次），开销很小（你缓存走 redis 的话更轻）
        Cache::put(CacheKey::get('SCHEDULE_LAST_CHECK_AT', null), time());

        // v2board
        $schedule->command('xboard:statistics')
            ->dailyAt('0:10')
            ->onOneServer();

        // ---- check（保核心及时性，避免叠加） ----

        // 支付/订单补偿对账：保留每分钟，但避免重叠
        $schedule->command('check:order')
            ->everyMinute()
            ->onOneServer()
            ->withoutOverlapping(2);

        // 佣金：一般不需要分钟级，降到 5 分钟
        $schedule->command('check:commission')
            ->everyFiveMinutes()
            ->onOneServer()
            ->withoutOverlapping(5);

        // 工单：降到 2 分钟
        $schedule->command('check:ticket')
            ->everyTwoMinutes()
            ->onOneServer()
            ->withoutOverlapping(2);

        // ---- reset（通常是维护/修正类任务，不需要每分钟） ----
        // 先保守改成 5 分钟；后续确认无影响再考虑 10 分钟甚至更低频
        $schedule->command('reset:traffic')
            ->everyTwoMinutes()
            ->onOneServer()
            ->withoutOverlapping(5);

        $schedule->command('reset:log')
            ->daily()
            ->onOneServer();

        // ---- send ----
        $schedule->command('send:remindMail', ['--force'])
            ->dailyAt('11:30')
            ->onOneServer();

        // ---- horizon metrics ----
        $schedule->command('horizon:snapshot')
            ->everyFiveMinutes()
            ->onOneServer();

        // ---- online status cleanup ----
        $schedule->command('cleanup:expired-online-status')
            ->everyTwoMinutes()
            ->onOneServer()
            ->withoutOverlapping(4);

        // plugins
        app(PluginManager::class)->registerPluginSchedules($schedule);
    }

    /**
     * Register the commands for the application.
     */
    protected function commands()
    {
        $this->load(__DIR__ . '/Commands');

        try {
            app(PluginManager::class)->initializeEnabledPlugins();
        } catch (\Exception $e) {
        }

        require base_path('routes/console.php');
    }
}